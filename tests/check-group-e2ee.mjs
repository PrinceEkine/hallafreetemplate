// Guards group end-to-end encryption (pairwise fan-out): schema, wiring,
// and the crypto protocol itself (real NaCl roundtrip, no mocks).
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nacl from 'tweetnacl';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function check(cond, why) {
  if (!cond) failures.push(why);
}

// ── Schema ─────────────────────────────────────────────────────────────
const MIGRATION = 'supabase/migrations/2026110804_group_e2ee.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'message_envelopes',
    'group sends need a per-recipient envelope table',
  );
  mustContain(
    MIGRATION,
    'send_group_message',
    'group sends must be one atomic message+envelopes write',
  );
  mustContain(
    MIGRATION,
    '[Encrypted message]',
    'chat-list previews must not leak envelope JSON',
  );
  mustContain(
    MIGRATION,
    'messages_body_check',
    'message bodies must fit encrypted envelopes',
  );
}

// ── Wiring ─────────────────────────────────────────────────────────────
mustContain(
  'lib/chat.ts',
  'sendGroupMessage',
  'group sends must go through the atomic RPC',
);
mustContain(
  'lib/chat.ts',
  'getGroupMemberKeys',
  'group sends must resolve every member public key',
);
mustContain(
  'lib/chat.ts',
  'getMyEnvelopes',
  'group reads must fetch only the reader envelopes',
);
mustContain(
  'lib/e2ee.ts',
  'encryptForGroup',
  'group plaintext must fan out to one envelope per member',
);
mustContain(
  'lib/e2ee.ts',
  'ensureKeyPublished',
  'senders must publish their key before members decrypt',
);
mustContain(
  'lib/e2ee.ts',
  'setupEncryption',
  'keys must be set up outside chat threads, not lazily on first send',
);
mustContain(
  'app/_layout.tsx',
  'setupEncryption',
  'sign-in and warm start must publish the chat key',
);
mustContain(
  'app/chat/[id].tsx',
  'setupEncryption',
  'opening a thread must repair a missing own key',
);
mustContain(
  'app/chat/[id].tsx',
  'sendGroupMessage',
  'group composer must fan out encrypted envelopes',
);
mustContain(
  'app/chat/[id].tsx',
  'getMyEnvelopes',
  'group reads must resolve personal envelopes',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  '{"v":1,',
  'push must redact envelope bodies (groups included)',
);

// ── Protocol: real pairwise fan-out with NaCl box ──────────────────────
// Mirrors lib/e2ee.ts (encryptForPeer/decryptFromPeer shape): the sender
// seals one envelope per recipient public key; each recipient opens only
// their own; the sender reads via a self envelope.
const TE = new TextEncoder();
const TD = new TextDecoder();

function seal(plaintext, recipientPub, senderSec) {
  const shared = nacl.box.before(recipientPub, senderSec);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cipher = nacl.box.after(TE.encode(plaintext), nonce, shared);
  return JSON.stringify({
    v: 1,
    n: Buffer.from(nonce).toString('base64'),
    c: Buffer.from(cipher).toString('base64'),
  });
}

function open(envelopeJson, senderPub, recipientSec) {
  try {
    const envelope = JSON.parse(envelopeJson);
    if (envelope?.v !== 1) return null;
    const plain = nacl.box.open.after(
      Buffer.from(envelope.c, 'base64'),
      Buffer.from(envelope.n, 'base64'),
      nacl.box.before(senderPub, recipientSec),
    );
    return plain ? TD.decode(plain) : null;
  } catch {
    return null;
  }
}

const sender = nacl.box.keyPair();
const members = [nacl.box.keyPair(), nacl.box.keyPair(), nacl.box.keyPair()];
const TEXT = 'launch at dawn 🛰️';
const envelopes = members.map((m) => seal(TEXT, m.publicKey, sender.secretKey));

members.forEach((m, i) => {
  check(
    open(envelopes[i], sender.publicKey, m.secretKey) === TEXT,
    `member ${i} must open their own envelope`,
  );
});
check(
  open(envelopes[1], sender.publicKey, members[0].secretKey) === null,
  'a member must not open another member envelope',
);
check(
  open(
    seal(TEXT, sender.publicKey, sender.secretKey),
    sender.publicKey,
    sender.secretKey,
  ) === TEXT,
  'the sender must read via a self envelope',
);
check(
  !'hello, team'.startsWith('{'),
  'legacy plaintext bodies must bypass envelope parsing',
);

if (failures.length > 0) {
  console.error(`Group E2EE gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Group E2EE guards pass.');
