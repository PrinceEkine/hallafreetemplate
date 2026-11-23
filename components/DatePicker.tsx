import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Small inline month grid (YYYY-MM-DD out). Past days are disabled; the
 * parent owns the selected value and clearing it. Today gets a ring, the
 * double chevrons jump a year, and the Today button jumps back.
 */
export function DatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    const m = value ? /^(\d{4})-(\d{2})-\d{2}$/.exec(value) : null;
    return m
      ? { y: Number(m[1]), m: Number(m[2]) - 1 }
      : { y: today.getFullYear(), m: today.getMonth() };
  });
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  function moveMonth(delta: number) {
    setCursor((it) => {
      const next = new Date(it.y, it.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  }

  function goToday() {
    setCursor({ y: today.getFullYear(), m: today.getMonth() });
    onChange(todayIso);
  }

  const leading = new Date(cursor.y, cursor.m, 1).getDay();
  const total = daysInMonth(cursor.y, cursor.m);

  return (
    <View style={styles.box}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => moveMonth(-12)} hitSlop={8}>
          <Text style={styles.yearNav}>«</Text>
        </Pressable>
        <Pressable onPress={() => moveMonth(-1)} hitSlop={8}>
          <Text style={styles.monthNav}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS[cursor.m]} {cursor.y}
        </Text>
        <Pressable onPress={() => moveMonth(1)} hitSlop={8}>
          <Text style={styles.monthNav}>›</Text>
        </Pressable>
        <Pressable onPress={() => moveMonth(12)} hitSlop={8}>
          <Text style={styles.yearNav}>»</Text>
        </Pressable>
      </View>
      <View style={styles.todayRow}>
        <Pressable onPress={goToday} hitSlop={8}>
          <Text style={styles.todayLink}>Today: {todayIso}</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`h-${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <View key={`b-${i}`} style={styles.cell} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const d = i + 1;
          const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
          const past = iso < todayIso;
          const selected = value === iso;
          const isToday = iso === todayIso;
          return (
            <Pressable
              key={d}
              style={[
                styles.cell,
                selected && styles.cellSelected,
                !selected && isToday && styles.cellToday,
                past && !isToday && styles.cellPast,
              ]}
              disabled={past && !isToday}
              onPress={() => onChange(iso)}
            >
              <Text
                style={[
                  styles.cellText,
                  selected && styles.cellTextSelected,
                  past && !isToday && styles.cellTextPast,
                ]}
              >
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.paper,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthNav: { fontSize: 24, fontWeight: '800', color: c.ink },
  yearNav: { fontSize: 18, fontWeight: '800', color: c.subtext },
  monthLabel: { fontSize: 14, fontWeight: '800', color: c.text },
  todayRow: { alignItems: 'flex-end', marginBottom: 4 },
  todayLink: { fontSize: 12, fontWeight: '700', color: c.subtext },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: c.subtext,
    marginBottom: 4,
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  cellSelected: { backgroundColor: c.ink },
  cellToday: { borderWidth: 2, borderColor: c.primary },
  cellPast: { opacity: 0.3 },
  cellText: { fontSize: 13, fontWeight: '600', color: c.text },
  cellTextSelected: { color: c.paper, fontWeight: '800' },
  cellTextPast: { color: c.subtext },
});
}
