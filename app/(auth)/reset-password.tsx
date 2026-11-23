import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { supabase, verifyEmailOtp } from '../../lib/supabase';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type LinkState = 'missing' | 'checking' | 'otp' | 'ready' | 'invalid';

export default function ResetPassword() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const params = useLocalSearchParams<{
    email?: string;
    code?: string;
    token_hash?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const [link, setLink] = useState<LinkState>('checking');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const emailParam = first(params.email);

  useEffect(() => {
    const code = first(params.code);
    const tokenHash = first(params.token_hash);
    const accessToken = first(params.access_token);
    const refreshToken = first(params.refresh_token);
    if (!code && !tokenHash && !accessToken) {
      setLink(emailParam ? 'otp' : 'missing');
      return;
    }
    let alive = true;
    (async () => {
      try {
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (verifyError) throw verifyError;
        } else if (accessToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? '',
          });
          if (sessionError) throw sessionError;
        }
        if (alive) setLink('ready');
      } catch {
        if (alive) {
          setLink('invalid');
          setError('This link is invalid or expired. Request a new one.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    params.code,
    params.token_hash,
    params.access_token,
    params.refresh_token,
    params.email,
  ]);

  async function handleVerifyCode(raw?: string) {
    const value = (raw ?? otp).trim();
    setError(null);
    if (value.length < 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (!emailParam) {
      setError('Missing email address. Start again from forgot password.');
      return;
    }
    setBusy(true);
    try {
      await verifyEmailOtp(emailParam, value, 'recovery');
      setLink('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/[^\d]/g, '').slice(0, 6);
    setOtp(digits);
    if (digits.length === 6 && !busy) {
      void handleVerifyCode(digits);
    }
  }

  async function handleReset() {
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
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Heading>New password</Heading>
      {done ? (
        <>
          <Subtext>Your password was reset. You can log in now.</Subtext>
          <Link href="/login" style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.link}>Go to login</Text>
            </Text>
          </Link>
        </>
      ) : link === 'missing' || link === 'invalid' ? (
        <>
          <Subtext>
            {link === 'invalid'
              ? 'That reset link did not work. Request a fresh code to continue.'
              : 'Start from the forgot-password screen to get a code.'}
          </Subtext>
          <ErrorText message={error} />
          <Link href="/forgot" style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.link}>Get a code</Text>
            </Text>
          </Link>
        </>
      ) : link === 'otp' ? (
        <>
          <Subtext>
            We sent a 6-digit code to {emailParam}. Type it below, then set a
            new password.
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
            onSubmitEditing={() => handleVerifyCode()}
            value={otp}
            onChangeText={handleCodeChange}
          />
          <ErrorText message={error} />
          <Button
            title="Verify code"
            loading={busy}
            onPress={() => handleVerifyCode()}
          />
        </>
      ) : link === 'checking' ? (
        <Subtext>Verifying your link…</Subtext>
      ) : (
        <>
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
          <Button
            title="Set new password"
            loading={loading}
            onPress={handleReset}
          />
        </>
      )}
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
