import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Logo } from '../components/Logo';
import { Button, Screen } from '../components/ui';
import { fonts, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  getBootstrapSession,
  getCachedPhone,
  setBootstrapDone,
  setCachedPhone,
  takePendingRoute,
} from '../lib/session';
import { getMyPhone } from '../lib/supabase';
import { shouldShowLegalAccept } from '../lib/legal';

export default function Welcome() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(10)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const [checking, setChecking] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
    const slide = Animated.loop(
      Animated.sequence([
        Animated.timing(bar, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(bar, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    slide.start();
    return () => slide.stop();
  }, [bar, fade, rise]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getBootstrapSession();
        if (!alive) return;
        if (!session) {
          takePendingRoute();
          setBootstrapDone(true);
          setChecking(false);
          return;
        }
        // Existing accounts accept the current Terms once, then continue
        // into the workspace. Offline users are never blocked here.
        if (await shouldShowLegalAccept().catch(() => false)) {
          if (!alive) return;
          setBootstrapDone(true);
          router.replace('/legal/accept');
          return;
        }
        setLeaving(true);
        // Cache-first routing: the last known phone opens the app instantly
        // (even offline) while the network confirms in the background.
        const cached = await getCachedPhone();
        if (!alive) return;
        if (cached) {
          setBootstrapDone(true);
          const pending = takePendingRoute();
          if (pending) {
            router.replace({
              pathname: pending.pathname as never,
              params: (pending.params ?? {}) as never,
            });
          } else {
            router.replace('/feed');
          }
          // Background confirm: keep the cache honest for next launch.
          getMyPhone()
            .then((fresh) => setCachedPhone(fresh))
            .catch(() => {});
          return;
        }
        let phone: string | null;
        try {
          phone = await getMyPhone();
          void setCachedPhone(phone);
        } catch {
          // No cache and no network: still open the workspace — every
          // screen renders its saved copy and refreshes when back online.
          if (!alive) return;
          setBootstrapDone(true);
          const pending = takePendingRoute();
          if (pending) {
            router.replace({
              pathname: pending.pathname as never,
              params: (pending.params ?? {}) as never,
            });
          } else {
            router.replace('/feed');
          }
          return;
        }
        if (!alive) return;
        setBootstrapDone(true);
        const pending = takePendingRoute();
        if (phone && pending) {
          router.replace({
            pathname: pending.pathname as never,
            params: (pending.params ?? {}) as never,
          });
        } else if (phone) {
          router.replace('/feed');
        } else {
          router.replace('/profile/phone');
        }
      } catch {
        if (!alive) return;
        setBootstrapDone(true);
        setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  // The welcome route stays mounted under the whole session (login pushes
  // over it, then replaces itself with the workspace), so the system back
  // button can walk a signed-in user back onto it. Bounce them home
  // instead of stranding them on signup/login while signed in. Skipped
  // while the mount bootstrap is still deciding: one bootstrap, no race.
  useFocusEffect(
    useCallback(() => {
      if (checking) return;
      let alive = true;
      (async () => {
        try {
          const session = await getBootstrapSession();
          if (!alive || !session) return;
          if (await shouldShowLegalAccept().catch(() => false)) {
            if (!alive) return;
            setBootstrapDone(true);
            router.replace('/legal/accept');
            return;
          }
          if (!alive) return;
          setLeaving(true);
          setBootstrapDone(true);
          const pending = takePendingRoute();
          if (pending) {
            router.replace({
              pathname: pending.pathname as never,
              params: (pending.params ?? {}) as never,
            });
          } else {
            router.replace('/feed');
          }
        } catch {
          // The check itself failed: stay on welcome, never trap.
        }
      })();
      return () => {
        alive = false;
      };
    }, [checking]),
  );

  if (checking || leaving) {
    const slideX = bar.interpolate({
      inputRange: [0, 1],
      outputRange: [-64, 64],
    });
    return (
      <View style={styles.gate}>
        <Animated.View
          style={[
            styles.gateInner,
            { opacity: fade, transform: [{ translateY: rise }] },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <Logo size={96} />
          </Animated.View>
          <Text style={styles.gateName}>ophixe</Text>
          <Text style={styles.gateSub}>
            {leaving ? 'Opening your workspace…' : 'Preparing your workspace…'}
          </Text>
          <View style={styles.track}>
            <Animated.View
              style={[styles.slider, { transform: [{ translateX: slideX }] }]}
            />
          </View>
          <ActivityIndicator
            style={styles.gateLoader}
            color={c.subtext}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.brandRow}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Logo size={56} />
        </Animated.View>
        <View>
          <Text style={styles.name}>ophixe</Text>
          <Text style={styles.kicker}>STAFF WORK HUB</Text>
        </View>
      </View>
      <Text style={styles.headline}>Your company&apos;s work hub</Text>
      <Text style={styles.tagline}>
        Join your company community for announcements, work chat, tasks,
        dues, and events.
      </Text>
      <View style={styles.list}>
        <View style={styles.item}>
          <Ionicons name="business" size={20} color={c.ink} />
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>Company communities</Text>
            <Text style={styles.itemBody}>
              Find your branch, request to join, meet staff.
            </Text>
          </View>
        </View>
        <View style={styles.item}>
          <Ionicons name="megaphone" size={20} color={c.ink} />
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>Announcements and feed</Text>
            <Text style={styles.itemBody}>
              Updates, posts, and events in one place.
            </Text>
          </View>
        </View>
        <View style={styles.item}>
          <Ionicons name="chatbubble-ellipses" size={20} color={c.ink} />
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>Work chat</Text>
            <Text style={styles.itemBody}>
              DMs with coworkers plus team groups.
            </Text>
          </View>
        </View>
        <View style={styles.item}>
          <Ionicons name="wallet" size={20} color={c.ink} />
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>Tasks, forms, and dues</Text>
            <Text style={styles.itemBody}>
              Tasks, approvals, forms, and wallet payments.
            </Text>
          </View>
        </View>
      </View>
      {phoneError ? (
        <View style={styles.retryBox}>
          <Text style={styles.retryText}>{phoneError}</Text>
          <Button
            title="Retry"
            variant="outline"
            onPress={() => {
              setPhoneError(null);
              setChecking(true);
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button title="Create account" onPress={() => router.push('/signup')} />
        <Button
          title="Log in"
          variant="outline"
          onPress={() => router.push('/login')}
        />
        <Text style={styles.footnote}>
          Built for company staff. You join a company community after signup.
        </Text>
      </View>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  gate: {
    flex: 1,
    backgroundColor: c.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateInner: { alignItems: 'center', width: '100%' },
  gateName: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: c.ink,
    marginTop: 14,
    letterSpacing: -0.5,
  },
  gateSub: { fontSize: 14, color: c.subtext, marginTop: 6 },
  track: {
    width: 168,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginTop: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slider: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.ink,
  },
  gateLoader: { marginTop: 14 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 30,
    color: c.ink,
    letterSpacing: -0.5,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 2,
    marginTop: 2,
  },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: c.text,
    marginTop: 20,
    lineHeight: 40,
  },
  tagline: {
    fontSize: 15,
    color: c.subtext,
    marginTop: 8,
    lineHeight: 22,
  },
  list: { marginTop: 18, gap: 14 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  itemBody: { fontSize: 13, color: c.subtext, marginTop: 2, lineHeight: 19 },
  retryBox: {
    marginTop: 16,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
  },
  retryText: { fontSize: 13, color: c.danger, lineHeight: 19 },
  actions: { marginTop: 8, paddingBottom: 8 },
  footnote: {
    fontSize: 12,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
});
}
