import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

export function LikeButton({
  liked,
  count,
  busy,
  onToggle,
}: {
  liked: boolean;
  count: string;
  busy: boolean;
  onToggle: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 60,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 60,
      }),
    ]).start();
    onToggle();
  }

  return (
    <Pressable onPress={handlePress} hitSlop={12} style={styles.stat}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? c.danger : c.ink}
        />
      </Animated.View>
      <Text style={styles.statText}>{count}</Text>
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 12, color: c.subtext, fontWeight: '600' },
});
}
