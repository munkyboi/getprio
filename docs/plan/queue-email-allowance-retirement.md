# Queue email allowance retirement

Carlo confirmed on 14 October 2026 that Queue Email Journeys must be removed from plan metrics and quota/credit enforcement across all plans. Actual queue email delivery, preferences, retries/deduplication and provider observability remain required. Ticket and service-booking allowances are unchanged.

## Frontend ownership

The vendor chat owns public/vendor plan highlights, vendor Reports/Account email-journey metrics, active capacity/credit-pack presentation and public-ticket allowance-exhaustion messaging. API owns backend enforcement, shared types and usage diagnosis. Platform owns Platform/Plan Matrix consumers.

This isolated frontend change is based on main and includes no unpublished dashboard screen rework. It removes email allowance highlights/metrics and the obsolete email-only capacity query. Active capacity hides the retired journey resource from older responses; journey-only legacy packs are excluded and current packs display ticket units only. Unknown current-window usage (`used:null`) is shown as unavailable rather than zero. Public ticket email preference remains visible, while retired `journey_exhausted` metadata no longer implies quota-paused delivery.

## Contract and retained evidence

API coordination specifies that active capacity resources/allowances omit queueEmailJourneys; plan DTO omits monthlyQueueEmailJourneys and retired monthlyTransactionalEmails. Credit catalog may keep deprecated journeyUnits:0 for wire compatibility, with ticketUnits/price/revision unchanged in shape. Active capacity lots omit journey lots; historical purchases/lots remain stored separately. No deletion, conversion, refund or usable retired credit balance is implied by the UI.

The backend supplies current-window net usage without double-counting business records, plus diagnostic base/observed/credit/unaccounted fields, period/usageAvailable and used:null when unavailable. Delivery uses unmetered journey tracking and retains provider/preference controls. Frontend presentation cannot certify enforcement retirement or actual delivery; coordinated backend PR/deployment acceptance is separate.

## Validation

191 frontend tests, TypeScript, affected-source lint and production build pass. Tests cover retired allowance omission across all four plan slugs while preserving ticket/booking highlights and the Email alerts feature. Synthetic dashboard fixtures verify legacy journey-resource/pack exclusion, ticket-pack retention, unavailable usage and responsive layouts at375/768/1180/1440. Public-ticket fixtures with legacy journey_exhausted metadata retain enabled email preference and omit quota-pause messages. These are synthetic UI checks; hosted gates and actual enforcement/delivery remain separate. Coordinate backend retirement before or atomically with frontend deployment.
