import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getOpenConversation } from './openChat';
import { supabase } from './supabase';

let configured = false;

/**
 * WhatsApp-style presentation: banners + sound + badge even while the app
 * is open, and a high-importance Android channel so messages pop on the
 * phone like a chat app should. Call once from the root layout.
 */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as {
          route?: string;
          id?: string;
          kind?: string;
        } | null;
        // Inside this exact thread: its messages are already on screen,
        // so stay silent — but calls always break through.
        if (
          data?.route === 'chat' &&
          typeof data.id === 'string' &&
          data.kind !== 'call' &&
          data.id === getOpenConversation()
        ) {
          return {
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        return {
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
    if (Platform.OS === 'android' && Device.isDevice) {
      void Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat messages',
        description: 'New messages, calls, and mentions.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      void Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  } catch {
    // Notifications unavailable here — non-fatal.
  }
}

/** Clear the launcher badge (called when a notification is opened). */
export function clearBadge(): void {
  try {
    void Notifications.setBadgeCountAsync(0);
  } catch {
    // Non-fatal.
  }
}

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (!Device.isDevice) return;
    configureNotifications();
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status =
      existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    const token = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('push_tokens').upsert(
      { user_id: user.id, token: token.data },
      { onConflict: 'user_id' },
    );
  } catch {
    // Push unavailable here (e.g. simulator/Expo Go) — non-fatal.
  }
}
