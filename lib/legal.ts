import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Legal documents (Terms of Use + Privacy Policy) and acceptance tracking.
 *
 * The section text below is the single source for the in-app screens
 * (app/legal/*); website/terms.html and website/privacy.html mirror it for
 * the public web (store listings link there). Keep the three in sync.
 *
 * IMPORTANT: the entity/contact placeholders must be replaced with real
 * details, and a lawyer should review both documents before launch.
 */

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = '21 November 2026';

export const LEGAL_ENTITY_NAME = 'Skywave';
/** TODO(legal): monitored legal/privacy inbox, e.g. "legal@ophixe.com". */
export const LEGAL_CONTACT_EMAIL = '[legal@yourcompany.com]';
/** TODO(legal): postal address for legal notices. */
export const LEGAL_POSTAL_ADDRESS = '[Company address, City, Country]';

export const LEGAL_WEB_TERMS_URL = 'https://ophixe.vercel.app/terms.html';
export const LEGAL_WEB_PRIVACY_URL = 'https://ophixe.vercel.app/privacy.html';

export type LegalSection = { heading: string; body: string[] };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'Agreement',
    body: [
      `These Terms of Use ("Terms") are a contract between you and ${LEGAL_ENTITY_NAME} ("Ophixe", "we", "us"). By creating an account, joining a community, or using the Ophixe app or website, you agree to these Terms and to the Privacy Policy. If you use Ophixe for work, you also confirm you are authorised to do so.`,
      'If you do not agree, do not create an account or use the service.',
    ],
  },
  {
    heading: '1. The service',
    body: [
      'Ophixe is a staff work hub. Companies and teams ("Communities") use it for announcements, work chat, posts, events, tasks, forms, approvals, and wallet/dues records.',
      'Communities are created and run by their own owners and admins ("Community Owners"). We provide the platform; each Community Owner is responsible for its workspace, its members, and what happens inside it.',
    ],
  },
  {
    heading: '2. Eligibility and your account',
    body: [
      'You must be at least 18 years old to use Ophixe.',
      'Register with accurate details, keep your password and devices secure, and do not share your account. You are responsible for everything done through your account until you tell us it is compromised.',
      'One person, one account. Do not create accounts for other people or use another person\u2019s account.',
    ],
  },
  {
    heading: '3. Communities and company admins',
    body: [
      'Joining a Community means its owners and admins can manage your membership: approve or decline you, assign roles, organise content, and remove you. Admin decisions inside their own workspace are theirs, not ours.',
      'Content you post in a Community is visible to its members as described in the Privacy Policy. Do not post anything your employer would not want shared with coworkers.',
      'Community Owners must use Ophixe lawfully: only invite real staff, respect their privacy, and handle reports about their workspace promptly.',
    ],
  },
  {
    heading: '4. Acceptable use',
    body: [
      'Use Ophixe for lawful work purposes. You must not: harass, threaten, or abuse anyone (including sexual harassment of any kind); post hateful, defamatory, or sexually explicit material; exploit or endanger children in any way; break the law; spam, scam, or mislead; upload malware or try to disrupt the service; scrape, copy, or reverse-engineer the app; impersonate anyone; or share content you have no right to share.',
      'We provide in-app reporting (posts, comments, members, and staff reports). We may remove content and suspend or terminate accounts that violate these Terms, with or without warning, and we cooperate with law enforcement where required.',
    ],
  },
  {
    heading: '5. Your content',
    body: [
      'You keep ownership of what you post. By posting, you grant us and the Community a licence to host, store, display, and distribute that content to Community members as needed to run the service.',
      'Community Owners and admins may organise, edit, or remove content in their workspace under their own rules. Keep your own backups of anything important.',
    ],
  },
  {
    heading: '6. Chats, calls, and encryption',
    body: [
      'Private and group chats are end-to-end encrypted: message keys live on your device and our servers store ciphertext only, so we cannot read message text. Message metadata (who messaged whom, when, delivery and read states) is processed to operate the service.',
      'Disappearing messages delete from devices and are purged server-side, but recipients can screenshot, copy, or forward anything before it disappears. Never treat disappearing messages as guaranteed deletion.',
      'Voice and video calls are relayed by our calling provider. We keep call metadata (who started the call, when, how long, which chat or meeting) for call history, but we never record call audio or video.',
    ],
  },
  {
    heading: '7. Availability, suspension, and termination',
    body: [
      'We work to keep Ophixe reliable but do not guarantee uninterrupted availability. Features may change, pause, or be removed.',
      'We may suspend or terminate accounts that violate these Terms, harm the service or other users, or create legal risk. You may stop using Ophixe at any time; Community Owners may remove members from their own workspaces.',
    ],
  },
  {
    heading: '8. Disclaimers',
    body: [
      'Ophixe is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose. Community content is the responsibility of the people and companies that post it, not ours.',
    ],
  },
  {
    heading: '9. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, Ophixe is not liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of (or inability to use) the service.',
      'Our total liability for any claim is limited to the greater of (a) the amounts you paid us in the 12 months before the claim, or (b) \u20A6100,000. Some of these limits may not apply to you where the law does not allow them.',
    ],
  },
  {
    heading: '10. Indemnity',
    body: [
      'You agree to defend and indemnify us against claims, damages, and costs arising from your content, your use of Ophixe, or your breach of these Terms. Community Owners additionally accept responsibility for how their workspace, admins, and members use the service.',
    ],
  },
  {
    heading: '11. Governing law and disputes',
    body: [
      'These Terms are governed by the laws of Lagos State, Nigeria. Before starting proceedings, the parties will try to resolve any dispute by negotiation for 30 days; unresolved disputes go to the courts of Lagos State.',
    ],
  },
  {
    heading: '12. Changes to these Terms',
    body: [
      'We may update these Terms as the service evolves. We will flag material changes in the app, and continued use after the effective date means you accept the updated Terms. Major changes may ask you to accept again inside the app.',
    ],
  },
  {
    heading: '13. Contact',
    body: [
      `Legal notices and questions about these Terms: ${LEGAL_CONTACT_EMAIL}, ${LEGAL_POSTAL_ADDRESS}.`,
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'Introduction',
    body: [
      `This Privacy Policy explains what ${LEGAL_ENTITY_NAME} ("Ophixe", "we", "us") collects, why, and who can see it when you use the Ophixe staff work hub.`,
      'We control your account and platform data. Each Community Owner independently controls the workspace content inside its own communities (members, posts, files, approvals) and is responsible for how it uses that data.',
    ],
  },
  {
    heading: '1. Data we collect',
    body: [
      'Account data: your name, email address, phone number, profile photo, and sign-in credentials (passwords are handled by our authentication provider, never stored by us in readable form).',
      'Contacts you share at work: your email and phone number are shown on your member profile to fellow active members of communities you share, so coworkers can reach you.',
      'Community content: posts, announcements, comments, events, tasks, forms and approvals, polls, wallet/dues records, and files or photos you upload.',
      'Chat data: message text is end-to-end encrypted and we cannot read it; we process ciphertext, per-recipient envelopes, and metadata such as participants, timestamps, and delivery/read states.',
      'Call metadata: who started a call, when, how long it lasted, and which chat or meeting it belongs to. We never record call audio or video.',
      'Device and technical data: app version, device OS, push notification tokens, and crash/diagnostic logs that help us fix bugs.',
    ],
  },
  {
    heading: '2. How we use your data',
    body: [
      'To run the service: deliver messages, calls, and push notifications; sync your communities across your devices; and keep your account secure.',
      'For safety and support: prevent abuse and spam, act on reports, and help you when you contact us.',
      'We do not sell your data and we show no advertising.',
    ],
  },
  {
    heading: '3. Who sees your data',
    body: [
      'Fellow active members of communities you share can see your name, profile photo, email address, phone number, your content in that community, and your call history in shared communities.',
      'Community owners and admins can additionally manage membership and content in their workspace and review reports made there.',
      'Nobody else can read your chats: end-to-end encryption means even we cannot read message text.',
      'Service providers that process data for us: Supabase (hosting, database, file storage), Expo/Google/Apple (push notification delivery), Agora (voice/video call relay), and Sentry (crash reports). They only process what their job needs.',
      'We disclose data when the law requires it, for example a valid court order.',
    ],
  },
  {
    heading: '4. Where your data lives',
    body: [
      'Your data is hosted by our cloud provider and may be processed outside Nigeria. Where data leaves Nigeria we rely on appropriate safeguards and only for the purposes in section 2.',
      'Chat photos, videos, and files you keep are also stored on your own device, in your Ophixe Media album or folder, outside chat encryption.',
    ],
  },
  {
    heading: '5. Retention and deletion',
    body: [
      'We keep account data while your account is active. Community content follows your Community Owner\u2019s decisions (including removal when you leave). Disappearing messages delete automatically; call logs stay for history until your account or community is deleted.',
      'Delete it yourself any time in the app under My Account > Delete account: your profile, posts, messages, memberships, wallet, and files are erased at once (communities you own move to their longest-standing admin or member).',
      `Prefer help, or already signed out? Ask us via ${LEGAL_CONTACT_EMAIL}; we honour verified requests within 30 days. Backups then age out on our provider\u2019s schedule.`,
    ],
  },
  {
    heading: '6. Your rights',
    body: [
      'Under the Nigeria Data Protection Act 2023 you may request access to, correction of, or deletion of your data; withdraw consent; object to or restrict certain processing; request portability; and complain to the Nigeria Data Protection Commission.',
      `To exercise any right, contact ${LEGAL_CONTACT_EMAIL}. You can already view and edit your name, photo, and phone number inside the app under My Account.`,
    ],
  },
  {
    heading: '7. Security',
    body: [
      'We encrypt traffic in transit, scope every database and file read to your communities, store chat keys and sessions in your device\u2019s secure storage, and never bundle server secrets in the app. No system is perfectly secure, so please report suspected issues to us promptly.',
    ],
  },
  {
    heading: '8. Children',
    body: [
      'Ophixe is for staff aged 18 and over. We do not knowingly collect data from children; if you believe a child uses Ophixe, contact us and we will remove the account.',
    ],
  },
  {
    heading: '9. Changes to this Policy',
    body: [
      'We may update this Policy as the service evolves and will flag material changes in the app. Continued use after the effective date means you accept the updated Policy.',
    ],
  },
  {
    heading: '10. Contact',
    body: [
      `Privacy questions, requests, and complaints: ${LEGAL_CONTACT_EMAIL}, ${LEGAL_POSTAL_ADDRESS}.`,
    ],
  },
];

const LEGAL_CACHE_KEY = '@ophixe:legal-accepted';

/**
 * True when the signed-in user still needs to accept the current legal
 * version. Fail-open: offline users and stale backends (predating the
 * acceptance columns) are never blocked; the gate re-checks when online.
 */
export async function shouldShowLegalAccept(): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(LEGAL_CACHE_KEY).catch(
      () => null,
    );
    if (cached === LEGAL_VERSION) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('profiles')
      .select('accepted_terms_version')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return false;
    const version = (
      data as { accepted_terms_version?: string | null } | null
    )?.accepted_terms_version;
    if (version === LEGAL_VERSION) {
      await AsyncStorage.setItem(LEGAL_CACHE_KEY, LEGAL_VERSION).catch(
        () => {},
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Stamp the current legal version on the caller's own profile. */
export async function recordLegalAcceptance(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({
      accepted_terms_at: new Date().toISOString(),
      accepted_terms_version: LEGAL_VERSION,
    })
    .eq('id', user.id);
  if (error) throw error;
  await AsyncStorage.setItem(LEGAL_CACHE_KEY, LEGAL_VERSION).catch(() => {});
}
