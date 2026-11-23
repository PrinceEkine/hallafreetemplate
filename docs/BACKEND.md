# Backend runbook (Supabase)

Project: **Ophixe** — ref `eatxkfopyljdomzbhzym`
(`https://eatxkfopyljdomzbhzym.supabase.co`).

## CLI basics (v3 syntax)

```powershell
supabase link --project-ref eatxkfopyljdomzbhzym
supabase db push --remote --yes
supabase db query --remote --read-only "<select ...>"
supabase secrets set --yes NAME=value
supabase functions deploy push-fanout --use-api --yes
```

Notes:

- `db push`/`db query` target the local stack unless `--remote` is passed.
- Hosted writes need `--yes` (or `SUPABASE_YES` in the shell).
- `db execute` no longer exists; `db query` replaces it, but it runs with a
  restricted role — `ALTER DATABASE` fails with `42501` there and in the
  dashboard SQL Editor on this project.
- `--use-api` bundles functions server-side (no Docker needed).

## Migrations

Files in `supabase/migrations/` apply in filename order; the version is the
part before the first underscore, so **every prefix must be unique** (three
files once shared `20261108` and the push failed on a duplicate key).

Current chain: `0001`–`0012`, `20261108_chat_depth`,
`2026110801_community_modules`, `2026110802_push_triggers`,
`2026110803_fanout_config`, `2026110804_group_e2ee`,
`20261113_chat_read`, `20261114_file_visibility`,
`2026111401_hardening` (join-policy pin, hot-path indexes,
withdrawal self-review guard),
`2026111402_transfer_claims` (community bank account, transfer claims,
claim/review/bank RPCs; drops the retired Paystack reconcile table),
`2026111403_post_media` (extra pictures per post),
`2026111404_voice_notes` (private voice-notes bucket, participant-only
policies; audio sealed per message, key inside the chat envelope),
`2026111405_community_exit` (exit/delete/transfer/leave-group RPCs with
last-person-deletes),
`2026111406_total_delete` (notifications cleared on delete; admins can
remove their community's bucket files),
`2026111408_membership_notifications` (join/leave triggers, admin add by
phone, community notification kind + pref).

Storage buckets (all live): `avatars` + `post-media` (public),
`evidence` + `community-media` + `community-files` (private). Pushing
`0011`/`0012` out of order needs
`supabase db push --remote --yes --include-all`.

`0012` adds: community logos, contact-list flags, media `link` kind,
file folders, Google-form links, meeting rooms, personal events,
community prefs (pin/low-priority/archive), the notifications feed +
prefs, community group discovery, the `join_group` RPC, and the logo
upload storage policy.

`push-fanout` honors `notification_prefs` per user and writes one
`notifications` row per recipient (row failures never block delivery).

What they create: 24 tables (profiles, communities, members, posts, comments,
likes, chat, forms, wallet, tasks/projects, RSVPs...), RLS policies, indexes,
`pg_net`, push triggers, and storage buckets `avatars` + `post-media`
(public) and `community-media` + `community-files` (private).

## Push notifications

Chain: DB trigger → `post_fanout()` → `push-fanout` edge function → Expo push
API → device. Covers messages, form submissions, announcements, and task
assignments.

Config lives in the locked-down `public.app_settings` table (RLS on, no
policies: only the owner and security-definer functions can read it):

| key             | value                                    |
|-----------------|------------------------------------------|
| `fanout_url`    | seeded by migration `2026110803`         |
| `fanout_secret` | set once via dashboard SQL Editor (below)|

```sql
update public.app_settings
set value = '<FANOUT_SECRET>', updated_at = now()
where key = 'fanout_secret';
```

The secret must match the function's `FANOUT_SECRET` env var
(`supabase secrets set --yes FANOUT_SECRET=<32-char-random>`).
Triggers stay silent until both values are non-empty. To rotate: set a new
function secret, redeploy, then run the `update` above with the same value.

Verify:

```sql
select key, length(value) from public.app_settings;
-- fanout_url > 0, fanout_secret = 32 means live
```

## Edge functions

- `push-fanout` (required) — needs `FANOUT_SECRET`. Answers `401` without the
  `x-fanout-secret` header when healthy.
- Dues are transfer-only (no Paystack): each community has one bank
  account (set via `set_community_bank`), members file claims with
  `claim_due_paid`, and admins confirm with `review_transfer_claim`,
  which writes the `due_payments` row.

## Dashboard checklist

- Auth > URL Configuration: Site URL set; Redirect URLs include
  `ophixe://reset-password`.
- Auth > Email Templates: paste the four files from
  `supabase/email-templates/` (see its README); upload the logo to
  `avatars/brand/ophixe-logo.png` first.
- Auth > Providers > Google: enable with your Cloud OAuth client if you want
  the Google button (email login works without it).
- Auth > Emails > SMTP: leave default for now; Resend goes here later.
- Phone provider: not needed — the app saves the number without OTP for now.
