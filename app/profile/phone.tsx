import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import {
  getMyPhone,
  isSupabaseConfigured,
  normalizePhone,
  saveMyPhone,
  supabase,
} from '../../lib/supabase';
import { setCachedPhone } from '../../lib/session';

export default function AddPhone() {
  const demo = !isSupabaseConfigured();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const editing = mode === 'edit';
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (demo) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const existing = await getMyPhone();
      if (existing) {
        setPhone(existing);
        if (!editing) router.replace('/feed');
      }
    })();
  }, [demo, editing]);

  async function handleSave() {
    setError(null);
    let e164: string;
    try {
      e164 = normalizePhone(phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter a valid phone number.');
      return;
    }
    if (demo) {
      router.replace('/feed');
      return;
    }
    setLoading(true);
    try {
      await saveMyPhone(e164);
      await setCachedPhone(e164);
      if (editing) {
        router.back();
      } else {
        router.replace('/feed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="ADD PHONE NUMBER" />
      <Screen>
        <Heading>One more step</Heading>
        <Subtext>
          Add your phone number so your company can reach you. Number
          verification is coming soon.
        </Subtext>
        <Field
          label="PHONE NUMBER"
          placeholder="0803 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
        />
        <ErrorText message={error} />
        <Button title="Continue" loading={loading} onPress={handleSave} />
      </Screen>
    </>
  );
}
