# Launch costs (Ophixe)

Everything this app needs to pay for, checked 20 Nov 2026. Prices change —
confirm on the vendor page before you buy.

## Must pay before Monday's launch

| Item | Cost | Why |
|---|---|---|
| Supabase Pro | **$25/month** | The Free tier pauses the database after 7 days of inactivity — your backend would go to sleep. Pro never pauses and includes 8 GB database, 100 GB storage, 7-day backups. |
| Google Play developer account | **$25 one-time** | Required to list Ophixe on the Play Store. Without it, Android users sideload the APK from GitHub (free, but scarier for non-technical staff). |

**Launch-day minimum: $25 one-time + $25/month = $50.**

## Pay when you need it (free tiers cover launch)

| Item | Free tier | Paid | When you'll pay |
|---|---|---|---|
| EAS Build (Expo) | 15 Android + 15 iOS builds/month | Starter $19/mo (priority queue + $45 build credit), then $1–$4/build | Only if you build constantly or peak queue waits (90+ min) hurt. Launch needs ~2 builds. |
| Agora calls | 10,000 call minutes/month | Voice $0.99 / 1,000 min, HD video $3.99 / 1,000 min | A 100-person company doing 2h of calls each per month ≈ 12,000 min ≈ ~$8 over free. |
| Expo push notifications | Free, unlimited | — | Never. |
| Apple Developer Program | — | **$99/year** | Only when you ship iOS. Android-only launch skips this. Note: Apple review takes 1–3 days typically, so enroll now if iOS matters. |
| Sentry crash reporting | Free tier (5k events/mo) | Team plan exists | Only at real scale. Currently optional — the app runs with no DSN. |
| Resend email (custom SMTP) | 3,000 emails/month free | From ~$20/mo | Deferred already: Supabase's built-in mailer covers launch. |
| Domain (e.g. ophixe.com) | — | ~$10–15/year | Recommended so invite/download links look official. Landing page hosting itself is free (GitHub Pages / Cloudflare Pages). |
| FCM (Android push) + APNs (iOS push) | Free | — | Never. Needed for closed-app push; keys go in the Expo dashboard. |
| Google sign-in (Cloud OAuth) | Free | — | Never. |

## First-year estimate

| Scenario | Year 1 total |
|---|---|
| Android only, small teams (Agora + Supabase inside free/Pro) | ~$25 once + $25/mo = **~$325** (+ ~$12 domain if wanted) |
| Android + iOS, small teams | Above + $99 Apple = **~$424** |
| Growing (EAS Starter + modest Agora overage) | Add ~$19/mo + ~$5–20/mo Agora = **~$700–900/yr** |

## Suggested order

1. **Today:** upgrade Supabase to Pro (stops the 7-day pause), buy the domain.
2. **Today:** pay the $25 Play Console fee and start the store listing (review can take days).
3. **If iOS matters:** enroll in the Apple Developer Program now ($99/yr) — review + build setup is the long pole.
4. **After launch:** watch Agora minutes and Supabase usage; everything else stays $0 until scale forces it.
