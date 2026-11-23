// Replay handlers for the offline outbox (lib/net.ts). Kept separate so net.ts
// stays import-cycle free: the data helpers never import this file.
import { markRead, sendGroupMessage, sendMessage } from './chat';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from './communityContent';
import { addComment, myLikedIds, toggleLike } from './engagement';
import { registerMutationHandler } from './net';

let registered = false;

export function registerOfflineHandlers(): void {
  if (registered) return;
  registered = true;

  registerMutationHandler('notification-read', async (payload) => {
    await markNotificationRead(String(payload.id ?? ''));
  });

  registerMutationHandler('notifications-read-all', async () => {
    await markAllNotificationsRead();
  });

  registerMutationHandler('mark-read', async (payload) => {
    await markRead(String(payload.conversationId ?? ''));
  });

  registerMutationHandler('like-set', async (payload) => {
    const postId = String(payload.postId ?? '');
    const want = payload.liked === true;
    const liked = await myLikedIds([postId]);
    // Toggle is relative, so converge to the intent instead of replaying it.
    if (liked.has(postId) !== want) await toggleLike(postId);
  });

  registerMutationHandler('comment', async (payload) => {
    await addComment(String(payload.postId ?? ''), String(payload.body ?? ''));
  });

  registerMutationHandler('send-message', async (payload) => {
    await sendMessage(String(payload.conversationId ?? ''), String(payload.body ?? ''), {
      replyTo: (payload.replyTo as string | null) ?? null,
    });
  });

  registerMutationHandler('send-group-message', async (payload) => {
    const envelopes = (
      (payload.envelopes as { recipientId: string; envelope: string }[] | null) ?? []
    ).map((e) => ({
      recipientId: String(e.recipientId),
      envelope: String(e.envelope),
    }));
    await sendGroupMessage(
      String(payload.conversationId ?? ''),
      String(payload.body ?? ''),
      envelopes,
      { replyTo: (payload.replyTo as string | null) ?? null },
    );
  });
}
