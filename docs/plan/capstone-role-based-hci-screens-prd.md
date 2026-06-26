# GetPrio Role-Based HCI Screen PRD

## Problem Statement

The capstone needs a screen plan that proves GetPrio is role-aware and usable across guests, customers, vendor staff, vendor admins, and platform admins. Screens should not be isolated mockups; they must map to roles, actions, forms, endpoints, RBAC rules, privacy concerns, and vulnerability assessment entries.

## Solution

Create a role-based HCI screen set for public discovery, authentication, customer booking, vendor operations, and platform governance. Each screen should have a clear actor, primary task, visible data, sensitive data boundary, and expected authorization rule.

## User Stories

1. As a guest, I want a landing page that explains GetPrio's marketplace value, so that I understand what the platform offers.
2. As a guest, I want vendor discovery, so that I can compare vendors without logging in.
3. As a guest, I want vendor profile and service detail screens, so that I can evaluate service fit before booking.
4. As a guest, I want login, registration, forgot-password, and reset-password screens, so that I can access or recover my account.
5. As a user with MFA enabled or required, I want an MFA verification screen, so that sensitive roles have stronger login protection.
6. As a locked-out user, I want a clear account locked state, so that I understand the next allowed action without exposing account enumeration details.
7. As an authenticated user, I want a session expiry warning modal, so that I can continue or sign out before losing work.
8. As an unauthorized user, I want an access denied page, so that role boundaries are visible and understandable.
9. As a customer, I want a customer dashboard, so that I can see upcoming bookings, recent activity, and notifications.
10. As a customer, I want search and vendor detail screens, so that I can select a service and start a booking flow.
11. As a customer, I want booking request and confirmation screens, so that I can complete booking intent and review submitted details.
12. As a customer, I want booking history, checkout placeholder, reviews, notifications, and account settings screens, so that I can manage my customer relationship with GetPrio.
13. As vendor staff, I want a staff dashboard, assigned bookings, booking detail, schedule view, and limited customer details, so that I can perform assigned work without broader business access.
14. As a vendor admin, I want business profile, staff management, service catalog, pricing, availability, booking management, and analytics screens, so that I can run the vendor business.
15. As a platform admin, I want dashboard, vendor approval, moderation, dispute, audit log, report, and compliance screens, so that I can govern the marketplace.

## Implementation Decisions

- Route names should be predictable and role-specific enough for documentation and Figma references.
- Navigation must be derived from role and permission state, but server-side authorization remains authoritative.
- Screen-level empty states should explain the operational state without exposing sensitive data.
- Public vendor screens may show business information, service summaries, price ranges, availability summaries, and public reviews.
- Customer screens may show only the signed-in customer's profile, bookings, transactions, reviews, and notifications.
- Vendor staff screens may show assigned bookings, relevant schedules, and limited customer details.
- Vendor admin screens may show vendor-owned business data, services, pricing, staff, schedules, bookings, analytics, and operational settings.
- Platform admin screens may show marketplace-wide governance data required for approvals, moderation, disputes, audit logs, reports, and compliance.
- Every form should be named in the IAS attack surface map.

## Screen Inventory

| Area | Screen | Primary Actor | Key Data / Inputs | Authorization Rule |
| --- | --- | --- | --- | --- |
| Public | Landing page | Guest | Marketplace summary, calls to action | Public |
| Public | Vendor discovery | Guest | Search terms, category, location, filters | Public data only |
| Public | Vendor profile / service details | Guest | Business profile, services, reviews, availability summary | Public data only |
| Auth | Login | Guest | Email, password | Generic auth errors |
| Auth | Register | Guest | Name, email, password, role intent | Public entry, validated server-side |
| Auth | MFA verification | Authenticated pending MFA | OTP or authenticator code | Required for Platform Admin and Vendor Admin |
| Auth | Account locked state | Guest | Lockout message | No account enumeration |
| Auth | Forgot password | Guest | Email | Generic success response |
| Auth | Reset password | Guest | Token, new password | Token validation and session invalidation |
| Auth | Session expiry warning | Authenticated users | Remaining session time | Authenticated session only |
| Auth | Access denied | Authenticated users | Role/permission mismatch | Rendered after failed authorization |
| Customer | Customer dashboard | Customer | Upcoming bookings, notifications | Own data only |
| Customer | Booking flow | Customer | Service, schedule, notes, contact details | Own booking creation |
| Customer | Booking confirmation | Customer | Booking summary, reference, status | Own booking only |
| Customer | Booking history | Customer | Past/upcoming bookings | Own bookings only |
| Customer | Payment / checkout placeholder | Customer | Payment reference, amount, status | Own transaction only |
| Customer | Reviews and ratings | Customer | Rating, review text | Own completed bookings only |
| Customer | Notifications | Customer | Message list, read state | Own notifications only |
| Customer | Profile and account settings | Customer | Name, email, phone, password controls | Own profile only |
| Vendor Staff | Staff dashboard | Vendor Staff | Assigned work summary | Assigned tenant and assignment only |
| Vendor Staff | Assigned bookings | Vendor Staff | Assigned booking list | Assigned bookings only |
| Vendor Staff | Booking detail | Vendor Staff | Limited customer details, service notes | Assigned booking only |
| Vendor Staff | Schedule view | Vendor Staff | Own shifts and assigned bookings | Assigned schedule only |
| Vendor Admin | Vendor dashboard | Vendor Admin | Business metrics and operations | Vendor-owned tenant only |
| Vendor Admin | Business profile management | Vendor Admin | Business name, contact, location, description | Vendor-owned tenant only |
| Vendor Admin | Staff management | Vendor Admin | Staff invites, roles, status | Vendor staff only |
| Vendor Admin | Service catalog management | Vendor Admin | Service name, duration, description | Vendor-owned tenant only |
| Vendor Admin | Pricing management | Vendor Admin | Price, fees, payment rules | Vendor-owned tenant only |
| Vendor Admin | Availability calendar | Vendor Admin | Hours, exceptions, staff capacity | Vendor-owned tenant only |
| Vendor Admin | Booking management | Vendor Admin | Booking list and state changes | Vendor-owned bookings only |
| Vendor Admin | Vendor analytics | Vendor Admin | Booking and revenue indicators | Vendor-owned aggregate data |
| Platform Admin | Platform dashboard | Platform Admin | Marketplace metrics | Platform permission required |
| Platform Admin | Vendor approval queue | Platform Admin | Vendor submissions and verification state | Platform permission required |
| Platform Admin | User management / moderation | Platform Admin | User state, suspension controls | Platform permission required |
| Platform Admin | Dispute resolution | Platform Admin | Dispute records, messages, evidence metadata | Platform permission required |
| Platform Admin | Audit logs | Platform Admin | Security and admin action logs | Platform permission required |
| Platform Admin | Reports / compliance dashboard | Platform Admin | Compliance metrics and exports | Platform permission required |

## Testing Decisions

- Use browser-level tests for critical role navigation, login states, unauthorized pages, and session-expiry UX.
- Use API integration tests to prove hidden screens are also protected server-side.
- Add accessibility checks for form labels, focus order, error text, and responsive layout on required HCI screens.
- Add visual review checkpoints for Figma parity and role-specific navigation.

## Out of Scope

- Pixel-perfect production design system documentation.
- Native mobile screen variants.
- Admin features unrelated to marketplace governance.

## Further Notes

This PRD is the source of truth for Figma and screen implementation scope. IAS Modules 1 to 4 should use this same inventory when mapping controls, privacy data, authentication, and attack surfaces.
