import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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
import { ErrorText } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { isCommunityAdmin } from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';
import {
  listCommunityMySubmissions,
  listCommunityPendingApprovals,
  reviewSubmission,
  type Submission,
} from '../../lib/forms';

function statusColors(pal: ThemeColors): Record<Submission['status'], string> {
  return {
    pending: pal.warning,
    approved: pal.primary,
    rejected: pal.danger,
  };
}

export default function Approvals() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [admin, setAdmin] = useState(false);
  const [items, setItems] = useState<Submission[] | null>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shownItems = (items ?? []).filter(
    (s) =>
      !needle ||
      s.typeTitle.toLowerCase().includes(needle) ||
      s.submitterName.toLowerCase().includes(needle) ||
      s.status.toLowerCase().includes(needle),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `approvals:${id}`,
          async () => {
            const adminFlag = await isCommunityAdmin(id);
            const items = adminFlag
              ? await listCommunityPendingApprovals(id)
              : await listCommunityMySubmissions(id);
            return { adminFlag, items };
          },
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open this list once online to save it.');
        return;
      }
      setAdmin(bundle.adminFlag);
      setItems(bundle.items);
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

  async function handleReview(item: Submission, status: 'approved' | 'rejected') {
    setError(null);
    setBusyId(item.id);
    try {
      await reviewSubmission(item.id, status, '');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review.');
    } finally {
      setBusyId(null);
    }
  }

  function openDetail(item: Submission) {
    router.push({ pathname: '/forms/[id]', params: { id: item.id } });
  }

  return (
    <>
      <ScreenHeader title={admin ? 'APPROVALS' : 'REQUESTS'} communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <ErrorText message={error} />
        <View
          style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search requests"
          />
        </View>
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
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
            ListHeaderComponent={
              <SectionTitle>
                {admin ? 'PENDING REQUESTS' : 'MY REQUESTS HERE'}
              </SectionTitle>
            }
            ListEmptyComponent={
              <EmptyState
                icon="checkmark-circle"
                title={admin ? 'Inbox zero' : 'Nothing here yet'}
                body={
                  admin
                    ? 'No requests waiting for your decision.'
                    : 'Requests you file in this community will appear here.'
                }
                actionTitle={admin ? undefined : 'Fill form'}
                onAction={
                  admin ? undefined : () => router.push('/forms/new')
                }
              />
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => openDetail(item)}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: statusColors(c)[item.status] },
                  ]}
                />
                <View style={styles.mid}>
                  <Text style={styles.title}>{item.typeTitle}</Text>
                  <Text style={styles.meta}>
                    {item.submitterName} • {timeAgo(item.created_at)}
                  </Text>
                </View>
                {admin && item.status === 'pending' ? (
                  <View style={styles.quick}>
                    <Pressable
                      disabled={busyId === item.id}
                      onPress={() => handleReview(item, 'approved')}
                    >
                      <Text style={styles.approve}>
                        {busyId === item.id ? '…' : 'APPROVE'}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busyId === item.id}
                      onPress={() => handleReview(item, 'rejected')}
                    >
                      <Text style={styles.reject}>REJECT</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.status}>
                    {item.status.toUpperCase()}
                  </Text>
                )}
              </Pressable>
            )}
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
  dot: { width: 12, height: 12, borderRadius: 6 },
  mid: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text },
  meta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  status: { fontSize: 11, fontWeight: '800', color: c.subtext },
  quick: { flexDirection: 'row', gap: 14 },
  approve: { fontSize: 13, fontWeight: '800', color: c.primary },
  reject: { fontSize: 13, fontWeight: '800', color: c.danger },
});
}
