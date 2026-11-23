import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, type ThemeColors } from '../constants/theme';
import { countUnreadNotifications } from '../lib/communityContent';
import { schedule } from '../lib/net';
import { useTheme } from '../lib/theme';

export function Screen({ children }: { children: React.ReactNode }) {
  const { colors, dark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.heading}>{children}</Text>;
}

export function Subtext({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.subtext}>{children}</Text>;
}

export function ErrorText({ message }: { message: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

let bellCache: { at: number; value: number } | null = null;
const BELL_TTL_MS = 20_000;

export function NotificationBell({
  size = 20,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      // The bell mounts on many screens: share one request and re-check at
      // most every 20s instead of counting on every focus.
      if (bellCache && Date.now() - bellCache.at < BELL_TTL_MS) {
        setUnread(bellCache.value);
        return;
      }
      schedule('unread-count', () => countUnreadNotifications())
        .then((value) => {
          bellCache = { at: Date.now(), value };
          setUnread(value);
        })
        .catch(() => {});
    }, []),
  );
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={12}
      style={style}
    >
      <Ionicons name="notifications" size={size} color={styles.bellIcon.color} />
      {unread > 0 ? (
        <View style={styles.bellBadge}>
          <Text style={styles.bellCount}>
            {unread > 99 ? '99+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'dark' | 'primary' | 'outline';
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'dark',
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 60,
    }).start();
  }

  function pressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
    }).start();
  }

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={loading || disabled}
      style={styles.buttonOuter}
    >
      <Animated.View
        style={[
          styles.button,
          variant === 'dark' && styles.buttonDark,
          variant === 'primary' && styles.buttonPrimary,
          variant === 'outline' && styles.buttonOutline,
          disabled && !loading && styles.buttonDisabled,
          { transform: [{ scale }] },
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'outline' ? colors.ink : colors.paper}
          />
        ) : (
          <Text
            style={[
              styles.buttonText,
              variant === 'outline' && styles.buttonTextOutline,
            ]}
          >
            {title}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 8,
          backgroundColor: colors.card,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

type FieldProps = TextInputProps & {
  label: string;
  right?: React.ReactNode;
  inputRef?: React.Ref<TextInputInstance>;
};

export function Field({ label, right, inputRef, ...props }: FieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, props.multiline && styles.inputTall]}>
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.subtext}
          style={[
            styles.inputInner,
            props.multiline && styles.inputInnerTall,
          ]}
          {...props}
        />
        {right}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper },
    keyboard: { flex: 1 },
    scroll: { flexGrow: 1, padding: 24 },
    heading: {
      fontFamily: fonts.heading,
      fontSize: 30,
      color: colors.text,
      letterSpacing: 0.5,
    },
    subtext: { fontSize: 15, color: colors.subtext, marginTop: 8, lineHeight: 22 },
    error: {
      fontSize: 14,
      color: colors.danger,
      marginTop: 12,
      lineHeight: 20,
    },
    bellIcon: { color: '#FFFFFF' },
    bellBadge: {
      position: 'absolute',
      top: -6,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellCount: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
    buttonOuter: { marginTop: 16 },
    button: {
      borderRadius: radius.m,
      paddingVertical: 16,
      alignItems: 'center',
    },
    buttonDark: { backgroundColor: colors.ink },
    buttonDisabled: { opacity: 0.4 },
    buttonPrimary: { backgroundColor: colors.primary },
    buttonOutline: {
      backgroundColor: colors.paper,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    buttonPressed: { opacity: 0.85 },
    buttonText: {
      color: colors.paper,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    buttonTextOutline: { color: colors.ink },
    fieldWrap: { marginTop: 16 },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 1,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.m,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inputInner: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 0,
    },
    inputInnerTall: { textAlignVertical: 'top' },
    inputTall: { minHeight: 110, alignItems: 'flex-start' },
  });
}
