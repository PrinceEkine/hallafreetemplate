import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { createGroup } from '../../lib/chat';
import {
  isCommunityAdmin,
  listCommunityMembers,
  type MemberEntry,
} from '../../lib/communityContent';
import { listMyCommunities } from '../../lib/communities';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { supabase } from '../../lib/supabase';

export default function NewGroup() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { communityId, members } = useLocalSearchParams<{
    communityId?: string;
    members?: string;
  }>();
  // A member profile can deep-link here with someone preselected.
  const preselect = useMemo(
    () =>
      typeof members === 'string'
        ? members
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    [members],
  );
  const [picked, setPicked] = useState<string | null>(
    typeof communityId === 'string' ? communityId : null,
  );
  const [communityName, setCommunityName] = useState('');
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState<MemberEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const mine = await listMyCommunities().catch((): never[] => []);
        const stored = await resolveSelectedCommunityId().catch(() => null);
        const param =
          typeof communityId === 'string' &&
          mine.some((it) => it.id === communityId)
            ? communityId
            : null;
        const scoped = param ?? stored;
        setPicked(scoped);
        setCommunityName(mine.find((it) => it.id === scoped)?.name ?? '');
        if (scoped) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const page = await listCommunityMembers(scoped, { limit: 200 });
          const active = page.members.filter(
            (m) => m.status === 'active' && m.userId !== user?.id,
          );
          setPeople(active);
          const valid = new Set(active.map((m) => m.userId));
          setSelected(new Set(preselect.filter((id) => valid.has(id))));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not load members.',
        );
      } finally {
        setReady(true);
      }
    })();
  }, [communityId]);

  useEffect(() => {
    setSelected(new Set(preselect));
  }, [picked, preselect]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    if (!picked) {
      setError('Join or create a community first, then come back.');
      return;
    }
    if (name.trim().length < 1) {
      setError('Give the group a name.');
      return;
    }
    if (!(await isCommunityAdmin(picked).catch(() => false))) {
      setError('Only community admins can create groups.');
      return;
    }
    setBusy(true);
    try {
      const conversationId = await createGroup(picked, name, [...selected]);
      router.replace({
        pathname: '/chat/[id]',
        params: { id: conversationId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setBusy(false);
    }
  }

  const candidates = people;

  return (
    <>
      <ScreenHeader title="NEW GROUP" />
      <Screen>
        <Heading>Create a group</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !picked ? (
          <Subtext>
            Join or create a community first, then come back to create a
            group.
          </Subtext>
        ) : (
          <>
            <Subtext>
              Group chats belong to one community
              {communityName ? ` — creating in ${communityName}` : ''}.
            </Subtext>
            <Field
              label="GROUP NAME"
              placeholder="Site Engineers"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.label}>
              ADD PEOPLE ({selected.size} SELECTED)
            </Text>
            <Subtext>
              Pick people now, or create an empty group and add them later
              from Group info.
            </Subtext>
            {candidates.length === 0 ? (
              <Subtext>No other members in this community yet.</Subtext>
            ) : (
              candidates.map((p) => (
                <Pressable
                  key={p.userId}
                  style={styles.row}
                  onPress={() => toggle(p.userId)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{p.name.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.name}>{p.name.toUpperCase()}</Text>
                  <Ionicons
                    name={
                      selected.has(p.userId)
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={24}
                    color={
                      selected.has(p.userId) ? c.primary : c.subtext
                    }
                  />
                </Pressable>
              ))
            )}
            <ErrorText message={error} />
            <Button
              title="Create group"
              loading={busy}
              onPress={handleCreate}
            />
          </>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: c.ink },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
});
}
