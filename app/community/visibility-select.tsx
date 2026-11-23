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
import { Button } from '../../components/ui';
import type { ThemeColors } from '../../constants/theme';
import {
  listCommunityMembers,
  type MemberEntry,
} from '../../lib/communityContent';
import { setPendingMemberSelection } from '../../lib/pendingSelection';
import { useColors } from '../../lib/theme';

/**
 * Full-page member picker for the "Select members" visibility option.
 * Opened from Files (new folder + change visibility); the pick returns
 * through the pending-selection handoff when focus goes back.
 * Params: id (community), context (handoff key), selected (csv user ids).
 */
export default function VisibilitySelect() {
  const { id, context, selected } = useLocalSearchParams<{
    id?: string;
    context?: string;
    selected?: string;
  }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [members, setMembers] = useState<MemberEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>(
    (selected ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );

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

  function toggle(userId: string) {
    setPicked((prev) =>
      prev.includes(userId)
        ? prev.filter((v) => v !== userId)
        : [...prev, userId],
    );
  }

  function save() {
    setPendingMemberSelection({ context: context ?? 'visibility', ids: picked });
    router.back();
  }

  return (
    <>
      <ScreenHeader title="SELECT MEMBERS" />
      <View style={styles.page}>
        <View style={styles.searchRow}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search members"
          />
        </View>
        <Text style={styles.count}>
          {picked.length} selected — only they can see it
        </Text>
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
              <Pressable style={styles.row} onPress={() => toggle(item.userId)}>
                <Avatar name={item.name} size={44} uri={item.avatarUrl} />
                <View style={styles.mid}>
                  <Text style={styles.name}>{item.name.toUpperCase()}</Text>
                  <Text style={styles.sub}>{item.role.toUpperCase()}</Text>
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
          <Button title={`Done (${picked.length})`} onPress={save} />
        </View>
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: c.paper },
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
