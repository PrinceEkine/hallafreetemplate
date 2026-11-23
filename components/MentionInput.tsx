import { useEffect, useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  listCommunityMembers,
  type MemberEntry,
} from '../lib/communityContent';
import { Field } from './ui';
import { supabase } from '../lib/supabase';

function tokenBeforeCursor(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([A-Za-z0-9_.]{1,30})$/);
  if (!match || typeof match.index !== 'number') return null;
  return { start: match.index, query: match[1] };
}

/**
 * Multiline composer with @mention autocomplete: typing @name pops a
 * suggestion list of community members; picking one inserts @Firstname,
 * which the submit path resolves into a tag notification.
 */
export function MentionInput({
  label,
  placeholder,
  value,
  onChangeText,
  communityId,
  numberOfLines = 5,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  communityId: string | null;
  numberOfLines?: number;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  useEffect(() => {
    if (!communityId) {
      setMembers([]);
      return;
    }
    let alive = true;
    (async () => {
      const [{ data }, page] = await Promise.all([
        supabase.auth.getUser(),
        listCommunityMembers(communityId, { limit: 200 }).catch(() => ({
          members: [],
          hasMore: false,
        })),
      ]);
      if (!alive) return;
      setMyId(data.user?.id ?? null);
      setMembers(page.members.filter((m) => m.status === 'active'));
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);

  const token =
    selection.start === selection.end
      ? tokenBeforeCursor(value, selection.start)
      : null;
  const suggestions = token
    ? members
        .filter((m) => m.userId !== myId)
        .filter((m) =>
          m.name.toLowerCase().includes(token.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  function insert(member: MemberEntry) {
    if (!token) return;
    const first = member.name.trim().split(/\s+/)[0] || member.name;
    const next =
      value.slice(0, token.start) +
      `@${first} ` +
      value.slice(selection.start);
    const cursor = token.start + first.length + 2;
    onChangeText(next);
    setSelection({ start: cursor, end: cursor });
  }

  return (
    <View>
      <Field
        label={label}
        placeholder={placeholder}
        multiline
        numberOfLines={numberOfLines}
        value={value}
        onChangeText={onChangeText}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
      />
      {suggestions.length > 0 ? (
        <View style={styles.suggestBox}>
          <FlatList
            data={suggestions}
            keyExtractor={(m) => m.userId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.suggestRow}
                onPress={() => insert(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.trim().slice(0, 1).toUpperCase() || '•'}
                  </Text>
                </View>
                <Text style={styles.suggestName}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  suggestBox: {
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    marginTop: -8,
    marginBottom: 8,
    maxHeight: 220,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: c.ink },
  suggestName: { fontSize: 14, fontWeight: '700', color: c.text },
});
}
