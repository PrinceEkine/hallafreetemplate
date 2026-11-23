import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  EmptyState,
  SearchField,
  SectionTitle,
} from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { Button, ErrorText } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  createPoll,
  isCommunityAdmin,
  listPolls,
  type PollSummary,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';

export default function Polls() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [admin, setAdmin] = useState(false);
  const [items, setItems] = useState<PollSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `polls:${id}`,
          async () => {
            const adminFlag = await isCommunityAdmin(id);
            const page = await listPolls(id);
            return { adminFlag, page };
          },
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open polls once online to save them.');
        return;
      }
      setAdmin(bundle.adminFlag);
      setItems(bundle.page.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  async function handleCreate() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const pollId = await createPoll(id, question, options);
      setQuestion('');
      setOptions(['', '']);
      setCreating(false);
      await load();
      router.push({
        pathname: '/community/poll/[id]',
        params: { id: pollId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create poll.');
    } finally {
      setBusy(false);
    }
  }

  function openPoll(poll: PollSummary) {
    router.push({ pathname: '/community/poll/[id]', params: { id: poll.id } });
  }

  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (p: PollSummary) =>
    !needle || p.question.toLowerCase().includes(needle);
  const open = (items ?? []).filter((p) => !p.closed && matches(p));
  const closed = (items ?? []).filter((p) => p.closed && matches(p));

  function renderRow(poll: PollSummary) {
    return (
      <Pressable style={styles.row} onPress={() => openPoll(poll)}>
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={2}>
            {poll.question}
          </Text>
          <Text style={styles.meta}>
            {poll.voteCount} vote{poll.voteCount === 1 ? '' : 's'} •{' '}
            {timeAgo(poll.created_at)}
            {poll.voted ? ' • VOTED' : ''}
          </Text>
        </View>
        <Text style={styles.status}>
          {poll.closed ? 'CLOSED' : poll.voted ? '✓' : 'VOTE'}
        </Text>
      </Pressable>
    );
  }

  return (
    <>
      <ScreenHeader
        title="POLLS"
        communityId={id ?? null}
        showMenu
        backTo="/feed"
      />
      <OfflineBanner />
      <View style={styles.page}>
        <ErrorText message={error} />
        <View
          style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search polls"
          />
        </View>
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (
          <FlatList
            data={open}
            keyExtractor={(item) => item.id}
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
                {admin ? (
                  creating ? (
                    <View style={styles.form}>
                      <Text style={styles.formTitle}>NEW POLL</Text>
                      <TextInput
                        placeholder="Ask a question"
                        placeholderTextColor={c.subtext}
                        style={styles.input}
                        value={question}
                        onChangeText={setQuestion}
                        multiline
                      />
                      {options.map((opt, i) => (
                        <View key={i} style={styles.optionRow}>
                          <TextInput
                            placeholder={`Option ${i + 1}`}
                            placeholderTextColor={c.subtext}
                            style={[styles.input, styles.optionInput]}
                            value={opt}
                            onChangeText={(v) => setOption(i, v)}
                          />
                          {options.length > 2 ? (
                            <Pressable
                              hitSlop={8}
                              onPress={() =>
                                setOptions((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                            >
                              <Text style={styles.remove}>✕</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {options.length < 6 ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            setOptions((prev) => [...prev, ''])
                          }
                        >
                          <Text style={styles.addOption}>+ ADD OPTION</Text>
                        </Pressable>
                      ) : null}
                      <Button
                        title="Ask poll"
                        loading={busy}
                        onPress={handleCreate}
                      />
                      <Pressable
                        hitSlop={8}
                        onPress={() => setCreating(false)}
                      >
                        <Text style={styles.cancel}>CANCEL</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      hitSlop={8}
                      onPress={() => setCreating(true)}
                      style={styles.newWrap}
                    >
                      <Text style={styles.newPoll}>+ NEW POLL</Text>
                    </Pressable>
                  )
                ) : null}
                {open.length > 0 ? (
                  <SectionTitle>OPEN POLLS</SectionTitle>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                icon="bar-chart"
                title="No open polls"
                body={
                  closed.length > 0
                    ? 'All polls are closed. Past results are below.'
                    : 'Polls from your admins will appear here.'
                }
              />
            }
            renderItem={({ item }) => renderRow(item)}
            ListFooterComponent={
              closed.length > 0 ? (
                <View>
                  <SectionTitle>CLOSED</SectionTitle>
                  {closed.map((poll) => (
                    <View key={poll.id}>{renderRow(poll)}</View>
                  ))}
                </View>
              ) : undefined
            }
          />
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  loader: { marginTop: 40 },
  list: { padding: 16, paddingTop: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  mid: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text },
  meta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  status: { fontSize: 11, fontWeight: '800', color: c.primary },
  newWrap: { alignItems: 'flex-end', paddingVertical: 8 },
  newPoll: { fontSize: 13, fontWeight: '800', color: c.primary },
  form: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    gap: 8,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: c.text,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionInput: { flex: 1 },
  remove: { fontSize: 14, fontWeight: '800', color: c.danger },
  addOption: { fontSize: 12, fontWeight: '800', color: c.primary },
  cancel: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    textAlign: 'center',
    marginTop: 4,
  },
});
}
