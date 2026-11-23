import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
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
import {
  createTask,
  isCommunityAdmin,
} from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import {
  takePendingAssignees,
  type AssigneePick,
} from '../../lib/taskAssignee';

export default function NewTask() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState('');
  const [assignees, setAssignees] = useState<AssigneePick[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Collect the directory picks when returning from the assign page.
  useFocusEffect(
    useCallback(() => {
      const picks = takePendingAssignees();
      if (picks === undefined) return;
      setAssignees(picks);
    }, []),
  );

  useEffect(() => {
    (async () => {
      const scoped = paramId ?? (await resolveSelectedCommunityId().catch(() => null));
      setId(scoped);
      if (!scoped) {
        setAdmin(false);
        return;
      }
      const flag = await isCommunityAdmin(scoped);
      setAdmin(flag);
    })();
  }, [paramId]);

  async function handleCreate() {
    setError(null);
    if (!id) return;
    if (title.trim().length < 3) {
      setError('Give the task a title.');
      return;
    }
    if (due.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(due.trim())) {
      setError('Due date must look like 2026-12-01.');
      return;
    }
    setLoading(true);
    try {
      await createTask(id, {
        title,
        detail,
        due_date: due,
        assignee_ids: assignees.map((a) => a.userId),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW TASK" communityId={id ?? null} showMenu />
      <Screen>
        <Heading>New task</Heading>
        {admin === null ? (
          <Subtext>Checking permissions…</Subtext>
        ) : !id ? (
          <Subtext>
            Join or create a community first, then come back to create a
            task.
          </Subtext>
        ) : !admin ? (
          <Subtext>Only community admins can create tasks.</Subtext>
        ) : (
          <>
            <Field
              label="TITLE"
              placeholder="Prepare the monthly report"
              value={title}
              onChangeText={setTitle}
            />
            <Field
              label="DETAILS (OPTIONAL)"
              placeholder="What needs to be done?"
              multiline
              numberOfLines={4}
              value={detail}
              onChangeText={setDetail}
            />
            <Text style={styles.label}>DUE DATE (OPTIONAL)</Text>
            <Pressable
              style={styles.selector}
              onPress={() => setShowCalendar((s) => !s)}
            >
              <Text style={styles.selectorText}>
                {due ? due : 'No due date'}
              </Text>
              <Text style={styles.selectorChange}>
                {due ? 'CHANGE' : 'PICK'}
              </Text>
            </Pressable>
            {showCalendar && (
              <View style={styles.calendarWrap}>
                <DatePicker
                  value={due || null}
                  onChange={(iso) => {
                    setDue(iso);
                    setShowCalendar(false);
                  }}
                />
                {due ? (
                  <Pressable
                    onPress={() => {
                      setDue('');
                      setShowCalendar(false);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearDate}>CLEAR DATE</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
            <Text style={styles.label}>ASSIGN TO (OPTIONAL)</Text>
            <Pressable
              style={styles.selector}
              onPress={() =>
                id &&
                router.push({
                  pathname: '/community/task-assign' as never,
                  params: { id },
                })
              }
            >
              <Text style={styles.selectorText} numberOfLines={1}>
                {assignees.length === 0
                  ? 'Nobody yet'
                  : assignees.length <= 2
                    ? assignees.map((a) => a.name).join(', ')
                    : `${assignees
                        .slice(0, 2)
                        .map((a) => a.name)
                        .join(', ')} +${assignees.length - 2}`}
              </Text>
              <Text style={styles.selectorChange}>
                {assignees.length > 0 ? 'CHANGE' : 'CHOOSE'}
              </Text>
            </Pressable>
            <ErrorText message={error} />
            <Button
              title="Create task"
              loading={loading}
              onPress={handleCreate}
            />
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
  selector: {
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
  selectorText: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
  selectorChange: { fontSize: 13, fontWeight: '800', color: c.primary },
  calendarWrap: { marginTop: 8, gap: 8 },
  clearDate: {
    fontSize: 12,
    fontWeight: '800',
    color: c.danger,
    textAlign: 'right',
    paddingVertical: 4,
  },
});
}
