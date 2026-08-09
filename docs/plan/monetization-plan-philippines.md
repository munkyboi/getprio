# GetPrio Monetization Plan For The Philippines

## Overview

GetPrio should be priced in PHP and monetized around location count, staff seats, ticket volume, SMS usage, and support level. The main commercial target is the Pro plan, with Economical kept simple for small vendors and Enterprise quoted for larger organizations with heavier onboarding and support needs.

Settled tiers:

- Free: `PHP 0`, queue-only, no payment checkout
- Economical: `PHP 499/mo` or `PHP 4,980/year`
- Pro: `PHP 1,499/mo` or `PHP 14,990/year`
- Enterprise: `PHP 6,999/mo` or `PHP 69,990/year`

For the MVP, use PayMongo for local payment checkout and Semaphore for SMS notifications. Later, evaluate Xendit PH for production billing and ITEXMO for production SMS once real usage, approval requirements, support quality, and pricing are clearer.

## Subscription Tiers

| Tier | Price | Best For | Included |
| --- | ---: | --- | --- |
| Free | `PHP 0` | Vendors starting with queues | Queue System Access; 500 Queue Tickets and 500 Queue Email Journeys per month; no Branding, Discovery, Booking, or Campaigns |
| Economical | `PHP 499/mo` | Solo vendors, small shops, small clinics | Queue, Discovery, Booking, and Campaigns; no public-facing Branding; 1,000 Tickets, 1,000 Journeys, and 100 Service Bookings per month |
| Pro | `PHP 1,499/mo` | Clinics, salons, offices, busier service counters | All five features; 5,000 Tickets, 5,000 Journeys, and 1,000 Service Bookings per month |
| Enterprise | `PHP 6,999/mo` | Multi-branch businesses, schools, LGUs, hospitals | All five features; 50,000 Tickets, 50,000 Journeys, and 10,000 Service Bookings per month |

The `Included` column is both customer-facing pricing copy and the source for backend entitlement rules. Each item should map to a numeric limit, feature flag, support level, or custom-quoted Enterprise entitlement so billing, dashboard display, and future feature gating stay consistent.

Branding applies to every public-facing vendor page, not only the queue board. Campaign access depends on Booking access. Platform Admin may independently enable or disable the customer queue fee and set its amount for each plan; this fee is not part of the vendor's allowance balance.

## Usage Credits

Usage Credits let a vendor continue after its monthly Queue Ticket or Queue Email Journey allowance is used. They never enable a disabled feature and never bypass the Service Booking allowance.

| Pack | Queue Tickets | Queue Email Journeys | Price |
| --- | ---: | ---: | ---: |
| P100 | 100 | 100 | `PHP 99` |
| P500 | 500 | 500 | `PHP 399` |
| P1000 | 1,000 | 1,000 | `PHP 699` |

A Queue Email Journey is the ticket-producing queue flow: up to four OTP messages plus six once-only lifecycle messages. The Journey is consumed at most once when the Ticket is admitted; abandoned or failed OTP attempts do not consume a Journey. Credits are auditable resource-specific lots and are used after the base allowance, with expiring promotional credits before non-expiring promotional and purchased credits.

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
