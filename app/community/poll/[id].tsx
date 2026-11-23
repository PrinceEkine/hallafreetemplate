import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Button, ErrorText } from '../../../components/ui';
import { type ThemeColors } from '../../../constants/theme';
import { useColors } from '../../../lib/theme';
import {
  closePoll,
  getPoll,
  isCommunityAdmin,
  votePoll,
  type PollDetail,
} from '../../../lib/communityContent';
import { timeAgo } from '../../../lib/format';

export default function PollDetailScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await getPoll(id);
      setPoll(detail);
      if (detail) setAdmin(await isCommunityAdmin(detail.communityId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleVote(optionId: string) {
    if (!id || !poll || poll.closed) return;
    setError(null);
    setBusy(true);
    try {
      await votePoll(id, optionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not vote.');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (!id) return;
    Alert.alert('Close poll?', 'Members can no longer vote, but results stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setBusy(true);
          try {
            await closePoll(id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not close.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <ScreenHeader
        title="POLL"
        communityId={poll?.communityId ?? null}
        showMenu
        backTo={poll ? `/community/polls?id=${poll.communityId}` : null}
      />
      <ScrollView style={styles.page} contentContainerStyle={styles.body}>
        <ErrorText message={error} />
        {!poll ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (
          <>
            <Text style={styles.question}>{poll.question}</Text>
            <Text style={styles.meta}>
              {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'} •{' '}
              {timeAgo(poll.created_at)}
              {poll.closed ? ' • CLOSED' : ''}
            </Text>
            {poll.options.map((opt) => {
              const pct =
                poll.totalVotes > 0
                  ? Math.round((opt.votes / poll.totalVotes) * 100)
                  : 0;
              const mine = poll.myOptionId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  disabled={poll.closed || busy}
                  onPress={() => handleVote(opt.id)}
                  style={[styles.option, mine && styles.optionMine]}
                >
                  <View style={styles.optionHead}>
                    <Text style={styles.optionLabel} numberOfLines={2}>
                      {mine ? '✓ ' : ''}
                      {opt.label}
                    </Text>
                    <Text style={styles.optionPct}>{pct}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.optionVotes}>
                    {opt.votes} vote{opt.votes === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              );
            })}
            {!poll.closed && !poll.myOptionId ? (
              <Text style={styles.hint}>Tap an option to vote.</Text>
            ) : null}
            {!poll.closed && poll.myOptionId ? (
              <Text style={styles.hint}>
                Tap another option to change your vote.
              </Text>
            ) : null}
            {admin && !poll.closed ? (
              <Button
                title="Close poll"
                variant="outline"
                loading={busy}
                onPress={handleClose}
              />
            ) : null}
            <Pressable hitSlop={8} onPress={() => router.back()}>
              <Text style={styles.back}>← BACK TO POLLS</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  body: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 40 },
  question: { fontSize: 20, fontWeight: '800', color: c.text },
  meta: { fontSize: 12, color: c.subtext, marginTop: 4, marginBottom: 16 },
  option: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  optionMine: { borderColor: c.primary, borderWidth: 2 },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
  optionPct: { fontSize: 14, fontWeight: '800', color: c.primary },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.card,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
  optionVotes: { fontSize: 11, color: c.subtext, marginTop: 4 },
  hint: { fontSize: 13, color: c.subtext, marginTop: 4 },
  back: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    marginTop: 16,
  },
});
}
