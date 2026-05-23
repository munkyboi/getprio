# GetPrio Monetization Plan For The Philippines

## Overview

GetPrio should be priced in PHP and monetized around location count, staff seats, ticket volume, SMS usage, and support level. The main commercial target is the Pro plan, with Economical kept simple for small vendors and Enterprise quoted for larger organizations with heavier onboarding and support needs.

Recommended monthly tiers:

- Economical: `PHP 499/mo`
- Pro: `PHP 1,499/mo`
- Enterprise: from `PHP 6,999/mo`

For the MVP, use PayMongo for local payment checkout and Semaphore for SMS notifications. Later, evaluate Xendit PH for production billing and ITEXMO for production SMS once real usage, approval requirements, support quality, and pricing are clearer.

## Subscription Tiers

| Tier | Price | Best For | Included |
| --- | ---: | --- | --- |
| Economical | `PHP 499/mo` | Solo vendors, small shops, small clinics | 1 location, 1 vendor seat, QR join page, public queue board, basic dashboard, email alerts, 100 transactional emails/mo, 500 tickets/mo, 30-day history |
| Pro | `PHP 1,499/mo` | Clinics, salons, offices, busier service counters | 3 locations, 10 staff seats, branded queue pages, analytics, CSV export, queue settings, email alerts, 500 transactional emails/mo, 5,000 tickets/mo, 300 SMS/mo |
| Enterprise | `PHP 6,999+/mo` | Multi-branch businesses, schools, LGUs, hospitals | 10+ locations, advanced roles, SLA/support, 1,095-day history, custom SMS bundle, optional custom domain/SSO |

The `Included` column is both customer-facing pricing copy and the source for backend entitlement rules. Each item should map to a numeric limit, feature flag, support level, or custom-quoted Enterprise entitlement so billing, dashboard display, and future feature gating stay consistent.

## Add-Ons And Setup Fees

| Item | Recommended Price |
| --- | ---: |
| Extra location | `PHP 399/mo` |
| Extra staff seat | `PHP 99/mo` |
| Custom domain / white label | `PHP 999/mo` |
| SMS overage using Semaphore | At least `PHP 1/SMS` |
| Pro assisted setup | Optional, `PHP 2,500-PHP 5,000` |
| Enterprise onboarding | Required, starting at `PHP 10,000` |

Economical should remain self-serve only with no setup fee. Pro should allow optional assisted setup for customers who want help configuring their tenant, QR links, staff access, and notification settings. Enterprise onboarding should be quoted based on branch count, staff training, configuration complexity, SMS sender setup, custom domain needs, and support requirements.

## Payment Gateway Strategy

Use PayMongo for MVP billing because it supports local-friendly checkout options such as cards, GCash, Maya, QRPH, GrabPay, ShopeePay, BillEase, and online banking through hosted checkout. Hosted checkout keeps the implementation smaller and avoids handling sensitive card data directly.

Xendit PH should be the production gateway candidate once GetPrio has paying customers and clearer requirements around automated subscriptions, direct debit, broader payment rails, enterprise invoicing, and operational reporting.

Keep manual GCash, Maya, and bank transfer available as a fallback for early customers and Enterprise invoices. Prefer annual billing for Pro and Enterprise to reduce transaction-fee drag and payment failure risk.

## SMS Provider Strategy

Use Semaphore for MVP SMS because it is focused on the Philippine market and is likely more cost-effective than Twilio for local transactional queue alerts. Pro includes `300 SMS/mo` for MVP. Charge customers at least `PHP 1/SMS` when SMS is metered, and avoid bundling SMS usage into the Economical plan.

Evaluate ITEXMO as the production SMS candidate after validating sender ID approval, delivery rates, API stability, support responsiveness, and volume pricing.

Avoid Twilio as the default Philippine SMS provider because Philippine outbound SMS pricing is too high for low-cost local queue alerts. Keep it only as a possible future international fallback.

## Hosting, Database, Email, Monitoring, And Backups

Use Fly.io in an APAC region near the Philippines, likely Singapore, and start with a small deployment. Scale only after real traffic proves the need.

Use Supabase Free during development and testing. Move to Supabase Pro before production customers depend on the app.

Start with SendGrid if easier email setup matters. Consider Amazon SES later if email volume grows and lower unit cost becomes worth the added deliverability work.

Add monitoring once customers are live. Sentry or an equivalent error monitoring service should be added before onboarding serious paid accounts.

Use Supabase backups plus periodic external database exports before onboarding Enterprise clients or other high-dependency customers.

## Budget MVP Route

- Use PayMongo hosted checkout for MVP.
- Keep manual GCash, Maya, and bank transfer as payment fallback.
- Use Semaphore for SMS and keep email as the default notification path.
- Do not include heavy SMS usage in Economical.
- Use Supabase Free while testing, then Supabase Pro at launch.
- Use one small Fly.io backend instance plus static frontend hosting.
- Keep Enterprise features simple until a real Enterprise lead asks for them.

## Assumptions

- The primary market is the Philippines.
- Most customers are small-to-medium local service businesses.
- Pro is the main target plan and should be positioned as the most popular tier.
- SMS is for transactional queue alerting, not marketing blasts.
- PayMongo is the MVP payment gateway and Xendit PH is the planned production gateway candidate.
- Semaphore is the MVP SMS provider and ITEXMO is the planned production SMS candidate.
- Plan inclusions are treated as backend entitlements, not only pricing-page text.
- Enterprise pricing is custom because support, branch count, SMS volume, onboarding, and integrations vary widely.
