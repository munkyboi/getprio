# Queue email allowance retirement

Carlo confirmed on 14 October 2026 that Queue Email Journeys must be removed from plan metrics and quota/credit enforcement across all plans. Actual queue email delivery, preferences, retries/deduplication and provider observability remain required. Ticket and service-booking allowances are unchanged.

## Frontend ownership

The vendor chat owns public/vendor plan highlights, vendor Reports/Account email-journey metrics, active capacity/credit-pack presentation and public-ticket allowance-exhaustion messaging. API owns backend enforcement, shared types and usage diagnosis. Platform owns Platform/Plan Matrix consumers.

This isolated frontend change is based on main and includes no unpublished dashboard screen rework. It removes email allowance highlights/metrics and the obsolete email-only capacity query. Active capacity hides the retired journey resource from older responses; journey-only legacy packs are excluded and current packs display ticket units only. Unknown current-window usage (`used:null`) is shown as unavailable rather than zero. Public ticket email preference remains visible. Legacy `journey_exhausted` status remains unconfirmed until the server snapshot exposes `emailQuotaPolicy: "unmetered"`; without that marker, the page directs customers to live updates without claiming email delivery is enabled or attributing a retired quota.

## Contract and retained evidence

API coordination specifies that active capacity resources/allowances omit queueEmailJourneys; plan DTO omits monthlyQueueEmailJourneys and retired monthlyTransactionalEmails. Credit catalog may keep deprecated journeyUnits:0 for wire compatibility, with ticketUnits/price/revision unchanged in shape. Active capacity lots omit journey lots; historical purchases/lots remain stored separately. No deletion, conversion, refund or usable retired credit balance is implied by the UI.

The backend supplies current-window net usage without double-counting business records, plus diagnostic base/observed/credit/unaccounted fields, period/usageAvailable and used:null when unavailable. API follow-up at313dbf80 requires period.start <= DB observedAt < period.end; expired/future periods return usageAvailable:false, period/resetAt:null and used:null. Unaccounted facts consume unused base first, then reduce projected creditRemaining. Optional unaccountedCreditUsed records that projection, while creditUsed and lot remainingUnits remain actual ledger evidence; the vendor uses the conservative creditRemaining directly and does not reconstruct it from lots or diagnostics. This projection does not perform a debit or backfill. Delivery uses unmetered journey tracking and retains provider/preference controls. Frontend presentation cannot certify enforcement retirement or actual delivery; coordinated backend PR/deployment acceptance is separate.

## Validation

193 frontend tests, TypeScript, affected-source lint and production build pass. Tests cover retired allowance omission across all four plan slugs while preserving ticket/booking highlights and the Email alerts feature. Synthetic dashboard fixtures verify legacy journey-resource/pack exclusion, ticket-pack retention, unavailable usage and responsive layouts at375/768/1180/1440. Public-ticket fixtures cover old/unknown policy and confirmed unmetered policy with legacy journey_exhausted metadata for both booking and ordinary tickets, disabled preferences, and no horizontal overflow at 375/768/1180/1440. These are synthetic UI checks; hosted gates and actual enforcement/delivery remain separate. Coordinate backend retirement before or atomically with frontend deployment.

Codex review found a two-column wrapper left behind after metric removal. Reports and Subscription now give their single remaining ticket metric the full available width on mobile and desktop.

Mixed-version rollout contract: QueueSnapshot.emailQuotaPolicy is optional and only the exact server value unmetered confirms quota retirement. The API owns shared types and snapshot generation; the frontend intersection keeps this PR compatible before that shared-type commit is merged. Absence/unknown policies retain conservative ticket guidance. Provider acceptance and actual receipt remain separate.
