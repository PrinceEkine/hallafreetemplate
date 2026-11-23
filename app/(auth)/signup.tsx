import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { Button, ErrorText, Field, Heading, Screen, Subtext } from '../../components/ui';
import { AppleButton } from '../../components/AppleButton';
import { GoogleButton } from '../../components/GoogleButton';
import { Logo } from '../../components/Logo';
import {
  getMyPhone,
  isAppleAuthAvailable,
  isSupabaseConfigured,
  signInWithApple,
  signInWithGoogle,
  signUpWithEmail,
  supabase,
} from '../../lib/supabase';
import {
  recordLegalAcceptance,
  shouldShowLegalAccept,
} from '../../lib/legal';
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

export default function Signup() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const emailRef = useRef<TextInputInstance | null>(null);
  const passwordRef = useRef<TextInputInstance | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/feed');
    });
    isAppleAuthAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  async function handleSignup() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms of Use and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        router.push('/profile/phone');
        return;
      }
      const hasSession = await signUpWithEmail(name, email, password);
      if (hasSession) {
        await recordLegalAcceptance().catch(() => {});
        await routeAfterAuth();
      } else {
        router.push({
          pathname: '/confirm-email',
          params: { email: email.trim() },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError('Add your Supabase keys to .env to enable Apple sign-in.');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms of Use and Privacy Policy to continue.');
      return;
    }
    setAppleLoading(true);
    try {
      await signInWithApple();
      await recordLegalAcceptance().catch(() => {});
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed.');
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError('Add your Supabase keys to .env to enable Google sign-in.');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms of Use and Privacy Policy to continue.');
      return;
    }
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      await recordLegalAcceptance().catch(() => {});
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
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
      <Heading>Create account</Heading>
      <Subtext>Sign up with your email, then add your phone number.</Subtext>
      <Field
        label="FULL NAME"
        placeholder="Adaeze Okonkwo"
        autoComplete="name"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
        value={name}
        onChangeText={setName}
      />
      <Field
        label="EMAIL ADDRESS"
        placeholder="you@company.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        blurOnSubmit={false}
        inputRef={emailRef}
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label="PASSWORD"
        placeholder="6+ characters"
        secureTextEntry={!showPw}
        autoComplete="new-password"
        returnKeyType="done"
        inputRef={passwordRef}
        onSubmitEditing={handleSignup}
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
      <Pressable
        style={styles.agreeRow}
        onPress={() => setAgreed((v) => !v)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel="Accept the Terms of Use and Privacy Policy"
      >
        <Ionicons
          name={agreed ? 'checkbox' : 'square-outline'}
          size={24}
          color={agreed ? c.ink : c.subtext}
        />
        <Text style={styles.agreeText}>
          I agree to the{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text
            style={styles.link}
            onPress={() => router.push('/legal/privacy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </Pressable>
      <ErrorText message={error} />
      <Button title="Create account" loading={loading} onPress={handleSignup} />
      <GoogleButton
        label="Sign up with Google"
        loading={googleLoading}
        onPress={handleGoogle}
      />
      {appleAvailable ? (
        <AppleButton
          label="Sign up with Apple"
          loading={appleLoading}
          onPress={handleApple}
        />
      ) : null}
      <Link href="/login" style={styles.footer}>
        <Text style={styles.footerText}>
          Have an account? <Text style={styles.link}>Log in</Text>
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
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
  },
  agreeText: { flex: 1, fontSize: 14, color: c.subtext, lineHeight: 21 },
  footer: { marginTop: 24, alignSelf: 'center' },
  footerText: { fontSize: 14, color: c.subtext },
  link: { color: c.primary, fontWeight: '700' },
});
}
