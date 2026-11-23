import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DatePicker } from '../../components/DatePicker';
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
import { listMyCommunities } from '../../lib/communities';
import {
  FORM_DEFS,
  FORM_TYPES,
  submitForm,
  uploadEvidence,
  type FormType,
} from '../../lib/forms';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';

function Chips<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onPick: (v: T) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => onPick(o)}
            style={[styles.chip, value === o && styles.chipActive]}
          >
            <Text style={[styles.chipText, value === o && styles.chipTextActive]}>
              {o}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type PickedFile = { uri: string; name: string };

export default function NewRequest() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [ready, setReady] = useState(false);
  const [type, setType] = useState<FormType>('data_correction');
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [openDateFor, setOpenDateFor] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const scoped = await resolveSelectedCommunityId().catch(() => null);
      setCommunityId(scoped);
      if (scoped) {
        const mine = await listMyCommunities().catch((): never[] => []);
        setCommunityName(mine.find((it) => it.id === scoped)?.name ?? '');
      }
      setReady(true);
    })();
  }, []);

  function pickType(next: FormType) {
    setType(next);
    setValues({});
  }

  async function handleAttach() {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    setFiles((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, name: a.name ?? 'file' })),
    ]);
  }

  async function handleSubmit() {
    setError(null);
    if (!communityId) {
      setError('Join or create a community first, then come back.');
      return;
    }
    for (const field of FORM_DEFS[type]) {
      const value = (values[field.key] ?? '').trim();
      if (field.required && !value) {
        setError(`Fill in ${field.label}.`);
        return;
      }
      if (value && field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        setError(`${field.label} must look like 2026-12-01.`);
        return;
      }
    }
    setLoading(true);
    try {
      let evidence: string[] = [];
      if (files.length > 0) {
        setPhase('Uploading evidence…');
        evidence = await uploadEvidence(communityId, files);
      }
      setPhase('Submitting…');
      await submitForm(communityId, type, values, evidence);
      router.replace('/forms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setLoading(false);
      setPhase('');
    }
  }

  return (
    <>
      <ScreenHeader title="FILL FORM" showMenu />
      <Screen>
        <Heading>Staff request</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !communityId ? (
          <Subtext>
            Join or create a community first, then come back to file a request.
          </Subtext>
        ) : (
          <>
            {communityName ? (
              <Subtext>Sending to {communityName}</Subtext>
            ) : null}
            <Chips
              label="REQUEST TYPE"
              options={FORM_TYPES.map((t) => t.title)}
              value={FORM_TYPES.find((t) => t.id === type)?.title ?? ''}
              onPick={(title) => {
                const found = FORM_TYPES.find((t) => t.title === title);
                if (found) pickType(found.id);
              }}
            />
            {FORM_DEFS[type].map((field) => {
              if (field.kind === 'select') {
                return (
                  <Chips
                    key={field.key}
                    label={field.label}
                    options={field.options ?? []}
                    value={values[field.key] ?? ''}
                    onPick={(v) =>
                      setValues((prev) => ({ ...prev, [field.key]: v }))
                    }
                  />
                );
              }
              if (field.kind === 'date') {
                // Dates are picked from a calendar, never typed.
                const val = values[field.key] ?? '';
                return (
                  <View key={field.key}>
                    <Text style={styles.label}>{field.label}</Text>
                    <Pressable
                      style={styles.dateButton}
                      onPress={() =>
                        setOpenDateFor((cur) =>
                          cur === field.key ? null : field.key,
                        )
                      }
                      hitSlop={8}
                    >
                      <Text style={styles.dateValue}>
                        {val || 'No date'}
                      </Text>
                      <Text style={styles.pickDate}>
                        {val ? 'CHANGE' : 'PICK DATE'}
                      </Text>
                    </Pressable>
                    {openDateFor === field.key && (
                      <View style={styles.calendarWrap}>
                        <DatePicker
                          value={val || null}
                          onChange={(iso) => {
                            setValues((prev) => ({
                              ...prev,
                              [field.key]: iso,
                            }));
                            setOpenDateFor(null);
                          }}
                        />
                      </View>
                    )}
                  </View>
                );
              }
              return (
                <View key={field.key}>
                  <Field
                    label={field.label}
                    placeholder={
                      field.kind === 'textarea' ? 'Write here…' : ''
                    }
                    multiline={field.kind === 'textarea'}
                    numberOfLines={field.kind === 'textarea' ? 4 : 1}
                    value={values[field.key] ?? ''}
                    onChangeText={(text) =>
                      setValues((prev) => ({ ...prev, [field.key]: text }))
                    }
                  />
                </View>
              );
            })}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>EVIDENCE (OPTIONAL)</Text>
              {files.map((f) => (
                <View key={f.uri} style={styles.fileRow}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setFiles((prev) => prev.filter((x) => x.uri !== f.uri))
                    }
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>REMOVE</Text>
                  </Pressable>
                </View>
              ))}
              <Button
                title="Attach files"
                variant="outline"
                onPress={handleAttach}
              />
            </View>
            <ErrorText message={error} />
            {phase ? <Subtext>{phase}</Subtext> : null}
            <Button title="Submit" loading={loading} onPress={handleSubmit} />
          </>
        )}
      </Screen>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  fieldWrap: { marginTop: 8 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: c.paper,
  },
  dateValue: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
  pickDate: {
    fontSize: 12,
    fontWeight: '800',
    color: c.primary,
    paddingVertical: 6,
  },
  calendarWrap: { marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: radius.m,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 14, fontWeight: '700', color: c.ink },
  chipTextActive: { color: c.paper },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.bg,
    borderRadius: radius.m,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  fileName: { flex: 1, fontSize: 14, color: c.text },
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
});
}
