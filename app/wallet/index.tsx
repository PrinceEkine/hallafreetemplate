import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import {
  ErrorText,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { useColors } from '../../lib/theme';
import { timeAgo } from '../../lib/format';
import {
  getCommunityBasics,
  isCommunityAdmin,
  type CommunityBasics,
} from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import {
  claimDuePaid,
  formatNaira,
  listDuePayers,
  listPendingClaims,
  myDues,
  myPendingClaimDueIds,
  reviewTransferClaim,
  type Due,
  type DuePayer,
  type TransferClaim,
} from '../../lib/wallet';

function Section({ title }: { title: string }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return <Text style={styles.section}>{title}</Text>;
}

export default function Wallet() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [basics, setBasics] = useState<CommunityBasics | null>(null);
  const [dues, setDues] = useState<Due[]>([]);
  const [claims, setClaims] = useState<TransferClaim[]>([]);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [expandedDue, setExpandedDue] = useState<string | null>(null);
  const [payers, setPayers] = useState<Record<string, DuePayer[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const scoped = await resolveSelectedCommunityId().catch(() => null);
    if (!scoped) {
      setBasics(null);
      setDues([]);
      setClaims([]);
      setClaimed(new Set());
      setIsAdmin(false);
      setReady(true);
      return;
    }
    try {
      const bundle = (
        await resolveWithCache(
          `wallet:${scoped}`,
          () =>
            Promise.all([
              getCommunityBasics(scoped),
              myDues(scoped),
              myPendingClaimDueIds(scoped),
              isCommunityAdmin(scoped).catch(() => false),
            ]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open the wallet once online to save it.');
        setReady(true);
        return;
      }
      const [basicsData, duesData, claimIds, adminFlag] = bundle;
      setBasics(basicsData);
      setDues(duesData);
      setClaimed(new Set(claimIds));
      setIsAdmin(adminFlag);
      setClaims(
        adminFlag ? await listPendingClaims(scoped).catch(() => []) : [],
      );
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
      setReady(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleClaim(due: Due) {
    setError(null);
    setBusy(true);
    try {
      await claimDuePaid(due.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewClaim(id: string, status: 'confirmed' | 'rejected') {
    setError(null);
    setBusy(true);
    try {
      await reviewTransferClaim(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePayers(due: Due) {
    if (expandedDue === due.id) {
      setExpandedDue(null);
      return;
    }
    setExpandedDue(due.id);
    if (payers[due.id]) return;
    try {
      const list = await listDuePayers(due.id);
      setPayers((prev) => ({ ...prev, [due.id]: list }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payers.');
    }
  }

  const hasAccount = !!basics?.accountNumber;

  return (
    <>
      <ScreenHeader title="WALLET" showMenu backTo="/feed" />
      <OfflineBanner />
      <Screen>
        {!ready ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : !basics ? (
          <Subtext>Join a community to see its dues.</Subtext>
        ) : (
          <>
            <View style={styles.accountCard}>
              <Text style={styles.accountLabel}>COMMUNITY ACCOUNT</Text>
              {hasAccount ? (
                <>
                  <Text style={styles.accountNumber}>
                    {basics.accountNumber}
                  </Text>
                  <Text style={styles.accountMeta}>
                    {basics.accountName}
                    {basics.bankName ? ` • ${basics.bankName}` : ''}
                  </Text>
                  <Text style={styles.accountHint}>
                    Pay by bank transfer, then tap I&apos;ve paid on your due.
                  </Text>
                </>
              ) : (
                <Text style={styles.accountHint}>
                  {isAdmin
                    ? 'No account set yet. Add it so members can pay.'
                    : 'No account set yet. Ask a community admin.'}
                </Text>
              )}
              {isAdmin && (
                <Pressable
                  style={styles.accountBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/community/edit',
                      params: { id: basics.id },
                    })
                  }
                >
                  <Text style={styles.accountBtnText}>
                    {hasAccount ? 'CHANGE ACCOUNT' : 'SET ACCOUNT'}
                  </Text>
                </Pressable>
              )}
            </View>

            <ErrorText message={error} />

            <View style={styles.duesHead}>
              <Heading>Community dues</Heading>
              {isAdmin && (
                <Pressable onPress={() => router.push('/wallet/due-new')}>
                  <Text style={styles.newDue}>+ NEW</Text>
                </Pressable>
              )}
            </View>
            <Subtext>Dues in {basics.name}</Subtext>
            {dues.length === 0 ? (
              <Subtext>No dues in this community right now.</Subtext>
            ) : (
              dues.map((d) => (
                <View key={d.id}>
                  <View style={styles.row}>
                    <View style={styles.mid}>
                      <Text style={styles.rowTitle}>{d.title}</Text>
                      <Text style={styles.rowMeta}>
                        {d.communityName} • {formatNaira(d.amount_kobo)}
                      </Text>
                    </View>
                    {isAdmin && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleTogglePayers(d)}
                      >
                        <Text style={styles.paidList}>
                          {expandedDue === d.id ? 'HIDE' : 'PAID LIST'}
                        </Text>
                      </Pressable>
                    )}
                    {d.paid ? (
                      <Text style={styles.paid}>PAID</Text>
                    ) : claimed.has(d.id) ? (
                      <Text style={styles.claimed}>CLAIMED…</Text>
                    ) : (
                      <Pressable disabled={busy} onPress={() => handleClaim(d)}>
                        <Text style={styles.pay}>I&apos;VE PAID</Text>
                      </Pressable>
                    )}
                  </View>
                  {isAdmin && expandedDue === d.id && (
                    <View style={styles.payerBox}>
                      {(payers[d.id] ?? []).length === 0 ? (
                        <Text style={styles.rowMeta}>
                          Nobody has paid this yet.
                        </Text>
                      ) : (
                        (payers[d.id] ?? []).map((p) => (
                          <View key={p.userId} style={styles.payerRow}>
                            <Text style={styles.rowTitle}>{p.name}</Text>
                            <Text style={styles.paidTag}>PAID</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              ))
            )}

            {isAdmin && claims.length > 0 && (
              <>
                <Section title="PENDING CONFIRMATIONS" />
                {claims.map((it) => (
                  <View key={it.id} style={styles.row}>
                    <View style={styles.mid}>
                      <Text style={styles.rowTitle}>
                        {it.memberName} • {it.dueTitle}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatNaira(it.amount_kobo)} • {timeAgo(it.created_at)}
                      </Text>
                    </View>
                    <View style={styles.reviewBtns}>
                      <Pressable
                        disabled={busy}
                        onPress={() => handleReviewClaim(it.id, 'confirmed')}
                      >
                        <Text style={styles.pay}>CONFIRM</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => handleReviewClaim(it.id, 'rejected')}
                      >
                        <Text style={styles.reject}>REJECT</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  accountCard: {
    backgroundColor: c.ink,
    borderRadius: radius.l,
    padding: 20,
  },
  accountLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B9B9BE',
    letterSpacing: 1,
  },
  accountNumber: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: c.paper,
    marginTop: 8,
    letterSpacing: 1,
  },
  accountMeta: { fontSize: 14, color: c.paper, marginTop: 4 },
  accountHint: { fontSize: 13, color: '#B9B9BE', marginTop: 8, lineHeight: 19 },
  accountBtn: {
    marginTop: 14,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
  },
  accountBtnText: { fontSize: 13, fontWeight: '800', color: c.ink },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
  },
  duesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  newDue: { fontSize: 13, fontWeight: '800', color: c.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  mid: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  rowMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  paid: { fontSize: 12, fontWeight: '800', color: c.primary },
  claimed: { fontSize: 12, fontWeight: '800', color: c.warning },
  paidList: { fontSize: 12, fontWeight: '800', color: c.subtext },
  payerBox: {
    backgroundColor: c.bg,
    borderRadius: radius.m,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  payerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paidTag: {
    backgroundColor: c.primary,
    color: c.paper,
    fontWeight: '800',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pay: { fontSize: 13, fontWeight: '800', color: c.primary },
  reject: { fontSize: 13, fontWeight: '800', color: c.danger },
  reviewBtns: { flexDirection: 'row', gap: 12 },
});
}
