# GetPrio HCI Figma Screen Plan

This document defines the Figma scope for the HCI module. It aligns the prototype screens with the current GetPrio queue-platform architecture so the Figma file, user flows, and IAS documents all describe the same product.

## Figma File Structure

Use these pages in Figma:

| Page | Purpose |
| --- | --- |
| 00 Cover and HCI Summary | Project title, target users, problem statement, and design goals. |
| 01 User Flows | End-to-end flows for customer, vendor staff/admin, and platform admin tasks. |
| 02 Wireframes | Low-fidelity frames for core tasks before visual polish. |
| 03 High-Fidelity Screens | Final desktop and mobile UI frames matching the implemented app. |
| 04 Components and States | Reusable buttons, form fields, cards, alerts, status chips, queue tiles, and empty states. |
| 05 HCI Evaluation | Usability criteria, accessibility checks, and scenario-based testing notes. |
| 06 IAS Traceability | Screen-to-data, role, endpoint, and risk mapping for the IAS modules. |

## Design Goals

- Reduce queue uncertainty for customers by making ticket number, queue status, and next action visible at all times.
- Minimize vendor workload by keeping call-next, serve, skip, and walk-in ticket creation within one or two obvious actions.
- Support role-aware navigation so customers, vendor staff, vendor admins, and platform admins only see relevant actions.
- Keep public queue screens readable on mobile devices and larger public displays.
- Make security steps understandable without adding unnecessary friction.
- Treat JWT/session authentication and RBAC as MVP security scope, while marking OAuth2 sign-in as a planned post-MVP enhancement for admin accounts.

## Primary User Flows

### Flow 1: Customer Joins a Queue Through QR

1. Customer scans QR code or opens `/join/:tenantSlug/:locationSlug?`.
2. Customer reviews tenant/location queue context.
3. Customer enters name, email or phone, optional notes, and notification preferences.
4. Customer completes CAPTCHA/security check.
5. Customer requests OTP and verifies the code.
6. System issues ticket number and lookup code.
7. Customer opens public queue monitor and tracks progress.
8. Customer receives near-turn or called notification.

Figma frames:

- Mobile QR Join - Form
- Mobile QR Join - OTP Verification
- Mobile QR Join - Ticket Confirmed
- Mobile Public Queue Board
- Mobile Ticket Lookup / Cancel Waiting Ticket

### Flow 2: Vendor Admin Operates the Queue

1. Vendor admin logs in and lands on dashboard queue section.
2. Vendor selects tenant, location, and service counter.
3. Vendor reviews current, waiting, served, skipped, and cancelled tickets.
4. Vendor creates a walk-in ticket when needed.
5. Vendor calls next ticket.
6. Vendor marks current ticket served or skipped.
7. Vendor checks links for join URL, QR target, and monitor URL.

Figma frames:

- Desktop Vendor Dashboard - Queue Overview
- Desktop Vendor Dashboard - Walk-In Ticket Drawer/Panel
- Desktop Vendor Dashboard - Empty Queue State
- Desktop Vendor Dashboard - Ticket Called State
- Desktop Vendor Dashboard - Queue Links Panel

### Flow 3: Vendor Admin Configures Tenant Operations

1. Vendor admin manages locations and store-hour details.
2. Vendor admin creates service counters and assigns staff.
3. Vendor admin customizes public board theme.
4. Vendor admin reviews client history, queue history, reports, and settings.

Figma frames:

- Desktop Vendor Dashboard - Locations
- Desktop Vendor Dashboard - Staff and Counters
- Desktop Vendor Dashboard - Public Board Theme
- Desktop Vendor Dashboard - History and Reports
- Desktop Vendor Dashboard - Queue Settings

### Flow 4: Platform Admin Monitors the Platform

1. Platform admin logs into the separate operations dashboard.
2. Platform admin reviews tenant/user/subscription metrics.
3. Platform admin updates queue fee and subscription plan configuration.
4. Platform admin reviews queue join payments and billing events.

Figma frames:

- Desktop Platform Dashboard - Login
- Desktop Platform Dashboard - Overview
- Desktop Platform Dashboard - Queue Fees
- Desktop Platform Dashboard - Subscription Plans
- Desktop Platform Dashboard - Tenants / Users Table
- Desktop Platform Dashboard - Payments / Billing Events Table

## Screen Inventory

| Priority | Frame | Viewport | Role | HCI Purpose | IAS Trace |
| --- | --- | --- | --- | --- | --- |
| P0 | Landing Page | Desktop + Mobile | Guest | Explain value and route users to join/register/login. | Public content, registration entry points. |
| P0 | Login | Desktop + Mobile | Customer, Vendor, Platform Admin | Authenticate users with clear error states. | Password auth, JWT/session handling, generic errors; OAuth2 planned post-MVP. |
| P0 | Register Customer | Mobile | Customer | Create account with minimum required fields. | PI collection, password handling. |
| P0 | Register Vendor | Desktop | Vendor Admin | Create tenant workspace. | Tenant creation, owner role assignment. |
| P0 | Join Queue Form | Mobile | Guest/Customer | Complete queue join quickly. | PI collection, CAPTCHA, OTP request. |
| P0 | OTP Verification | Mobile | Guest/Customer | Confirm queue join identity/channel. | OTP risk, brute-force mitigation. |
| P0 | Ticket Confirmed | Mobile | Customer | Show ticket number, lookup code, and next action. | Lookup-code privacy and cancellation control. |
| P0 | Public Queue Board | Mobile + Display | Guest/Customer | Monitor current and waiting state without staff help. | Public data minimization. |
| P0 | Vendor Queue Dashboard | Desktop | Vendor Staff/Admin | Run queue operations efficiently. | Tenant RBAC, ticket state mutation. |
| P0 | Walk-In Ticket Panel | Desktop | Vendor Staff/Admin | Add on-site customers without leaving queue view. | PI collection by staff. |
| P1 | Locations | Desktop | Vendor Admin | Manage branch/location context. | Tenant-scoped records. |
| P1 | Staff and Counters | Desktop | Vendor Admin | Assign operational access and counters. | RBAC and privilege escalation risk. |
| P1 | Public Board Theme | Desktop | Vendor Admin | Customize public-facing brand assets. | Upload and asset URL risks. |
| P1 | Customer Account | Desktop + Mobile | Customer | View customer queue history and account state. | Own-data access. |
| P1 | Platform Overview | Desktop | Platform Admin | Monitor platform activity. | Platform admin authorization. |
| P1 | Queue Fees and Plans | Desktop | Platform Admin | Configure monetization rules. | Financial setting integrity. |
| P1 | Payments and Billing Events | Desktop | Platform Admin | Review provider-related records. | Payment reference exposure. |
| P2 | Unauthorized / Access Denied | Desktop + Mobile | All roles | Explain blocked access and recovery path. | Role-aware access control. |
| P2 | Session Expiry Warning | Desktop + Mobile | Authenticated roles | Prevent surprise data loss and support secure sessions. | Session management. |
| P2 | Error / Empty States | All | All roles | Make failed, loading, and empty states actionable. | Security-conscious error disclosure. |

## Component Checklist

- App shell: top bar, dashboard sidebar, responsive mobile navigation.
- Forms: text input, password input, number input, textarea, checkbox, select, color input, file/image upload control.
- Actions: primary button, secondary button, destructive/cancel button, icon button.
- Queue elements: current-ticket panel, waiting-ticket row, status chip, ticket number badge, lookup-code block.
- Feedback: success alert, error alert, loading skeleton, empty state, confirmation modal.
- Data display: metric card, table, filter controls, plan/fee cards.
- Security states: OTP input, CAPTCHA placeholder, unauthorized page, session-expiry modal, account lock/rate-limit message.
- Post-MVP security enhancement: OAuth2 sign-in entry state for vendor and platform administrators after MVP workflows are stable.

## Accessibility and Usability Checklist

- Mobile join flow works in a single column with visible primary action and no horizontal scrolling.
- Public board uses large ticket numbers and high-contrast status colors.
- Form labels remain visible and are not replaced only by placeholders.
- Error messages state what to fix without exposing whether an email/account exists.
- Interactive targets are at least 44px high on mobile.
- Dashboard tables support scanning through clear headings, status chips, and empty states.
- Color is not the only status signal; statuses also use text labels.
- Keyboard focus order follows the visible layout.
- Destructive actions such as cancellation require a confirmation state.

## HCI Evaluation Scenarios

| Scenario | Success Criteria |
| --- | --- |
| Customer joins a queue from QR link | User completes join, OTP verification, and ticket confirmation without staff assistance. |
| Customer checks queue status | User can identify current ticket, their ticket number, and estimated waiting context within 10 seconds. |
| Vendor calls next customer | Vendor can call next ticket and then serve or skip the current ticket from the main queue screen. |
| Vendor adds walk-in ticket | Vendor can create a ticket with name/contact details without losing visibility of the active queue. |
| Platform admin reviews operations | Admin can identify tenants, users, subscriptions, payments, and billing events from the operations dashboard. |

## Figma Build Notes

- Use desktop frames at 1440px width for dashboards and 390px width for mobile join/account flows.
- Keep one canonical happy path and one security/error state for every P0 flow.
- Name frames with a stable prefix, for example `P0 / Customer / Join Queue - Form`.
- Add small annotations near frames for HCI purpose and IAS trace, but keep annotations outside the actual screen boundaries.
- When importing implemented screens into Figma, capture these routes first: `/`, `/login`, `/register/customer`, `/register/vendor`, `/join/acme-clinic`, `/monitor/acme-clinic`, `/dashboard/queue`, and the platform dashboard `/overview`.
