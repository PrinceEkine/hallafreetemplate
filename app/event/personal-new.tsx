import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { DatePicker } from '../../components/DatePicker';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TimePicker } from '../../components/TimePicker';
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
import { createPersonalEvent } from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { supabase } from '../../lib/supabase';

function todayIso(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export default function NewPersonalEvent() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState('9:00 AM');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
    });
  }, []);

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      const scoped = await resolveSelectedCommunityId().catch(() => null);
      await createPersonalEvent({ title, date, time, communityId: scoped });
      router.replace('/events');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="TO DO" />
      <Screen>
        <Heading>My to-do event</Heading>
        {signedIn === null ? (
          <Subtext>Checking session…</Subtext>
        ) : !signedIn ? (
          <Subtext>You must be signed in.</Subtext>
        ) : (
          <>
            <Subtext>Only you can see this event. No banner needed.</Subtext>
            <Field
              label="TITLE (OPTIONAL)"
              placeholder="Call the bank"
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.label}>DATE</Text>
            <DatePicker value={date} onChange={setDate} />
            <Text style={styles.label}>TIME</Text>
            <TimePicker value={time} onChange={setTime} />
            <ErrorText message={error} />
            <Button
              title="Create to-do"
              loading={loading}
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
});
}
