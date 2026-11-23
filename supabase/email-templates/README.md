# Ophixe email templates

Branded Supabase Auth emails (indigo header, Ophixe logo, violet CTA).
Paste each file into the matching template in the dashboard.

## 1. Logo (already hosted)

The templates point at the public logo object in the `avatars` bucket:
`https://eatxkfopyljdomzbhzym.supabase.co/storage/v1/object/public/avatars/brand/halla-logo.png`
To replace it: Supabase dashboard > Storage > `avatars` bucket > `brand`
folder, upload the new PNG over `halla-logo.png`.

## 2. Paste the templates

Supabase dashboard > Authentication > Email Templates. For each row, open the
template, replace Subject and Message Body, Save. Keep the `{{ ... }}`
placeholders — Supabase fills them per email.

| Dashboard template | Subject                        | File                |
|--------------------|--------------------------------|---------------------|
| Confirm signup     | Confirm your Ophixe account     | confirm-signup.html |
| Reset password     | Reset your Ophixe password      | reset-password.html |
| Invite user        | You've been invited to Ophixe   | invite-user.html    |
| Change email       | Confirm your new Ophixe email   | change-email.html   |

## 3. Check redirect settings

- Authentication > URL Configuration > Redirect URLs must include
  `ophixe://reset-password` so the reset link opens the app.
- Site URL: set it to a page you own (e.g. your company site). The
  confirmation links activate the account when tapped; the app tells the
  user to come back and log in.

## 4. Test

Sign up with a real email, confirm the logo and button render (some mail apps
hide images until "show images" is tapped — that is normal), then test the
forgot-password flow end to end.
