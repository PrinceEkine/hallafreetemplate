import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Avatar,
  EmptyState,
  SearchField,
} from '../../components/premium';
import { OfflineBanner } from '../../components/OfflineBanner';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorText } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  listPublicCommunities,
  requestToJoin,
  type PublicCommunity,
} from '../../lib/communityContent';

function ruleLabel(rule: string): string {
  if (rule === 'anyone') return 'OPEN';
  if (rule === 'invite') return 'INVITE ONLY';
  return 'REQUEST TO JOIN';
}

export default function Discover() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<PublicCommunity[] | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setItems(await listPublicCommunities(debounced));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [debounced]);

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

  async function handleJoin(item: PublicCommunity) {
    if (item.rule === 'invite') {
      router.push('/community/join');
      return;
    }
    setError(null);
    setBusyId(item.id);
    try {
      const status = await requestToJoin(item.id);
      if (status === 'active') {
        router.replace({
          pathname: '/community/[id]',
          params: { id: item.id },
        });
      } else {
        setRequested((prev) => new Set(prev).add(item.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ScreenHeader title="DISCOVER" />
      <View style={styles.page}>
        <OfflineBanner />
        <View style={styles.searchWrap}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search communities"
          />
        </View>
        <Pressable
          style={styles.codeRow}
          onPress={() => router.push('/community/join')}
          accessibilityLabel="Join with invite code"
        >
          <Text style={styles.codeText}>
            Looking for a private community? Join with an invite code
          </Text>
        </Pressable>
        <ErrorText message={error} />
        <FlatList
          data={items ?? []}
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
            items === null ? (
              <Text style={styles.loading}>Finding communities…</Text>
            ) : (
              <EmptyState
                icon="compass"
                title="Nothing to discover"
                body="Every public community is already yours, or none match that search."
                actionTitle="Join with invite code"
                onAction={() => router.push('/community/join')}
              />
            )
          }
          renderItem={({ item }) => {
            const isRequested = requested.has(item.id);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Avatar name={item.name} size={48} />
                  <View style={styles.mid}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text
                      style={styles.description}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.description
                        ? item.description.length > 80
                          ? `${item.description.slice(0, 80)}…`
                          : `${item.description} …`
                        : ruleLabel(item.rule)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={[
                    styles.joinBtn,
                    isRequested && styles.joinBtnDone,
                  ]}
                  disabled={isRequested || busyId === item.id}
                  onPress={() => handleJoin(item)}
                >
                  <Text
                    style={[
                      styles.joinText,
                      isRequested && styles.joinTextDone,
                    ]}
                  >
                    {isRequested
                      ? 'REQUESTED'
                      : busyId === item.id
                        ? 'JOINING…'
                        : item.rule === 'anyone'
                          ? 'JOIN'
                          : item.rule === 'invite'
                            ? 'ENTER INVITE CODE'
                            : 'REQUEST TO JOIN'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  searchWrap: { padding: 16, paddingBottom: 4 },
  codeRow: { paddingHorizontal: 16, paddingBottom: 8 },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.subtext,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  loading: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
  },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  card: { backgroundColor: c.paper, borderRadius: radius.m, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mid: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: c.text },
  rule: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    color: c.text,
    marginTop: 8,
    lineHeight: 20,
  },
  joinBtn: {
    marginTop: 12,
    backgroundColor: c.ink,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
  },
  joinBtnDone: { backgroundColor: c.bg },
  joinText: { fontSize: 14, fontWeight: '800', color: c.paper },
  joinTextDone: { color: c.subtext },
});
}
