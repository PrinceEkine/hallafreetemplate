import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';

export default function ForgotPassword() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setError(null);
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/reset-password', {
        scheme: 'ophixe',
      });
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Heading>Forgot password</Heading>
      {sent ? (
        <>
          <Subtext>
            If an account exists for {email.trim()}, a 6-digit code is on its
            way. Type it on the next screen to set a new password (the email
            also has a tap link).
          </Subtext>
          <ErrorText message={error} />
          <Button
            title="Enter code"
            onPress={() =>
              router.push({
                pathname: '/reset-password',
                params: { email: email.trim() },
              })
            }
          />
          <Button
            title="Resend code"
            variant="outline"
            loading={loading}
            onPress={handleSend}
          />
        </>
      ) : (
        <>
          <Subtext>
            Enter your account email and we will send you a 6-digit code.
          </Subtext>
          <Field
            label="EMAIL ADDRESS"
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <ErrorText message={error} />
          <Button title="Send code" loading={loading} onPress={handleSend} />
        </>
      )}
      <Link href="/login" style={styles.footer}>
        <Text style={styles.footerText}>
          Remember it now? <Text style={styles.link}>Log in</Text>
        </Text>
      </Link>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  footer: { marginTop: 24, alignSelf: 'center' },
  footerText: { fontSize: 14, color: c.subtext },
  link: { color: c.primary, fontWeight: '700' },
});
}
