import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  Button,
  ErrorText,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  getMyPhone,
  resendSignupEmail,
  supabase,
  verifyEmailOtp,
} from '../../lib/supabase';
import {
  recordLegalAcceptance,
  shouldShowLegalAccept,
} from '../../lib/legal';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ConfirmEmail() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const params = useLocalSearchParams<{
    email?: string;
    code?: string;
    token_hash?: string;
  }>();
  const email = first(params.email);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const code = first(params.code);
    const tokenHash = first(params.token_hash);
    if (!code && !tokenHash) return;
    let alive = true;
    (async () => {
      setVerifying(true);
      try {
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'signup',
          });
          if (verifyError) throw verifyError;
        }
        if (alive) {
          await recordLegalAcceptance().catch(() => {});
          if (await shouldShowLegalAccept().catch(() => false)) {
            router.replace('/legal/accept');
          } else {
            router.replace('/feed');
          }
        }
      } catch {
        if (alive) {
          setError(
            'This link is invalid or expired. Request a new one below.',
          );
        }
      } finally {
        if (alive) setVerifying(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.code, params.token_hash]);

  async function handleVerify(raw?: string) {
    const value = (raw ?? code).trim();
    setError(null);
    if (value.length < 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (!email) {
      setError('Missing email address. Go back and sign up again.');
      return;
    }
    setBusy(true);
    try {
      await verifyEmailOtp(email, value, 'signup');
      const phone = await getMyPhone();
      await recordLegalAcceptance().catch(() => {});
      if (await shouldShowLegalAccept().catch(() => false)) {
        router.replace('/legal/accept');
        return;
      }
      router.replace(phone ? '/feed' : '/profile/phone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/[^\d]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) {
      void handleVerify(digits);
    }
  }

  async function handleResend() {
    setError(null);
    if (!email) {
      setError('Missing email address. Go back and sign up again.');
      return;
    }
    setLoading(true);
    try {
      await resendSignupEmail(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Heading>Check your inbox</Heading>
      <Subtext>
        We sent a 6-digit code to {email ?? 'your email'}. Type it below to
        verify your account (or tap the confirmation link in the same email).
        {sent ? ' New code sent.' : ''}
      </Subtext>
      {verifying ? <Subtext>Verifying your link…</Subtext> : null}
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
      <ErrorText message={error} />
      <Button
        title="Verify code"
        loading={busy}
        onPress={() => handleVerify()}
      />
      <Button
        title="Resend code"
        variant="outline"
        loading={loading}
        onPress={handleResend}
      />
      <Link href="/login" style={styles.footer}>
        <Text style={styles.footerText}>
          Confirmed? <Text style={styles.link}>Log in</Text>
        </Text>
      </Link>
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
  footer: { marginTop: 24, alignSelf: 'center' },
  footerText: { fontSize: 14, color: c.subtext },
  link: { color: c.primary, fontWeight: '700' },
});
}
