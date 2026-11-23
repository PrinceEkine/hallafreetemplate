import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  confirmPassword,
  deleteMyAccount,
  deletionErrorMessage,
  hasEmailPassword,
  wipeLocalAccount,
} from '../../lib/account';

/**
 * Irreversible account deletion, triple-guarded so nobody taps through by
 * mistake: a required reason, the account password (password accounts
 * only — Google-only accounts skip it), and typing DELETE. The server
 * then wipes the profile, posts, messages, memberships, and files (owned
 * communities transfer to their longest-standing admin or member), and
 * the device forgets its keys, caches, and session.
 */
export default function DeleteAccount() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [needsPassword, setNeedsPassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasEmailPassword()
      .then(setNeedsPassword)
      .catch(() => setNeedsPassword(true));
  }, []);

  const armed =
    reason.trim().length > 0 &&
    (!needsPassword || password.length > 0) &&
    confirm.trim() === 'DELETE';

  async function handleDelete() {
    if (!armed || busy) return;
    setError(null);
    if (!reason.trim()) {
      setError('Please tell us why you are leaving.');
      return;
    }
    if (needsPassword && !password) {
      setError('Enter your password to confirm it is you.');
      return;
    }
    if (confirm.trim() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    try {
      if (needsPassword) await confirmPassword(password);
      const result = await deleteMyAccount(reason);
      await wipeLocalAccount();
      const moved = result.transferred.length;
      const gone = result.destroyed.length;
      const handover =
        moved + gone === 0
          ? 'Your communities were left untouched.'
          : [
              moved > 0
                ? `Ownership of ${moved} communit${moved === 1 ? 'y' : 'ies'} moved on (${result.transferred.join(', ')}).`
                : null,
              gone > 0
                ? `${gone} emptied communit${gone === 1 ? 'y was' : 'ies were'} deleted.`
                : null,
            ]
              .filter(Boolean)
              .join(' ');
      Alert.alert('Account deleted', handover, [
        { text: 'Goodbye', onPress: () => router.replace('/') },
      ]);
    } catch (err) {
      setError(deletionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="DELETE ACCOUNT" />
      <Screen>
        <Heading>This erases everything</Heading>
        <Subtext>
          Your profile, posts, messages, memberships, wallet, files, and
          sign-in will be permanently deleted. This cannot be undone.
        </Subtext>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Communities you own move to their longest-standing admin (or
            member) so your company keeps working. Your chats, posts, and
            files still go with you.
          </Text>
        </View>
        <Field
          label="WHY ARE YOU LEAVING?"
          placeholder="Tell us the reason"
          multiline
          numberOfLines={3}
          value={reason}
          onChangeText={setReason}
        />
        {needsPassword ? (
          <Field
            label="YOUR PASSWORD"
            placeholder="Confirm it is you"
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
          />
        ) : null}
        <Field
          label='TYPE "DELETE" TO CONFIRM'
          placeholder="DELETE"
          autoCapitalize="characters"
          autoCorrect={false}
          value={confirm}
          onChangeText={setConfirm}
        />
        <ErrorText message={error} />
        <Button
          title="Delete my account forever"
          loading={busy}
          disabled={!armed}
          onPress={handleDelete}
        />
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    notice: {
      marginTop: 16,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 12,
      padding: 12,
    },
    noticeText: { fontSize: 13, color: c.text, lineHeight: 20 },
  });
}
