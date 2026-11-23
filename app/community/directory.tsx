import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  Avatar,
  EmptyState,
  SearchField,
  SectionTitle,
} from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Field } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { useColors } from '../../lib/theme';
import {
  approveMember,
  findInviteUserByEmail,
  findInviteUserByPhone,
  getCommunityBasics,
  isCommunityAdmin,
  listCommunityMembers,
  sendCommunityInvite,
  setMemberRole,
  type CommunityBasics,
  type MemberEntry,
} from '../../lib/communityContent';
import { inviteLink } from '../../lib/invites';
import { supabase } from '../../lib/supabase';

const PAGE = 60;

export default function Directory() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [basics, setBasics] = useState<CommunityBasics | null>(null);
  const [admin, setAdmin] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [members, setMembers] = useState<MemberEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviting, setInviting] = useState<'email' | 'phone' | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (reset: boolean) => {
      if (!id) return;
      if (reset) offsetRef.current = 0;
      // The default first page is cached for offline; search and deeper
      // pages always read live.
      const liveOnly =
        !reset || debounced.trim().length > 0 || offsetRef.current > 0;
      const fetchPage = () =>
        Promise.all([
          listCommunityMembers(id, {
            search: debounced,
            limit: PAGE,
            offset: offsetRef.current,
          }),
          isCommunityAdmin(id),
          getCommunityBasics(id),
          supabase.auth.getUser(),
        ]);
      try {
        const bundle = liveOnly
          ? await fetchPage()
          : (
              await resolveWithCache(`directory:${id}`, fetchPage, {
                ttlMs: CACHE_TTL.communities,
              })
            ).value;
        if (!bundle) {
          setError(
            'You are offline. Open this directory once online to save it.',
          );
          return;
        }
        const [page, adminFlag, basicsData, auth] = bundle;
        offsetRef.current += page.members.length;
        setMembers((prev) =>
          reset || !prev ? page.members : [...prev, ...page.members],
        );
        setHasMore(page.hasMore);
        setAdmin(adminFlag);
        setBasics(basicsData);
        setMyId(auth.data.user?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load.');
      }
    },
    [id, debounced],
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function onLoadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await load(false);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleApprove(userId: string) {
    if (!id) return;
    setError(null);
    try {
      await approveMember(id, userId);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve.');
    }
  }

  async function handleRole(member: MemberEntry, role: 'admin' | 'member') {
    if (!id) return;
    setError(null);
    try {
      await setMemberRole(id, member.userId, role);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.');
    }
  }

  function handleInvite() {
    if (!basics) return;
    Share.share({
      message: `Join ${basics.name} on Ophixe! Invite code: ${basics.invite_code}`,
    }).catch(() => {});
  }

  function inviteMessage(): string | null {
    if (!basics) return null;
    return (
      `Join ${basics.name} on Ophixe! ` +
      `Tap to join: ${inviteLink(basics.invite_code)} ` +
      `(or enter code ${basics.invite_code} in the app).`
    );
  }

  /** Registered users also get the invite in-app; everyone gets the link. */
  async function inviteRegistered(
    kind: 'email' | 'phone',
    value: string,
  ): Promise<'invited' | 'unknown'> {
    if (!id) return 'unknown';
    const userId =
      kind === 'email'
        ? await findInviteUserByEmail(id, value).catch(() => null)
        : await findInviteUserByPhone(id, value).catch(() => null);
    if (!userId) return 'unknown';
    try {
      await sendCommunityInvite(id, userId);
      return 'invited';
    } catch (err) {
      // Already pending counts as invited: the notification is waiting.
      if (/already invited/i.test(err instanceof Error ? err.message : '')) {
        return 'invited';
      }
      throw err;
    }
  }

  async function handleInviteByEmail() {
    if (!id || inviting) return;
    setError(null);
    const address = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    const message = inviteMessage();
    if (!message || !basics) return;
    setInviting('email');
    try {
      const inApp = await inviteRegistered('email', address);
      const subject = encodeURIComponent(`Join ${basics.name} on Ophixe`);
      await Linking.openURL(
        `mailto:${address}?subject=${subject}&body=${encodeURIComponent(message)}`,
      );
      setInviteEmail('');
      Alert.alert(
        'Invitation ready',
        inApp === 'invited'
          ? 'They were notified in the app — send the email to deliver their join link too.'
          : 'Send the email to deliver their join link.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open the mail app.',
      );
    } finally {
      setInviting(null);
    }
  }

  async function handleInviteByPhone() {
    if (!id || inviting) return;
    setError(null);
    const digits = invitePhone.replace(/\D/g, '');
    if (digits.length < 7) {
      setError('Enter a valid phone number.');
      return;
    }
    const message = inviteMessage();
    if (!message) return;
    setInviting('phone');
    try {
      const inApp = await inviteRegistered('phone', invitePhone.trim());
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(
        `sms:${encodeURIComponent(invitePhone.trim())}${sep}body=${encodeURIComponent(message)}`,
      );
      setInvitePhone('');
      Alert.alert(
        'Invitation ready',
        inApp === 'invited'
          ? 'They were notified in the app — send the text to deliver their join link too.'
          : 'Send the text to deliver their join link.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open messages.',
      );
    } finally {
      setInviting(null);
    }
  }

  const pending = (members ?? []).filter((m) => m.status === 'pending');
  const active = (members ?? []).filter((m) => m.status !== 'pending');

  return (
    <>
      <ScreenHeader title="DIRECTORY" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <FlatList
          data={active}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.ink}
            />
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.community}>{basics?.name ?? '…'}</Text>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search members"
              />
              <ErrorText message={error} />
              {admin && (
                <>
                  <SectionTitle>INVITE MEMBER</SectionTitle>
                  <Button
                    title="Show QR code"
                    variant="outline"
                    onPress={() => setShowQr(true)}
                  />
                  <Text style={styles.or}>OR INVITE VIA EMAIL</Text>
                  <Field
                    label="EMAIL ADDRESS"
                    placeholder="adaeze@company.com"
                    keyboardType="email-address"
                    autoComplete="email"
                    autoCapitalize="none"
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                  />
                  <Button
                    title="Invite by email"
                    loading={inviting === 'email'}
                    onPress={handleInviteByEmail}
                  />
                  <Text style={styles.or}>OR INVITE VIA PHONE NUMBER</Text>
                  <Field
                    label="PHONE NUMBER"
                    placeholder="0803 123 4567"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    value={invitePhone}
                    onChangeText={setInvitePhone}
                  />
                  <Button
                    title="Invite by SMS"
                    loading={inviting === 'phone'}
                    onPress={handleInviteByPhone}
                  />
                </>
              )}
              {admin && pending.length > 0 && (
                <>
                  <SectionTitle>PENDING APPROVAL</SectionTitle>
                  {pending.map((m) => (
                    <View key={m.userId} style={styles.row}>
                      <Avatar name={m.name} size={44} uri={m.avatarUrl} />
                      <View style={styles.mid}>
                        <Text style={styles.name}>{m.name}</Text>
                        <Text style={styles.role}>REQUESTED TO JOIN</Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleApprove(m.userId)}
                      >
                        <Text style={styles.approve}>APPROVE</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              <SectionTitle>{`MEMBERS (${active.length})`}</SectionTitle>
              {members === null && (
                <ActivityIndicator
                  style={styles.loader}
                  color={c.ink}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            members !== null ? (
              <EmptyState
                icon="people"
                title="No members found"
                body={
                  query
                    ? 'Nobody matches that search.'
                    : 'Invite people with the community code.'
                }
                actionTitle="Invite member"
                onAction={handleInvite}
              />
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/member/[id]',
                  params: { id: item.userId, community: id },
                })
              }
            >
              <Avatar name={item.name} size={44} uri={item.avatarUrl} />
              <View style={styles.mid}>
                <Text style={styles.name}>
                  {item.name}
                  {item.userId === myId ? ' (you)' : ''}
                </Text>
                {item.tag ? (
                  <View style={styles.roleRow}>
                    <Text style={styles.membershipTag}>
                      {item.tag.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rightCol}>
                <Text
                  style={[
                    styles.membershipTag,
                    (item.role === 'admin' || item.role === 'owner') &&
                      styles.membershipTagHot,
                  ]}
                >
                  {item.role.toUpperCase()}
                </Text>
                {admin && item.userId !== myId && item.role !== 'owner' && (
                  <Pressable
                    hitSlop={8}
                    style={[
                      styles.adminToggle,
                      item.role === 'admin' && styles.adminToggleOn,
                    ]}
                    onPress={() =>
                      handleRole(
                        item,
                        item.role === 'admin' ? 'member' : 'admin',
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.adminToggleText,
                        item.role === 'admin' && styles.adminToggleTextOn,
                      ]}
                    >
                      {item.role === 'admin' ? 'REMOVE ADMIN' : 'MAKE ADMIN'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            hasMore ? (
              <Button
                title={loadingMore ? 'Loading…' : 'Load more'}
                variant="outline"
                onPress={onLoadMore}
              />
            ) : undefined
          }
        />
      </View>
      <Modal
        visible={showQr}
        transparent
        onRequestClose={() => setShowQr(false)}
      >
        <View style={styles.qrOverlay}>
          <Pressable
            style={styles.qrBackdrop}
            onPress={() => setShowQr(false)}
          />
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>{basics?.name ?? 'Community'}</Text>
            <Text style={styles.qrHint}>Scan to join automatically</Text>
            {basics ? (
              <View style={styles.qrBox}>
                <QRCode value={inviteLink(basics.invite_code)} size={220} />
              </View>
            ) : null}
            <Text style={styles.qrCode}>{basics?.invite_code ?? ''}</Text>
            <Pressable hitSlop={8} onPress={() => setShowQr(false)}>
              <Text style={styles.qrClose}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  list: { padding: 16 },
  loader: { marginTop: 24 },
  community: { fontSize: 15, fontWeight: '800', color: c.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  mid: { flex: 1 },
  rightCol: { alignItems: 'flex-end', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: c.text },
  roleRow: { flexDirection: 'row', marginTop: 4, gap: 6 },
  role: { fontSize: 12, color: c.subtext, marginTop: 2 },
  membershipTag: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  membershipTagHot: {
    backgroundColor: c.ink,
    color: c.paper,
    borderWidth: 0,
  },
  adminToggle: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  adminToggleOn: { backgroundColor: c.ink, borderColor: c.ink },
  adminToggleText: { fontSize: 12, fontWeight: '800', color: c.subtext },
  adminToggleTextOn: { color: c.paper },
  approve: { fontSize: 13, fontWeight: '800', color: c.primary },
  or: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
    textAlign: 'center',
    marginVertical: 12,
  },
  searchLoader: { marginVertical: 12 },
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  qrBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  qrCard: {
    backgroundColor: c.paper,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
  },
  qrHint: { fontSize: 12, color: c.subtext, marginTop: 4 },
  qrBox: { backgroundColor: '#fff', padding: 12, marginTop: 16 },
  qrCode: {
    fontSize: 20,
    fontWeight: '800',
    color: c.ink,
    letterSpacing: 2,
    marginTop: 12,
  },
  qrClose: {
    fontSize: 13,
    fontWeight: '800',
    color: c.primary,
    marginTop: 16,
  },
});
}
