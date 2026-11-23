import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, shadows, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const AVATAR_COLORS = ['#000000', '#26262A', '#3A3A40', '#52525B', '#71717A'];

export function Avatar({ name, size = 44, uri = null }: { name: string; size?: number; uri?: string | null }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const letter = name.trim().slice(0, 1).toUpperCase() || '•';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const backgroundColor =
    AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: c.border,
        }}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
        {letter}
      </Text>
    </View>
  );
}

/** Small "A" membership tag marking community admins beside profiles. */
export function AdminTag({ size = 18 }: { size?: number }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View
      style={[
        styles.adminTag,
        { minWidth: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel="Admin"
    >
      <Text style={[styles.adminTagText, { fontSize: size * 0.6 }]}>A</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionTitle,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={c.ink} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionTitle && onAction ? (
        <Pressable style={styles.emptyBtn} onPress={onAction}>
          <Text style={styles.emptyBtnText}>{actionTitle}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={16} color={c.subtext} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.subtext}
        style={styles.searchInput}
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={c.subtext} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return <Text style={styles.section}>{children}</Text>;
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontWeight: '800', color: '#FFFFFF' },
    adminTag: {
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    adminTagText: { fontWeight: '800', color: c.paper },
    empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    emptyBody: {
      fontSize: 14,
      color: c.subtext,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 21,
    },
    emptyBtn: {
      marginTop: 16,
      backgroundColor: c.ink,
      borderRadius: radius.m,
      paddingHorizontal: 20,
      paddingVertical: 12,
      ...shadows.card,
    },
    emptyBtnText: { fontSize: 14, fontWeight: '800', color: c.paper },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.paper,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      gap: 8,
    },
    searchInput: { flex: 1, height: 34, fontSize: 14, color: c.text },
    section: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      letterSpacing: 1,
      marginTop: 20,
      marginBottom: 8,
    },
  });
}
