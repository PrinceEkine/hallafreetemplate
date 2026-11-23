import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

export type DropdownItem = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void;
};

/**
 * X-style anchored dropdown: a small card under the 3-dot trigger instead
 * of a centered popup. The caller measures the trigger and passes the
 * card position; tapping anywhere outside dismisses it.
 */
export function DropdownMenu({
  visible,
  position,
  items,
  onClose,
}: {
  visible: boolean;
  position: { top: number; right: number } | null;
  items: DropdownItem[];
  onClose: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const screenH = Dimensions.get('window').height;
  const top = Math.max(
    8,
    Math.min(
      position?.top ?? 8,
      screenH - items.length * 48 - 32,
    ),
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.card,
          { top, right: position?.right ?? 12 },
          !position && styles.hidden,
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            style={styles.row}
            onPress={() => {
              onClose();
              item.onPress();
            }}
          >
            <Ionicons
              name={item.icon}
              size={18}
              color={item.destructive ? c.danger : c.ink}
            />
            <Text
              style={[styles.label, item.destructive && styles.destructive]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    position: 'absolute',
    minWidth: 210,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  hidden: { opacity: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: { fontSize: 15, fontWeight: '600', color: c.text },
  destructive: { color: c.danger },
});
}
