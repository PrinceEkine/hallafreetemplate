import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { Button, ErrorText, Field, Heading, Screen, Subtext } from '../../components/ui';
import { AppleButton } from '../../components/AppleButton';
import { GoogleButton } from '../../components/GoogleButton';
import { Logo } from '../../components/Logo';
import {
  biometricStatus,
  disableBiometricLogin,
  enableBiometricLogin,
  unlockWithBiometric,
} from '../../lib/biometrics';
import {
  getMyPhone,
  isAppleAuthAvailable,
  isSupabaseConfigured,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  supabase,
} from '../../lib/supabase';
import { shouldShowLegalAccept } from '../../lib/legal';
import { fonts, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';

async function routeAfterAuth() {
  if (!isSupabaseConfigured()) {
    router.replace('/feed');
    return;
  }
  if (await shouldShowLegalAccept().catch(() => false)) {
    router.replace('/legal/accept');
    return;
  }
  const phone = await getMyPhone();
  router.replace(phone ? '/feed' : '/profile/phone');
}

export default function Login() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioLabel, setBioLabel] = useState('fingerprint');
  const [bioReady, setBioReady] = useState(false);
  const passwordRef = useRef<TextInputInstance | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/feed');
    });
    biometricStatus().then((status) => {
      setBioLabel(status.label);
      setBioReady(status.available && status.enrolled && status.stored);
    });
    isAppleAuthAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  async function offerBiometric(emailValue: string, passwordValue: string) {
    try {
      const status = await biometricStatus();
      if (!status.available || !status.enrolled || status.stored) return;
      // Wait for the user's choice before routing: navigating away first
      // dismisses the alert and nobody can ever enable fingerprint login.
      await new Promise<void>((resolve) => {
        Alert.alert(
          `Enable ${status.label} login?`,
          `Next time you can log in with your ${status.label} instead of typing your password.`,
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve() },
            {
              text: 'Enable',
              onPress: () => {
                enableBiometricLogin(emailValue, passwordValue)
                  .then(() => {
                    setBioLabel(status.label);
                    setBioReady(true);
                  })
                  .catch(() => {})
                  .finally(() => resolve());
              },
            },
          ],
          { cancelable: false },
        );
      });
    } catch {
      // Never block login.
    }
  }

  async function handleLogin() {
    setError(null);
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 1) {
      setError('Enter your password.');
      return;
    }
    setLoading(true);
    try {
      if (isSupabaseConfigured()) await signInWithEmail(email, password);
      await offerBiometric(email, password);
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    setError(null);
    setBioLoading(true);
    try {
      const creds = await unlockWithBiometric(bioLabel);
      if (!creds) return;
      await signInWithEmail(creds.email, creds.password);
      await routeAfterAuth();
    } catch (err) {
      // Stored credentials go stale when the password changes elsewhere.
      await disableBiometricLogin();
      setBioReady(false);
      setError(
        err instanceof Error ? err.message : 'Could not log in.',
      );
    } finally {
      setBioLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError('Add your Supabase keys to .env to enable Google sign-in.');
      return;
    }
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError('Add your Supabase keys to .env to enable Apple sign-in.');
      return;
    }
    setAppleLoading(true);
    try {
      await signInWithApple();
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed.');
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.brandRow}>
        <Logo size={48} />
        <View>
          <Text style={styles.brandName}>ophixe</Text>
          <Text style={styles.brandKicker}>STAFF WORK HUB</Text>
        </View>
      </View>
      <Heading>Welcome back</Heading>
      <Subtext>Log in with your email to continue.</Subtext>
      <Field
        label="EMAIL ADDRESS"
        placeholder="you@company.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label="PASSWORD"
        placeholder="••••••••"
        secureTextEntry={!showPw}
        autoComplete="password"
        returnKeyType="done"
        inputRef={passwordRef}
        onSubmitEditing={handleLogin}
        value={password}
        onChangeText={setPassword}
        right={
          <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}>
            <Ionicons
              name={showPw ? 'eye-off' : 'eye'}
              size={22}
              color={c.subtext}
            />
          </Pressable>
        }
      />
      <ErrorText message={error} />
      <Button title="Log in" loading={loading} onPress={handleLogin} />
      {bioReady ? (
        <Pressable
          style={styles.bioRow}
          onPress={handleBiometric}
          disabled={bioLoading}
          hitSlop={8}
        >
          <Ionicons
            name={bioLabel === 'face' ? 'scan-outline' : 'finger-print'}
            size={22}
            color={c.ink}
          />
          <Text style={styles.bioText}>
            {bioLoading
              ? 'Checking…'
              : `Log in with ${bioLabel === 'face' ? 'Face ID' : 'fingerprint'}`}
          </Text>
        </Pressable>
      ) : null}
      <GoogleButton
        label="Sign in with Google"
        loading={googleLoading}
        onPress={handleGoogle}
      />
      {appleAvailable ? (
        <AppleButton
          label="Sign in with Apple"
          loading={appleLoading}
          onPress={handleApple}
        />
      ) : null}
      <Text style={styles.legal}>
        By logging in you agree to our{' '}
        <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
          Terms of Use
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>
      <Link href="/forgot" style={styles.footer}>
        <Text style={styles.footerText}>
          <Text style={styles.link}>Forgot password?</Text>
        </Text>
      </Link>
      <Link href="/signup" style={styles.footer}>
        <Text style={styles.footerText}>
          New here? <Text style={styles.link}>Create an account</Text>
        </Text>
      </Link>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  brandName: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: c.ink,
    letterSpacing: -0.5,
  },
  brandKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 2,
    marginTop: 2,
  },
  legal: {
    fontSize: 13,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  footer: { marginTop: 24, alignSelf: 'center' },
  footerText: { fontSize: 14, color: c.subtext },
  link: { color: c.primary, fontWeight: '700' },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
  },
  bioText: { fontSize: 15, fontWeight: '700', color: c.text },
});
}
