// Guards the high-severity + medium-mobile audit fixes (2026-11-14).
// Run: node tests/check-high-fixes.mjs (also wired into npm test)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function mustNotContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) return;
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

function mustNotExist(path, why) {
  if (existsSync(join(ROOT, path))) {
    failures.push(`${path} must not exist (${why})`);
  }
}

// Auth/session/bootstrap
mustContain('lib/session.ts', 'export type AuthChange', 'auth listener must expose the event');
mustContain('lib/session.ts', 'SIGNED_IN', 'callers must filter to real sign-ins');
mustContain('lib/session.ts', 'takePendingRoute', 'cold-start notification taps must wait for bootstrap');
mustContain('app/index.tsx', 'phoneError', 'phone-gate failures must show a retry, not bypass to feed');
mustNotContain('app/index.tsx', 'onAuthChange', 'welcome must use one bootstrap, not a racing listener');
mustContain('app/_layout.tsx', 'takePendingRoute', 'notification taps must defer until bootstrap');
mustContain('app/_layout.tsx', 'hideAsync().catch', 'splash hide must never hang the launch');
mustContain('lib/supabase.ts', "Platform.OS === 'web'", 'web must detect sessions in URLs');
mustContain('lib/supabase.ts', 'was cancelled', 'cancelled Google sign-in must not route as signed in');
mustContain('lib/supabase.ts', 'emailRedirectTo', 'auth emails must deep-link back to the app');
mustContain('lib/supabase.ts', 'PGRST116', 'phone lookup must distinguish no-row from failure');
mustContain('app/(auth)/confirm-email.tsx', 'exchangeCodeForSession', 'email links must establish a session');
mustContain('app/(auth)/reset-password.tsx', 'token_hash', 'recovery must accept all Supabase link shapes');
mustContain('app/(auth)/forgot.tsx', "createURL('/reset-password'", 'reset links must carry the code param');

// Community privacy
mustContain('lib/communityContent.ts', 'isCommunityMember', 'screens need an active-membership gate');
mustContain('app/community/contact.tsx', 'isCommunityMember', 'invite codes must stay member-only');
mustContain('app/community/[id].tsx', 'requestToJoin', 'outsiders must get a join CTA, not the roster');

// Chat encryption + push
mustContain('app/chat/[id].tsx', "hasn't finished setting up chat yet", 'DMs must refuse to send — never silently go plaintext — when the peer has no key');
mustContain('lib/e2ee.ts', 'Secure storage is unavailable', 'key storage must fail closed');
mustNotContain('lib/e2ee.ts', 'SECRET_FALLBACK_KEY', 'private keys must not persist in plaintext storage');
mustContain('supabase/functions/push-fanout/index.ts', 'New message', 'push must never carry raw chat text');

// Wallet: transfer claims, no Paystack
mustNotExist('supabase/functions/paystack-init', 'Paystack init is removed');
mustNotExist('supabase/functions/paystack-webhook', 'Paystack webhook is removed');
mustNotExist('supabase/functions/paystack-verify', 'Paystack verify is removed');
mustNotContain('lib/wallet.ts', 'paystack', 'dues clear via transfer claims, not Paystack');
mustContain('lib/wallet.ts', 'claimDuePaid', 'members claim dues paid by transfer');
mustContain('lib/wallet.ts', 'reviewTransferClaim', 'admins confirm transfer claims');
mustContain('app/wallet/index.tsx', 'I&apos;VE PAID', 'dues need a transfer-claim action');
mustContain('app/community/edit.tsx', 'setCommunityBank', 'admins set the community account');
mustExist('supabase/migrations/2026111402_transfer_claims.sql');
mustContain('supabase/migrations/2026111402_transfer_claims.sql', 'transfer_claims', 'claims table must exist');
mustContain('supabase/migrations/2026111402_transfer_claims.sql', 'claim_due_paid', 'claim RPC must exist');
mustContain('supabase/migrations/2026111402_transfer_claims.sql', 'review_transfer_claim', 'review RPC must exist');
mustContain('supabase/migrations/2026111402_transfer_claims.sql', 'set_community_bank', 'bank RPC must exist');
mustContain('components/ProfileScreen.tsx', 'profile_contacts', 'phone must come from the contacts table');

// Announcements, feed, teams, media
mustExist('app/announce/[id].tsx');
mustNotContain('app/(tabs)/update.tsx', 'cardPhoto', 'list stays text-only; pictures live on the detail screen');
mustContain('app/(tabs)/update.tsx', '/announce/[id]', 'VIEW POST must open the announcement');
mustNotContain('app/announce/[id].tsx', 'image_url', 'announcement detail carries no picture');
mustContain('app/announce/[id].tsx', 'SEE MORE', 'linked announcement detail must link to the post');
mustContain('app/(tabs)/feed.tsx', 'funnel-outline', 'feed needs the screenshot filter');
mustContain('app/(tabs)/feed.tsx', 'addComment', 'feed cards need inline comments');
mustContain('app/(tabs)/feed.tsx', 'post_media', 'feed must load all post pictures');
mustContain('app/post/new.tsx', 'addPostMedia', 'composer must save attachments via the media helper');
mustNotContain('app/(tabs)/teams.tsx', '+ Group', 'teams match the screenshot: no action row');
mustContain('app/(tabs)/teams.tsx', 'funnel-outline', 'teams need the screenshot filter');
mustContain('lib/communities.ts', 'bustCommunityCache', 'community list cache needs invalidation');
mustExist('supabase/migrations/2026111403_post_media.sql');
mustContain('supabase/migrations/2026111403_post_media.sql', 'post_media', 'post media table must exist');

// Voice notes
mustExist('lib/voice.ts');
mustExist('components/VoiceBubble.tsx');
mustContain('lib/voice.ts', 'secretbox', 'voice audio must be sealed per message');
mustContain('app/chat/[id].tsx', 'VoiceBubble', 'chat must render voice notes');
mustContain('app/chat/[id].tsx', 'useAudioRecorder', 'composer needs the mic flow');
mustNotContain('package.json', 'expo-av', 'unmaintained audio lib must stay out');
mustNotContain('app.json', 'expo-av', 'unmaintained audio plugin must stay out');
mustExist('supabase/migrations/2026111404_voice_notes.sql');
mustContain('supabase/migrations/2026111404_voice_notes.sql', 'voice-notes', 'voice bucket must exist');
mustContain('app.json', 'microphonePermission', 'recording needs the mic permission');

// Exit / delete / transfer lifecycle
mustExist('supabase/migrations/2026111405_community_exit.sql');
mustContain('supabase/migrations/2026111405_community_exit.sql', 'exit_community', 'exit RPC must exist');
mustContain('supabase/migrations/2026111405_community_exit.sql', 'delete_community', 'delete RPC must exist');
mustContain('supabase/migrations/2026111405_community_exit.sql', 'transfer_community_ownership', 'transfer RPC must exist');
mustContain('supabase/migrations/2026111405_community_exit.sql', 'leave_group_chat', 'group leave RPC must exist');
mustExist('supabase/migrations/2026111406_total_delete.sql');
mustContain('supabase/migrations/2026111406_total_delete.sql', 'delete from public.notifications', 'delete must clear notifications');
mustContain('app/community/[id].tsx', 'exitCommunity', 'profile exit must use the RPC');
mustContain('app/community/[id].tsx', 'deleteCommunity', 'owner needs delete');
mustContain('app/community/[id].tsx', 'transferCommunityOwnership', 'owner needs transfer');
mustContain('app/community/[id].tsx', "mod.id === 'pay'", 'only the PAY toggle stays');
mustNotContain('components/DrawerMenu.tsx', 'communities[0]', 'exit must never fall back to another community');
mustContain('app/chat/[id].tsx', 'leaveGroupChat', 'groups need a leave path');
mustContain('lib/communityContent.ts', 'removeCommunityFiles', 'delete must clean buckets');
mustNotContain('app/(tabs)/teams.tsx', 'scopeTitle', 'teams list stands on its own');

// Membership notifications + invites
mustExist('supabase/migrations/2026111408_membership_notifications.sql');
mustContain('supabase/migrations/2026111408_membership_notifications.sql', 'admin_add_member', 'admin add RPC must exist');
mustContain('supabase/migrations/2026111408_membership_notifications.sql', 'trg_membership_insert', 'join trigger must exist');
mustContain('supabase/functions/push-fanout/index.ts', 'member_added', 'fanout must tell added members');
mustNotContain('supabase/functions/push-fanout/index.ts', 'communityMemberIds(communityId', 'fanout helpers need the db client first');
mustContain('supabase/functions/push-fanout/index.ts', "kind: 'community'", 'membership notices need their kind');
mustContain('lib/communityContent.ts', 'adminAddMember', 'client needs the add helper');
mustContain('app/community/directory.tsx', 'INVITE MEMBER', 'directory needs the invite UI');
mustContain('app/notifications.tsx', "community: 'COMMUNITY'", 'feed needs the community label');
mustContain('components/ProfileScreen.tsx', 'COMMUNITY UPDATES', 'prefs need the community toggle');
mustContain('app/community/contact.tsx', 'expo-clipboard', 'invite code needs tap-to-copy');
mustContain('app/community/[id].tsx', 'expo-clipboard', 'profile code needs tap-to-copy');
mustNotContain('components/AppHeader.tsx', 'fontSize: 18', 'header text must shrink');
mustNotContain('components/ScreenHeader.tsx', 'fontSize: 18', 'header text must shrink');
mustContain('app/(tabs)/events.tsx', 'closest upcoming event', 'top banner must show the closest upcoming event');
mustContain('app/event/new.tsx', 'Attach a photo or video', 'admins need the banner option');

// Database hardening
mustExist('supabase/migrations/2026111401_hardening.sql');
mustContain('supabase/migrations/2026111401_hardening.sql', 'CREATE INDEX', 'hot membership paths need indexes');
mustContain('supabase/migrations/2026111401_hardening.sql', "role = 'member'", 'join policy must pin role/status');
mustContain('supabase/migrations/2026111401_hardening.sql', 'cannot review your own', 'withdrawals need self-approval guard');

// Medium mobile: keyboard, touch, small screens
mustContain('components/ui.tsx', 'KeyboardAvoidingView', 'forms must stay above the keyboard');
mustContain('app/(tabs)/_layout.tsx', 'useSafeAreaInsets', 'tab bar must respect device insets');
mustContain('app/(tabs)/chat.tsx', 'keyboardShouldPersistTaps', 'taps must work with search open');
mustContain('app/(tabs)/events.tsx', 'useWindowDimensions', 'week strip must shrink on narrow screens');
mustContain('app/chat/[id].tsx', "flexWrap: 'wrap'", 'reactions must wrap on narrow screens');
mustNotContain('app/forms/new.tsx', 'number-pad', 'form dates pick from a calendar, never typed');
mustContain('app/community/edit.tsx', 'maxLength', 'account inputs need bounds');
mustContain('components/AppHeader.tsx', 'hitSlop={12}', 'header targets must reach 44px');
mustContain('components/ScreenHeader.tsx', 'hitSlop={12}', 'header targets must reach 44px');
mustContain('components/LikeButton.tsx', 'hitSlop={12}', 'like target must reach 44px');
mustContain('components/DrawerMenu.tsx', 'useWindowDimensions', 'drawer must survive rotation');
mustContain('components/DrawerMenu.tsx', 'keyboardShouldPersistTaps', 'drawer taps must work with search open');
mustContain('components/ProfileScreen.tsx', 'minHeight: 44', 'profile actions must reach 44px');
mustContain('lib/uploads.ts', 'Could not determine the file size', 'uploads must validate before loading bytes');

if (failures.length > 0) {
  console.error(`High-fix gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('High-severity and mobile-medium guards pass.');
