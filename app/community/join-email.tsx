import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  findCommunityByEmailDomain,
  joinVerifiedCommunity,
} from '../../lib/communityContent';
import { shouldShowLegalAccept } from '../../lib/legal';
import { setSelectedCommunityId } from '../../lib/selectedCommunity';
import { signOutAndClear } from '../../lib/session';
import { supabase } from '../../lib/supabase';

/**
 * LinkedIn-style work-email join: type a work address, we check the
 * domain against admin-approved communities, then a code proves
 * ownership and verified staff join directly.
 */
export default function JoinWithEmail() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [community, setCommunity] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [domainNote, setDomainNote] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function parseAddress(): { address: string; domain: string } | null {
    const address = email.trim().toLowerCase();
    const parts = address.split('@');
    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1].includes('.') ||
      address.includes(' ')
    ) {
      return null;
    }
    return { address, domain: parts[1] };
  }

  async function handleSendCode() {
    setError(null);
    setDomainNote(null);
    const parsed = parseAddress();
    if (!parsed) {
      setError('Enter a valid work email address.');
      return;
    }
    setLoading(true);
    try {
      const match = await findCommunityByEmailDomain(parsed.domain);
      if (!match) {
        setError(
          'This email domain is not currently approved by the admins of any community.',
        );
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (
        user?.email &&
        user.email.toLowerCase() !== parsed.address &&
        !user.email.toLowerCase().endsWith(`@${parsed.domain}`)
      ) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Switch accounts?',
            `You are signed in as ${user.email}. Verifying ${parsed.address} will sign you into that account instead.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              {
                text: 'Continue',
                onPress: () => resolve(true),
              },
            ],
          );
        });
        if (!proceed) return;
        await signOutAndClear().catch(() => {});
      }
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: parsed.address,
      });
      if (sendError) throw sendError;
      setCommunity(match);
      setDomainNote(`${match.name} approves @${parsed.domain}.`);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError(null);
    const parsed = parseAddress();
    const value = code.trim();
    if (!parsed || !community) {
      setError('Go back and enter your work email first.');
      return;
    }
    if (value.length < 4) {
      setError('Enter the code we sent you.');
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: parsed.address,
        token: value,
        type: 'email',
      });
      if (verifyError) throw verifyError;
      const status = await joinVerifiedCommunity(community.id);
      if (status === 'needs_code') {
        router.replace({
          pathname: '/community/join',
          params: { email: parsed.address },
        });
        return;
      }
      setSelectedCommunityId(community.id);
      if (await shouldShowLegalAccept().catch(() => false)) {
        router.replace('/legal/accept');
        return;
      }
      router.replace({
        pathname: '/community/[id]',
        params: { id: community.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(value: string) {
    const digits = value.replace(/[^\d]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !loading) {
      setCode(digits);
    }
  }

  return (
    <>
      <ScreenHeader title="JOIN WITH EMAIL" />
      <Screen>
        <Heading>Verify your work email</Heading>
        {step === 'email' ? (
          <>
            <Subtext>
              Enter your company email address. If its domain is approved,
              we will send you a code.
            </Subtext>
            <Field
              label="WORK EMAIL"
              placeholder="you@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            {domainNote ? <Subtext>{domainNote}</Subtext> : null}
            <ErrorText message={error} />
            <Button
              title="Send code"
              loading={loading}
              onPress={handleSendCode}
            />
          </>
        ) : (
          <>
            <Subtext>
              We sent a 6-digit code to {email.trim().toLowerCase()}.
              {community ? ` It unlocks ${community.name}.` : ''}
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
            <ErrorText message={error} />
            <Button
              title="Verify & join"
              loading={loading}
              onPress={handleVerify}
            />
            <Button
              title="Resend code"
              variant="outline"
              onPress={() => {
                setStep('email');
                setCode('');
              }}
            />
          </>
        )}
      </Screen>
    </>
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
