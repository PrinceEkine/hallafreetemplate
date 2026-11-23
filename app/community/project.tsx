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
  deleteProject,
  isCommunityAdmin,
  listProjects,
  setProjectStatus,
  type ProjectItem,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';

function statusColors(pal: ThemeColors): Record<ProjectItem['status'], string> {
  return {
    planning: pal.warning,
    active: pal.ink,
    done: pal.primary,
  };
}

const NEXT_STATUS: Record<ProjectItem['status'], ProjectItem['status'] | null> = {
  planning: 'active',
  active: 'done',
  done: null,
};

export default function Projects() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shownItems = (items ?? []).filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.description.toLowerCase().includes(needle),
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
          `projects:${id}`,
          () =>
            Promise.all([listProjects(id), isCommunityAdmin(id)]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open projects once online to save them.');
        return;
      }
      const [page, adminFlag] = bundle;
      setItems(page.projects);
      setUnsupported(page.unsupported);
      setAdmin(adminFlag);
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

  async function handleAdvance(item: ProjectItem) {
    const next = NEXT_STATUS[item.status];
    if (!next) return;
    try {
      await setProjectStatus(item.id, next);
      setItems((prev) =>
        (prev ?? []).map((p) =>
          p.id === item.id ? { ...p, status: next } : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.');
    }
  }

  function confirmDelete(item: ProjectItem) {
    Alert.alert('Delete project?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProject(item.id);
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
      <ScreenHeader title="PROJECTS" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <ErrorText message={error} />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search projects"
          />
        </View>
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : unsupported ? (
          <EmptyState
            icon="briefcase"
            title="Projects are not set up yet"
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
                icon="briefcase"
                title="No projects yet"
                body={
                  admin
                    ? 'Create the first project for this community.'
                    : 'Projects will appear here once admins create them.'
                }
                actionTitle={admin ? 'New project' : undefined}
                onAction={
                  admin
                    ? () =>
                        router.push({
                          pathname: '/community/project-new',
                          params: { id: id ?? '' },
                        })
                    : undefined
                }
              />
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors(c)[item.status] },
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.description}>{item.description}</Text>
                ) : null}
                <Text style={styles.meta}>
                  Started {timeAgo(item.created_at)}
                </Text>
                {admin && (
                  <View style={styles.cardBtns}>
                    {NEXT_STATUS[item.status] && (
                      <Pressable onPress={() => handleAdvance(item)}>
                        <Text style={styles.advance}>
                          MOVE TO {NEXT_STATUS[item.status]!.toUpperCase()}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => confirmDelete(item)}>
                      <Text style={styles.delete}>DELETE</Text>
                    </Pressable>
                  </View>
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
                pathname: '/community/project-new',
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
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: c.paper, borderRadius: radius.m, padding: 16 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: c.text },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', color: c.paper },
  description: {
    fontSize: 14,
    color: c.text,
    marginTop: 8,
    lineHeight: 21,
  },
  meta: { fontSize: 12, color: c.subtext, marginTop: 8 },
  cardBtns: { flexDirection: 'row', gap: 20, marginTop: 12 },
  advance: { fontSize: 13, fontWeight: '800', color: c.primary },
  delete: { fontSize: 13, fontWeight: '800', color: c.danger },
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
