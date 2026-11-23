import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EmptyState, SearchField } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { ErrorText } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  deleteTask,
  isCommunityAdmin,
  listTasks,
  setTaskStatus,
  type TaskItem,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';

type Filter = 'all' | 'open' | 'in_progress' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'open', label: 'OPEN' },
  { id: 'in_progress', label: 'IN PROGRESS' },
  { id: 'done', label: 'DONE' },
];

function nextStatus(status: TaskItem['status']): TaskItem['status'] {
  if (status === 'open') return 'in_progress';
  if (status === 'in_progress') return 'done';
  return 'open';
}

export default function Tasks() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shownItems = (items ?? []).filter(
    (t) =>
      !needle ||
      t.title.toLowerCase().includes(needle) ||
      t.detail.toLowerCase().includes(needle) ||
      (t.assigneeNames ?? []).some((n) => n.toLowerCase().includes(needle)),
  );
  const [unsupported, setUnsupported] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `tasks:${id}:${filter}`,
          () =>
            Promise.all([
              listTasks(id, { status: filter }),
              isCommunityAdmin(id),
            ]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open tasks once online to save them.');
        return;
      }
      const [page, adminFlag] = bundle;
      setItems(page.tasks);
      setUnsupported(page.unsupported);
      setAdmin(adminFlag);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id, filter]);

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

  async function handleToggle(item: TaskItem) {
    const next = nextStatus(item.status);
    try {
      await setTaskStatus(item.id, next);
      setItems((prev) =>
        (prev ?? []).map((t) =>
          t.id === item.id ? { ...t, status: next } : t,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.');
    }
  }

  function confirmDelete(item: TaskItem) {
    Alert.alert('Delete task?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(item.id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  return (
    <>
      <ScreenHeader title="TASKS" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, filter === f.id && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  filter === f.id && styles.chipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ErrorText message={error} />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search tasks"
          />
        </View>
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : unsupported ? (
          <EmptyState
            icon="list"
            title="Tasks are not set up yet"
            body="Ask your admin to apply the latest database update, then pull to refresh."
          />
        ) : (
          <FlatList
            data={shownItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="checkbox"
                title="No tasks"
                body={
                  admin
                    ? 'Create the first task for this community.'
                    : 'Nothing assigned right now.'
                }
                actionTitle={admin ? 'New task' : undefined}
                onAction={
                  admin
                    ? () =>
                        router.push({
                          pathname: '/community/task-new',
                          params: { id: id ?? '' },
                        })
                    : undefined
                }
              />
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Pressable
                  hitSlop={8}
                  onPress={() => handleToggle(item)}
                >
                  <Ionicons
                    name={
                      item.status === 'done'
                        ? 'checkmark-circle'
                        : item.status === 'in_progress'
                          ? 'time-outline'
                          : 'ellipse-outline'
                    }
                    size={26}
                    color={
                      item.status === 'done'
                        ? c.primary
                        : item.status === 'in_progress'
                          ? c.warning
                          : c.subtext
                    }
                  />
                </Pressable>
                <View style={styles.mid}>
                  <Text
                    style={[
                      styles.title,
                      item.status === 'done' && styles.titleDone,
                    ]}
                  >
                    {item.title}
                  </Text>
                  {item.detail ? (
                    <Text style={styles.detail} numberOfLines={2}>
                      {item.detail}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {item.status === 'in_progress' ? 'IN PROGRESS • ' : ''}
                    {(item.assigneeNames ?? []).length > 0
                      ? `${item.assigneeNames.join(', ')} • `
                      : item.assigneeName
                        ? `${item.assigneeName} • `
                        : ''}
                    {item.due_date ? `Due ${item.due_date} • ` : ''}
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
                {admin && (
                  <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                    <Ionicons name="trash-outline" size={20} color={c.danger} />
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
        {admin && !unsupported && (
          <Pressable
            style={styles.fab}
            onPress={() =>
              router.push({
                pathname: '/community/task-new',
                params: { id: id ?? '' },
              })
            }
          >
            <Ionicons name="add" size={28} color={c.paper} />
          </Pressable>
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  loader: { marginTop: 40 },
  chips: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 12, fontWeight: '700', color: c.ink },
  chipTextActive: { color: c.paper },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
    gap: 12,
  },
  mid: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text },
  titleDone: {
    textDecorationLine: 'line-through',
    color: c.subtext,
  },
  detail: { fontSize: 13, color: c.text, marginTop: 4, lineHeight: 19 },
  meta: { fontSize: 12, color: c.subtext, marginTop: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
