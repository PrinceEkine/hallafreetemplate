import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, ErrorText, Field, Screen } from '../../components/ui';
import { fonts, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { timeAgo } from '../../lib/format';
import {
  FORM_DEFS,
  fieldLabel,
  getSubmission,
  myAdminCommunityIds,
  openEvidence,
  reviewSubmission,
  type Submission,
} from '../../lib/forms';

function statusColors(pal: ThemeColors): Record<Submission['status'], string> {
  return {
    pending: pal.warning,
    approved: pal.primary,
    rejected: pal.danger,
  };
}

export default function RequestDetail() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = useState<Submission | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing request.');
      return;
    }
    const found = await getSubmission(id);
    if (!found) {
      setError('Request not found.');
      return;
    }
    setItem(found);
    const adminIds = await myAdminCommunityIds();
    setCanReview(
      found.status === 'pending' && adminIds.includes(found.community_id),
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview(status: 'approved' | 'rejected') {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      await reviewSubmission(id, status, note);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(path: string) {
    setError(null);
    try {
      await openEvidence(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file.');
    }
  }

  return (
    <>
      <ScreenHeader title="REQUEST" showMenu />
      <Screen>
        {!item ? (
          <>
            <ActivityIndicator style={styles.loader} color={c.ink} />
            <ErrorText message={error} />
          </>
        ) : (
          <>
            <Text style={styles.title}>{item.typeTitle}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: statusColors(c)[item.status] },
                ]}
              />
              <Text style={styles.status}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.meta}>
              {item.submitterName} • {item.communityName} •{' '}
              {timeAgo(item.created_at)}
            </Text>
            {FORM_DEFS[item.type].map((field) => (
              <View key={field.key} style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {fieldLabel(item.type, field.key)}
                </Text>
                <Text style={styles.fieldValue}>
                  {item.values[field.key] || '—'}
                </Text>
              </View>
            ))}
            {item.evidence.length > 0 && (
              <>
                <Text style={styles.section}>EVIDENCE</Text>
                {item.evidence.map((path) => (
                  <Pressable
                    key={path}
                    style={styles.fileRow}
                    onPress={() => handleOpen(path)}
                  >
                    <Text style={styles.fileName} numberOfLines={1}>
                      {path.split('/').pop()}
                    </Text>
                    <Text style={styles.open}>OPEN</Text>
                  </Pressable>
                ))}
              </>
            )}
            {item.reviewNote ? (
              <>
                <Text style={styles.section}>REVIEW NOTE</Text>
                <Text style={styles.fieldValue}>{item.reviewNote}</Text>
              </>
            ) : null}
            {canReview && (
              <>
                <Field
                  label="REVIEW NOTE (OPTIONAL)"
                  placeholder="Reason for your decision…"
                  multiline
                  numberOfLines={3}
                  value={note}
                  onChangeText={setNote}
                />
                <Button
                  title="Approve"
                  variant="primary"
                  loading={busy}
                  onPress={() => handleReview('approved')}
                />
                <Button
                  title="Reject"
                  variant="outline"
                  loading={busy}
                  onPress={() => handleReview('rejected')}
                />
              </>
            )}
            <ErrorText message={error} />
          </>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: c.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  status: { fontSize: 13, fontWeight: '800', color: c.subtext },
  meta: { fontSize: 13, color: c.subtext, marginTop: 6 },
  field: { marginTop: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.subtext,
    letterSpacing: 1,
  },
  fieldValue: { fontSize: 15, color: c.text, marginTop: 4, lineHeight: 22 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  fileName: { flex: 1, fontSize: 14, color: c.text },
  open: { fontSize: 12, fontWeight: '800', color: c.primary },
});
}
