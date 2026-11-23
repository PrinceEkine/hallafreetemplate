import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, ErrorText, Heading, Screen, Subtext } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { createDm } from '../../lib/chat';
import { listCommunityMembers } from '../../lib/communityContent';
import { listMyCommunities } from '../../lib/communities';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { supabase } from '../../lib/supabase';

type Person = { id: string; name: string; communityId: string };

export default function NewChat() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [scoped, setScoped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const selected = await resolveSelectedCommunityId().catch(() => null);
        setScoped(selected);
        if (!selected) {
          setPeople([]);
          return;
        }
        const mine = await listMyCommunities().catch((): never[] => []);
        setCommunityName(mine.find((it) => it.id === selected)?.name ?? '');
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const page = await listCommunityMembers(selected, { limit: 200 });
        setPeople(
          page.members
            .filter((m) => m.status === 'active' && m.userId !== user?.id)
            .map((m) => ({
              id: m.userId,
              name: m.name,
              communityId: selected,
            })),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not load members.',
        );
        setPeople([]);
      }
    })();
  }, []);

  async function handlePick(person: Person) {
    setError(null);
    setBusy(true);
    try {
      const conversationId = await createDm(person.id, person.communityId);
      router.replace({
        pathname: '/chat/[id]',
        params: { id: conversationId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start chat.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW CHAT" />
      <Screen>
        <Heading>Start a chat</Heading>
        <Subtext>
          {scoped
            ? `People in ${communityName || 'your community'}.`
            : 'Join a community first to find people to chat with.'}
        </Subtext>
        <Button
          title="New group instead"
          variant="outline"
          onPress={() => router.push('/chat/group-new')}
        />
        {people === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : people.length === 0 ? (
          <Subtext>
            {scoped
              ? 'No other members in this community yet.'
              : 'Join a community first to find people to chat with.'}
          </Subtext>
        ) : (
          <View style={styles.list}>
            {people.map((p) => (
              <Pressable
                key={p.id}
                style={styles.row}
                disabled={busy}
                onPress={() => handlePick(p)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.mid}>
                  <Text style={styles.name}>{p.name.toUpperCase()}</Text>
                  <Text style={styles.meta}>{communityName}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <ErrorText message={error} />
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  list: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: c.ink },
  mid: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: c.text },
  meta: { fontSize: 13, color: c.subtext, marginTop: 2 },
});
}
