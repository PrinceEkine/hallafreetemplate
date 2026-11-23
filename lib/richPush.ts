import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  decryptPushBody,
  getDmPeerInfo,
  getGroupMemberKeys,
  markRead,
  missedCallDisplay,
  sendGroupMessage,
  sendMessage,
} from './chat';
import { encryptForGroup, encryptForPeer } from './e2ee';
import { mediaLabel } from './media';
import { getOpenConversation } from './openChat';
import { supabase } from './supabase';

/**
 * WhatsApp-style notification enrichment. Message pushes carry the
 * sealed envelope (opaque to push providers); a background task
 * decrypts on-device and swaps the generic push for the real text —
 * with the sender's photo on iOS. Anything missing keeps the generic
 * push, so enrichment can only upgrade, never silence.
 */

export const RICH_PUSH_TASK = 'OPHIXE_RICH_PUSH';
export const REPLY_CATEGORY = 'chat-reply';

type PushData = {
  route?: string;
  id?: string;
  kind?: string;
  sender?: string;
  sender_id?: string;
  cipher?: string;
  message_id?: string;
  avatar?: string;
  unreadCount?: number;
  totalUnread?: number;
};

async function downloadAvatar(url: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.cache, 'push-avatars');
    try {
      dir.create();
    } catch {
      // Already exists.
    }
    const file = await File.downloadFileAsync(
      url,
      new File(dir, `avatar_${Date.now()}.jpg`),
    );
    return file.uri;
  } catch {
    return null;
  }
}

async function enrichPush(data: unknown): Promise<void> {
  try {
    const body = data as {
      notification?: {
        request?: {
          identifier?: string;
          content?: { title?: string | null; data?: PushData };
        };
      };
    };
    const req = body?.notification?.request;
    const push = req?.content?.data;
    if (
      !req?.identifier ||
      !push ||
      push.route !== 'chat' ||
      typeof push.id !== 'string' ||
      !push.cipher ||
      typeof push.message_id !== 'string' ||
      typeof push.sender_id !== 'string'
    ) {
      return;
    }
    // Inside this exact thread: the handler already silences the generic
    // banner, and the real text is on screen. Nothing to enrich.
    if (push.id === getOpenConversation()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const plain = await decryptPushBody(
      push.id,
      push.message_id,
      push.cipher,
      push.sender_id,
    );
    if (!plain) return;
    const text =
      missedCallDisplay(mediaLabel(plain), push.sender_id, user.id)
        .trim()
        .slice(0, 240) || 'New message';
    let attachments: { identifier: string; url: string; type: string }[] | undefined;
    if (push.avatar && Platform.OS === 'ios') {
      const local = await downloadAvatar(push.avatar);
      if (local) attachments = [{ identifier: 'avatar', url: local, type: 'public.jpeg' }];
    }
    await Notifications.dismissNotificationAsync(req.identifier).catch(
      () => {},
    );
    await Notifications.scheduleNotificationAsync({
      content: {
        // The server title already carries the (n) suffix when stacked.
        title: req.content?.title ?? push.sender ?? 'New message',
        body: text,
        data: { route: 'chat', id: push.id, kind: push.kind ?? 'message' },
        categoryIdentifier: REPLY_CATEGORY,
        threadIdentifier: `chat-${push.id}`,
        ...(typeof push.totalUnread === 'number'
          ? { badge: push.totalUnread }
          : {}),
        ...(attachments ? { attachments } : {}),
      },
      trigger: null,
    });
  } catch {
    // Keep the generic push.
  }
}

let configured = false;

/** Reply action + background enrichment. Call once from the root layout. */
export async function configureRichPush(): Promise<void> {
  if (Platform.OS === 'web' || configured) return;
  configured = true;
  try {
    await Notifications.setNotificationCategoryAsync(REPLY_CATEGORY, [
      {
        identifier: 'reply',
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Send', placeholder: 'Message' },
      },
    ]);
  } catch {
    // Actions unavailable here.
  }
  try {
    if (!TaskManager.isTaskDefined(RICH_PUSH_TASK)) {
      TaskManager.defineTask(RICH_PUSH_TASK, async ({ data, error }) => {
        if (!error) await enrichPush(data);
      });
    }
    await Notifications.registerTaskAsync(RICH_PUSH_TASK);
  } catch {
    // Background enrichment unavailable; generic pushes still arrive.
  }
}

/**
 * Send a notification-tray reply through the normal sealed path. Never
 * downgrades to plaintext: without the peer key the reply is dropped.
 */
export async function sendPushReply(
  conversationId: string,
  text: string,
): Promise<void> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const peer = await getDmPeerInfo(conversationId);
  if (peer.isGroup) {
    const keys = await getGroupMemberKeys(conversationId);
    const fanout = await encryptForGroup(clean, keys, user.id);
    await sendGroupMessage(
      conversationId,
      fanout.selfEnvelope,
      fanout.envelopes,
    );
  } else {
    if (!peer.peerKey) return;
    await sendMessage(conversationId, await encryptForPeer(clean, peer.peerKey));
  }
  await markRead(conversationId).catch(() => {});
}
