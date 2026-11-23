import { router } from 'expo-router';
import { useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { supabase } from '../../lib/supabase';

export default function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="CHANGE PASSWORD" />
      <Screen>
        <Heading>New password</Heading>
        <Subtext>Choose a password with at least 6 characters.</Subtext>
        <Field
          label="NEW PASSWORD"
          placeholder="6+ characters"
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
        <Field
          label="CONFIRM PASSWORD"
          placeholder="Repeat password"
          secureTextEntry
          autoComplete="new-password"
          value={confirm}
          onChangeText={setConfirm}
        />
        <ErrorText message={error} />
        <Button title="Save password" loading={loading} onPress={handleSave} />
      </Screen>
    </>
  );
}
