import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Avatar, EmptyState, SearchField } from '../../components/premium';
import { Button, ErrorText } from '../../components/ui';
import type { ThemeColors } from '../../constants/theme';
import {
  isCommunityOwner,
  listCommunityMembers,
  setSupportMember,
  type MemberEntry,
} from '../../lib/communityContent';
import { useColors } from '../../lib/theme';

/**
 * Owner-only roster page: tick members to list them under ADMINS &
 * SUPPORT on the contact page. Support staff keep their normal role;
 * they just appear as contacts anyone in the community can message.
 */
export default function ContactAdd() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [members, setMembers] = useState<MemberEntry[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setMembers([]);
      setAllowed(false);
      return;
    }
    (async () => {
      const owner = await isCommunityOwner(id).catch(() => false);
      setAllowed(owner);
      if (!owner) {
        setMembers([]);
        return;
      }
      try {
        const page = await listCommunityMembers(id, { limit: 200 });
        // Admins/owners are already contacts via the staff list (the owner
        // toggles them on the contact page); the roster is for members.
        const active = page.members.filter(
          (m) =>
            m.status === 'active' &&
            m.role !== 'admin' &&
            m.role !== 'owner',
        );
        setMembers(active);
        const flagged = active
          .filter((m) => m.isSupport)
          .map((m) => m.userId);
        setPicked(flagged);
        setInitial(flagged);
      } catch {
        setMembers([]);
      }
    })();
  }, [id]);

  const needle = query.trim().toLowerCase();
  const data = (members ?? []).filter(
    (m) => !needle || m.name.toLowerCase().includes(needle),
  );

  function toggle(userId: string) {
    setPicked((prev) =>
      prev.includes(userId)
        ? prev.filter((v) => v !== userId)
        : [...prev, userId],
    );
  }

  async function save() {
    if (!id || busy) return;
    setError(null);
    setBusy(true);
    try {
      const before = new Set(initial);
      const after = new Set(picked);
      const jobs: Promise<void>[] = [];
      for (const userId of picked) {
        if (!before.has(userId)) jobs.push(setSupportMember(id, userId, true));
      }
      for (const userId of initial) {
        if (!after.has(userId)) {
          jobs.push(setSupportMember(id, userId, false));
        }
      }
      await Promise.all(jobs);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="ADD SUPPORT" />
      <View style={styles.page}>
        {allowed === false ? (
          <Text style={styles.denied}>
            Only the community owner can manage support.
          </Text>
        ) : (
          <>
            <View style={styles.searchRow}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search members"
              />
            </View>
            <Text style={styles.count}>
              {picked.length} selected — ticked members appear as support
            </Text>
            <ErrorText message={error} />
            <FlatList
              data={data}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                members === null ? (
                  <ActivityIndicator style={styles.loader} color={c.ink} />
                ) : (
                  <EmptyState
                    icon="search-outline"
                    title="No matches"
                    body="Try a different name."
                  />
                )
              }
              renderItem={({ item }) => {
                const on = picked.includes(item.userId);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => toggle(item.userId)}
                  >
                    <Avatar name={item.name} size={44} uri={item.avatarUrl} />
                    <View style={styles.mid}>
                      <Text style={styles.name}>{item.name.toUpperCase()}</Text>
                      <Text style={styles.sub}>
                        {item.isSupport && !on
                          ? 'SUPPORT • UNTICKED'
                          : item.role.toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={on ? c.ink : c.subtext}
                    />
                  </Pressable>
                );
              }}
            />
            <View style={styles.footer}>
              <Button
                title={`Save support (${picked.length})`}
                loading={busy}
                onPress={save}
              />
            </View>
          </>
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: c.paper },
    denied: {
      fontSize: 14,
      color: c.subtext,
      textAlign: 'center',
      marginTop: 40,
      paddingHorizontal: 32,
      lineHeight: 21,
    },
    searchRow: { padding: 16, paddingBottom: 4 },
    count: {
      fontSize: 12,
      fontWeight: '700',
      color: c.subtext,
      letterSpacing: 1,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    list: { paddingBottom: 16 },
    loader: { marginTop: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
    },
    mid: { flex: 1 },
    name: { fontSize: 15, fontWeight: '800', color: c.text },
    sub: { fontSize: 12, color: c.subtext, marginTop: 2 },
    footer: {
      padding: 16,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
  });
}
