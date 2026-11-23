import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

const DIAL = 260;
const RADIUS = 104;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseTime(value: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(value);
  if (!m) return { hour: 10, minute: 0, period: 'AM' };
  const hour = Math.min(12, Math.max(1, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute, period: m[3].toUpperCase() === 'PM' ? 'PM' : 'AM' };
}

function point(index: number): { left: number; top: number } {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
  return {
    left: DIAL / 2 + RADIUS * Math.cos(angle) - 22,
    top: DIAL / 2 + RADIUS * Math.sin(angle) - 22,
  };
}

/**
 * Clock-face time picker (tap the hours, then the minutes). Emits the same
 * "h:MM AM/PM" strings the event forms already store.
 */
export function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const parsed = useMemo(() => parseTime(value), [value]);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');

  function emit(next: { hour: number; minute: number; period: 'AM' | 'PM' }) {
    onChange(`${next.hour}:${pad(next.minute)} ${next.period}`);
  }

  const selectedIndex =
    mode === 'hour' ? parsed.hour % 12 : Math.round(parsed.minute / 5) % 12;
  const numbers = Array.from({ length: 12 }, (_, i) =>
    mode === 'hour' ? String(i === 0 ? 12 : i) : pad(i * 5),
  );

  return (
    <View style={styles.box}>
      <View style={styles.readRow}>
        <Pressable
          style={[styles.readPart, mode === 'hour' && styles.readPartActive]}
          onPress={() => setMode('hour')}
        >
          <Text
            style={[
              styles.readText,
              mode === 'hour' && styles.readTextActive,
            ]}
          >
            {parsed.hour}
          </Text>
        </Pressable>
        <Text style={styles.readColon}>:</Text>
        <Pressable
          style={[styles.readPart, mode === 'minute' && styles.readPartActive]}
          onPress={() => setMode('minute')}
        >
          <Text
            style={[
              styles.readText,
              mode === 'minute' && styles.readTextActive,
            ]}
          >
            {pad(parsed.minute)}
          </Text>
        </Pressable>
        <View style={styles.periods}>
          {(['AM', 'PM'] as const).map((p) => (
            <Pressable
              key={p}
              style={[
                styles.period,
                parsed.period === p && styles.periodActive,
              ]}
              onPress={() => emit({ ...parsed, period: p })}
            >
              <Text
                style={[
                  styles.periodText,
                  parsed.period === p && styles.periodTextActive,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.dialWrap}>
        <View style={styles.dial}>
          <View
            style={[
              styles.hand,
              { transform: [{ rotate: `${selectedIndex * 30}deg` }] },
            ]}
          />
          <View style={styles.pin} />
          {numbers.map((label, i) => {
            const pos = point(i);
            const active = i === selectedIndex;
            return (
              <Pressable
                key={`${mode}-${label}`}
                style={[styles.tick, { left: pos.left, top: pos.top }, active && styles.tickActive]}
                onPress={() => {
                  if (mode === 'hour') {
                    emit({ ...parsed, hour: i === 0 ? 12 : i });
                    setMode('minute');
                  } else {
                    emit({ ...parsed, minute: i * 5 });
                  }
                }}
                accessibilityLabel={
                  mode === 'hour' ? `Hour ${label}` : `Minute ${label}`
                }
              >
                <Text style={[styles.tickText, active && styles.tickTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.hint}>
        {mode === 'hour' ? 'Tap the hour' : 'Tap the minutes (5-minute steps)'}
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: c.paper,
    alignItems: 'center',
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  readPart: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: c.card,
  },
  readPartActive: { backgroundColor: c.ink },
  readText: { fontSize: 28, fontWeight: '800', color: c.text },
  readTextActive: { color: c.paper },
  readColon: { fontSize: 24, fontWeight: '800', color: c.text },
  periods: { flexDirection: 'column', gap: 4, marginLeft: 8 },
  period: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  periodActive: { backgroundColor: c.ink, borderColor: c.ink },
  periodText: { fontSize: 12, fontWeight: '800', color: c.text },
  periodTextActive: { color: c.paper },
  dialWrap: { alignItems: 'center' },
  dial: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  hand: {
    position: 'absolute',
    left: DIAL / 2 - 1.5,
    top: DIAL / 2 - RADIUS,
    width: 3,
    height: RADIUS,
    backgroundColor: c.ink,
    borderRadius: 2,
    transformOrigin: '50% 100%',
  },
  pin: {
    position: 'absolute',
    left: DIAL / 2 - 6,
    top: DIAL / 2 - 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.ink,
  },
  tick: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickActive: { backgroundColor: c.ink },
  tickText: { fontSize: 16, fontWeight: '700', color: c.text },
  tickTextActive: { color: c.paper },
  hint: { fontSize: 12, color: c.subtext, marginTop: 12 },
});
}
