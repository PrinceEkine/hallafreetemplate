import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
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
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  listCommunityMembers,
  type MemberEntry,
} from '../../lib/communityContent';
import {
  setPendingAssignees,
  type AssigneePick,
} from '../../lib/taskAssignee';

export default function TaskAssign() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [members, setMembers] = useState<MemberEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!id) {
      setMembers([]);
      return;
    }
    listCommunityMembers(id, { limit: 200 })
      .then((page) =>
        setMembers(page.members.filter((m) => m.status === 'active')),
      )
      .catch(() => setMembers([]));
  }, [id]);

  const needle = query.trim().toLowerCase();
  const data = (members ?? []).filter(
    (m) => !needle || m.name.toLowerCase().includes(needle),
  );

  function toggle(member: MemberEntry) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(member.userId)) next.delete(member.userId);
      else next.set(member.userId, member.name);
      return next;
    });
  }

  function done() {
    const picks: AssigneePick[] = [...selected.entries()].map(
      ([userId, name]) => ({ userId, name }),
    );
    setPendingAssignees(picks);
    router.back();
  }

  return (
    <>
      <ScreenHeader
        title="ASSIGN TASK"
        action={{
          label: selected.size > 0 ? `DONE (${selected.size})` : 'DONE',
          onPress: done,
        }}
      />
      <View style={styles.page}>
        <View style={styles.searchRow}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search members"
          />
        </View>
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
            const checked = selected.has(item.userId);
            return (
              <Pressable style={styles.row} onPress={() => toggle(item)}>
                <Avatar name={item.name} size={44} uri={item.avatarUrl} />
                <View style={styles.mid}>
                  <Text style={styles.name}>{item.name.toUpperCase()}</Text>
                  <Text style={styles.sub}>{item.role.toUpperCase()}</Text>
                </View>
                <View
                  style={[styles.check, checked && styles.checkOn]}
                >
                  {checked ? (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={c.paper}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  searchRow: { padding: 16, paddingBottom: 8 },
  list: { paddingVertical: 8 },
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
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: c.ink, borderColor: c.ink },
});
}
