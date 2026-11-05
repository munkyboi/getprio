# Public campaign eligibility and abuse policy

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: 03, 06

## Question

Which organizer-collected campaigns may enter signed-in public discovery, how are they ranked and limited, what information is visible before join, and what reporting, anti-spam, abuse, and platform-freeze rules apply without exposing payment or user-trust data?

## Known direction

- Share-link visibility remains the default; public listing is explicit opt-in.
- Public discovery is signed-in-only and privacy-minimized.
- Customer controls, scoped evidence, report/freeze authority, and Philippine legal/compliance research are already established dependencies.

## Resolution

1. A campaign enters signed-in public discovery only when both conditions are true: its organizer explicitly opts into public visibility and its booked service has vendor-level **Allow public campaigns** enabled. The setting is vendor consent to public association only; vendor users never manage campaign, contribution, or reimbursement work.
2. Public discovery ranks by nearest campaign deadline, then newest publication. It offers vendor, branch, service, and date filters. Funding amount, contributor count, and ratings do not influence rank in v1.
3. The public card/pre-join page exposes only the Public Campaign Profile: vendor, branch, service or bundle, booking schedule, organizer display name, campaign title/description, join fee, aggregate progress, contributor-slot count, deadline, and a report action. Payment instructions, reference numbers, evidence, contact details, contributor identities, private ratings, and reimbursement information remain hidden until the role-appropriate authenticated action.
4. The organizer may have at most two active public campaigns and at most one campaign per Booking. A frozen campaign or unresolved Reimbursement Dispute blocks additional public publication until resolved.
5. Reporting requires an authenticated customer, a structured category, and an optional short explanation/evidence. Reports are limited to three per account per day. Platform Admin may immediately freeze a campaign to stop public discovery, new joins, and collection actions; permanent removal follows review, never automated report volume alone.
6. Every public campaign form and action receives server-side anti-abuse controls: organizer/contributor scope enforcement, content-length and moderation checks, account/IP rate limits, a hidden honeypot field, duplicate/rapid-submission detection, CSRF/session controls for authenticated writes, and immutable audit events. The frontend may assist usability but is not the enforcement point.
7. A freeze preserves the case history and the affected organizer/contributors' authenticated case access while hiding the campaign from discovery and blocking new money-related actions. It does not expose evidence to public viewers or vendor users.

## Resolution comment

Resolved as opt-in, signed-in public discovery with vendor association consent, privacy-minimized display, bounded publication, and server-enforced abuse/report/freeze controls. The anti-abuse work is an implementation requirement in the rollout cutline, not code delivered by this planning ticket.
