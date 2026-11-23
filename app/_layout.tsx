import '../lib/prng';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { setupEncryption } from '../lib/e2ee';
import { ThemeProvider, useTheme } from '../lib/theme';
import { IncomingCallOverlay } from '../components/IncomingCallOverlay';
import { MinimizedCallBar } from '../components/MinimizedCallBar';
import { QuickNav } from '../components/QuickNav';
import { parseInviteUrl } from '../lib/invites';
import {
  clearOfflineData,
  flushMutations,
  startConnectivityMonitor,
} from '../lib/net';
import { registerOfflineHandlers } from '../lib/offlineHandlers';
import {
  clearBadge,
  configureNotifications,
  registerPushToken,
} from '../lib/push';
import { configureRichPush, sendPushReply } from '../lib/richPush';
import { startHeartbeat } from '../lib/presence';
import {
  isBootstrapDone,
  setPendingRoute,
  takePendingRoute,
} from '../lib/session';
import { supabase, syncMyContactEmail } from '../lib/supabase';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

SplashScreen.preventAutoHideAsync();

function targetFromNotification(data: unknown): {
  pathname:
    | '/chat/[id]'
    | '/forms/[id]'
    | '/update'
    | '/community/[id]'
    | '/event/[id]'
    | '/community/poll/[id]'
    | '/post/[id]';
  params?: { id: string; scope?: string };
} | null {
  const parsed = data as { route?: string; id?: string; media?: string } | null;
  if (!parsed?.route) return null;
  if (parsed.route === 'chat' && parsed.id) {
    return { pathname: '/chat/[id]', params: { id: parsed.id } };
    // The generated route types predate /call/[id] (existing pushes cast
    // around it too), so this branch casts as well.
  } else if (parsed.route === 'meeting' && parsed.id) {
    return {
      pathname: '/call/[id]',
      params: { id: parsed.id, scope: 'room', media: parsed.media ?? 'video' },
    } as never;
  } else if (parsed.route === 'forms' && parsed.id) {
    return { pathname: '/forms/[id]', params: { id: parsed.id } };
  } else if (parsed.route === 'update') {
    return { pathname: '/update' };
  } else if (parsed.route === 'community' && parsed.id) {
    return { pathname: '/community/[id]', params: { id: parsed.id } };
  } else if (parsed.route === 'event' && parsed.id) {
    return { pathname: '/event/[id]', params: { id: parsed.id } };
  } else if (parsed.route === 'poll' && parsed.id) {
    return { pathname: '/community/poll/[id]', params: { id: parsed.id } };
  } else if (parsed.route === 'post' && parsed.id) {
    return { pathname: '/post/[id]', params: { id: parsed.id } };
  }
  return null;
}

function routeFromInviteUrl(url: string) {
  const code = parseInviteUrl(url);
  if (!code) return;
  if (!isBootstrapDone()) {
    setPendingRoute({
      pathname: '/community/join',
      params: { code },
    });
    return;
  }
  takePendingRoute();
  router.push({ pathname: '/community/join', params: { code } });
}

function routeFromNotification(data: unknown, actionId?: string, userText?: string) {
  if (actionId === 'reply') {
    const text = (userText ?? '').trim();
    const chat = data as { route?: string; id?: string } | null;
    if (text && chat?.route === 'chat' && chat.id) {
      void sendPushReply(chat.id, text).catch(() => {});
    }
  }
  const target = targetFromNotification(data);
  if (!target) return;
  clearBadge();
  // Cold start: the welcome bootstrap owns the first navigation, so park
  // the tap for it instead of racing it.
  if (!isBootstrapDone()) {
    setPendingRoute({
      pathname: target.pathname,
      params: target.params,
    });
    return;
  }
  takePendingRoute();
  void supabase.auth.getSession().then(({ data: sessionData }) => {
    if (!sessionData.session) {
      router.push('/login');
      return;
    }
    if (target.params) {
      router.push({ pathname: target.pathname, params: target.params });
    } else {
      router.push(target.pathname);
    }
  });
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Oswald_600SemiBold,
    Oswald_700Bold,
  });

  useEffect(() => {
    if (loaded || fontError) SplashScreen.hideAsync().catch(() => {});
    const fallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 4000);
    return () => clearTimeout(fallback);
  }, [loaded, fontError]);

  useEffect(() => {
    configureNotifications();
    void configureRichPush();
    startHeartbeat();
    registerOfflineHandlers();
    startConnectivityMonitor();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        registerPushToken();
        // Fresh sign-in: create + publish our chat key so partners can
        // message us without hitting "waiting for encryption".
        void setupEncryption();
        void syncMyContactEmail();
        // Send anything queued while signed out or offline.
        flushMutations().catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        // Never leak one account's saved lists or outbox to the next.
        clearOfflineData().catch(() => {});
      }
    });
    // Warm start: a persisted session fires INITIAL_SESSION, not SIGNED_IN.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void setupEncryption();
        void syncMyContactEmail();
        // Re-register the push token too: tokens rotate, and a warm start
        // is the common path — without this, pushes can silently stop.
        registerPushToken();
        flushMutations().catch(() => {});
      }
    });
    // Notification tap routing is native-only: the listeners are no-ops on
    // web and getLastNotificationResponseAsync rejects there.
    if (Platform.OS === 'web') {
      return () => {
        authListener.subscription.unsubscribe();
      };
    }
    const linkListener = Linking.addEventListener('url', (event) => {
      routeFromInviteUrl(event.url);
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) routeFromInviteUrl(url);
      })
      .catch(() => {});
    const tapListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        routeFromNotification(response.notification.request.content.data, response.actionIdentifier, response.userText);
      });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          routeFromNotification(response.notification.request.content.data, response.actionIdentifier, response.userText);
        }
      })
      .catch(() => {});
    return () => {
      authListener.subscription.unsubscribe();
      linkListener.remove();
      tapListener.remove();
    };
  }, []);

  if (!loaded) return null;

  return (
    <ThemeProvider>
      <RootShell />
    </ThemeProvider>
  );
}

function RootShell() {
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.stack}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.paper },
          }}
        />
      </View>
      <QuickNav />
      <IncomingCallOverlay />
      <MinimizedCallBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  stack: { flex: 1 },
});
