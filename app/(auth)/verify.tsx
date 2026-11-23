import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Button, ErrorText, Heading, Screen, Subtext } from '../../components/ui';
import {
  isSupabaseConfigured,
  saveProfileName,
  sendOtp,
  verifyOtp,
} from '../../lib/supabase';
import { shouldShowLegalAccept } from '../../lib/legal';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';

export default function Verify() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { phone, mode, name } = useLocalSearchParams<{
    phone?: string;
    mode?: string;
    name?: string;
  }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const demo = !isSupabaseConfigured();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleVerify(raw?: string) {
    const value = (raw ?? code).trim();
    setError(null);
    if (value.length < 4) {
      setError('Enter the code we sent you.');
      return;
    }
    if (!phone) {
      setError('Missing phone number. Go back and try again.');
      return;
    }
    setLoading(true);
    try {
      if (!demo) {
        await verifyOtp(phone, value);
        if (mode === 'signup' && name) await saveProfileName(name);
      }
      if (await shouldShowLegalAccept().catch(() => false)) {
        router.replace('/legal/accept');
        return;
      }
      router.replace('/feed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/[^\d]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !loading && !demo) {
      void handleVerify(digits);
    }
  }

  async function handleResend() {
    setError(null);
    if (!phone) {
      setError('Missing phone number. Go back and try again.');
      return;
    }
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      if (!demo) await sendOtp(phone);
      setSent(true);
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <Heading>Check your SMS</Heading>
      <Subtext>
        {demo
          ? 'Demo mode (no Supabase keys yet) — enter any code to continue.'
          : `We sent a 6-digit code to ${phone ?? 'your phone'}.`}
      </Subtext>
      <TextInput
        style={styles.code}
        placeholder="------"
        placeholderTextColor={c.subtext}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => handleVerify()}
        value={code}
        onChangeText={handleCodeChange}
      />
      {sent && !error ? (
        <Subtext>Code sent. It can take a minute to arrive.</Subtext>
      ) : null}
      <ErrorText message={error} />
      <Button title="Verify" loading={loading} onPress={() => handleVerify()} />
      <Button
        title={cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
        variant="outline"
        loading={resending}
        onPress={handleResend}
      />
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  code: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    marginTop: 24,
    paddingVertical: 16,
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    color: c.text,
  },
});
}
