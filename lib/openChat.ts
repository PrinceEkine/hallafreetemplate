/**
 * Which chat thread is on screen right now (if any). The foreground
 * notification handler mutes that conversation's message banners — the
 * messages are already in front of the user — while calls always ring
 * through and everything still lands in the in-app list.
 */

let openConversationId: string | null = null;

export function setOpenConversation(conversationId: string | null): void {
  openConversationId = conversationId;
}

export function getOpenConversation(): string | null {
  return openConversationId;
}
