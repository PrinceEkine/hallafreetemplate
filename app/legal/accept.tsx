import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, ErrorText, Heading, Screen, Subtext } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  recordLegalAcceptance,
} from '../../lib/legal';
import { getMyPhone } from '../../lib/supabase';

/**
 * First-run gate for accounts created before the legal documents shipped:
 * read (or skim) the Terms + Policy, accept once, and continue into the
 * workspace. New signups accept on the signup screen instead.
 */
export default function LegalAccept() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setBusy(true);
    try {
      await recordLegalAcceptance();
      const phone = await getMyPhone().catch(() => null);
      router.replace(phone ? '/feed' : '/profile/phone');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="ONE MORE THING" />
      <Screen>
        <Heading>Please accept our Terms</Heading>
        <Subtext>
          Ophixe now ships with a Terms of Use and a Privacy Policy (version{' '}
          {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE_DATE}). They explain how
          work communities, chats, and your data work. Please read them, then
          accept to continue.
        </Subtext>
        <View style={styles.links}>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push('/legal/terms')}
            hitSlop={8}
          >
            <Text style={styles.linkText}>Read the Terms of Use</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push('/legal/privacy')}
            hitSlop={8}
          >
            <Text style={styles.linkText}>Read the Privacy Policy</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
        <ErrorText message={error} />
        <Button
          title="I accept"
          loading={busy}
          onPress={handleAccept}
        />
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    links: { marginTop: 16, gap: 4 },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    linkText: { fontSize: 15, fontWeight: '700', color: c.primary },
    chevron: { fontSize: 22, fontWeight: '800', color: c.subtext },
  });
}
