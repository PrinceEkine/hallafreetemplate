import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, type ThemeColors } from '../constants/theme';
import { DISAPPEAR_OPTIONS } from '../lib/safety';
import { useColors } from '../lib/theme';

/**
 * Shared disappearing-messages dropdown (bottom sheet, not a popup).
 * Used by the chat thread and the member profile so both offer the same
 * durations with the same look.
 */
export function DisappearPicker({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: number | null;
  onPick: (seconds: number | null) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Disappearing messages</Text>
          <Text style={styles.sub}>
            New messages vanish for everyone after this long.
          </Text>
          {DISAPPEAR_OPTIONS.map((opt) => {
            const checked = value === opt.seconds;
            return (
              <Pressable
                key={opt.label}
                style={styles.row}
                onPress={() => onPick(opt.seconds)}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityLabel={`${opt.label}${checked ? ', selected' : ''}`}
              >
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={
                      opt.seconds === null ? 'infinite-outline' : 'timer-outline'
                    }
                    size={22}
                    color={c.paper}
                  />
                </View>
                <View style={styles.mid}>
                  <Text style={styles.name}>{opt.label}</Text>
                  <Text style={styles.hint}>{opt.sub}</Text>
                </View>
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={checked ? c.primary : c.subtext}
                />
              </Pressable>
            );
          })}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheet: {
      backgroundColor: c.paper,
      borderTopLeftRadius: radius.l,
      borderTopRightRadius: radius.l,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 12,
    },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    sub: { fontSize: 13, color: c.subtext, marginTop: 4, marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mid: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: c.text },
    hint: { fontSize: 12, color: c.subtext, marginTop: 2 },
  });
}
