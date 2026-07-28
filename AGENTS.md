# AGENTS.md — GetPrio Capstone Context

This repository supports the GetPrio capstone project. Codex and other AI coding agents should treat this file as the primary source of project context before creating screens, routes, components, documents, or security-related implementation.

## Product Summary

GetPrio is a service marketplace and booking platform. Customers discover vendors publicly, view vendor profiles, book services, manage transactions, receive notifications, and leave reviews. Vendors manage their business profile, services, staff, availability, bookings, and operational dashboards. Platform administrators manage vendor approvals, disputes, moderation, audit logs, compliance, and platform governance.

## Capstone Roles

Use these roles consistently across UI, routing, authorization, data models, and documentation:

| Role | Description |
| --- | --- |
| Guest | Public visitor who can browse/search vendors and view public vendor details. |
| Customer | Registered user who can book services, manage profile, view booking history, make payments, receive notifications, and submit reviews. |
| Vendor Staff | Vendor-side worker with limited operational access to assigned bookings and schedules. |
| Vendor Admin | Vendor business owner/admin who manages services, staff, pricing, availability, bookings, and vendor analytics. |
| Platform Admin | GetPrio administrator who manages vendor approval, user moderation, disputes, audit logs, reporting, and compliance. |

## HCI + IAS Integration Rule

This project is both an HCI prototype and an Information Assurance and Security capstone. Do not treat Figma screens, user journeys, RBAC, privacy, and vulnerability assessment as separate artifacts. They must trace to the same product architecture.

Design decisions should support this chain:

1. Figma/user flows define the screens, forms, endpoints, and user actions.
2. IAS Module 1 maps CIA and IAAA controls to those specific features.
3. IAS Module 2 maps the collected data to privacy classification, legal basis, risks, and mitigations.
4. IAS Module 3 maps authentication, RBAC, session management, and login flow to the same roles/screens.
5. IAS Module 4 maps every endpoint, form, and input field to likely OWASP risks, severity, evidence, and remediation.

## Mobile-First UI/UX Rule

All GetPrio screens, prototypes, and reusable components must be designed and implemented mobile-first. The narrow-screen experience is the primary design, not a reduced desktop layout.

- Start layout and CSS from the smallest supported viewport, then add wider-screen enhancements with `min-width` breakpoints.
- Keep primary tasks, status, and actions visible without horizontal scrolling. Stack content and actions on mobile before introducing desktop grids, tables, sidebars, or multi-column layouts.
- Use touch-friendly controls with a minimum interactive target of approximately 44 by 44 CSS pixels and enough spacing to prevent accidental taps.
- Prefer full-width primary actions, drawers, sheets, and focused single-column forms on mobile. Desktop-only hover behavior must not be required to discover or complete an action.
- Make dense tables responsive through cards, prioritized columns, or deliberate scrolling with clear affordances; never silently clip critical information.
- Preserve readable type, labels, validation, loading, empty, error, and confirmation states at narrow widths. Account for the on-screen keyboard and mobile safe areas where relevant.
- Verify new or changed UI at mobile, tablet, and desktop widths. Mobile accessibility and task completion are release criteria, not optional polish.

### Modal UI/UX Standard

Use the customer **Contact Vendor** modal as the canonical task-modal reference. Its implementation is the `contact-vendor-modal` in `frontend/src/pages/VendorProfilePage.tsx`, with the reusable form structure in `frontend/src/components/ContactForm.tsx` and responsive rules in `frontend/src/styles.css`. Follow this pattern unless a documented task requirement calls for a compact confirmation, media-only viewer, destructive warning, or another intentionally different presentation.

#### Required modal anatomy

- Build task modals as a height-bounded flex column with four functional regions: a fixed header, optional fixed introductory guidance, an independently scrollable main region, and a persistent footer. The modal shell, header, guidance, and footer must remain stationary; only the main region may scroll.
- Keep all modal overflow vertical. Set flex children that own scrolling to `min-height: 0`, prevent horizontal overflow at the modal body and scroll-region boundaries, and ensure long labels, filenames, validation messages, and user content wrap instead of widening the modal. The underlying page must remain scroll-locked while the modal is open.
- Use the Contact Vendor header hierarchy: a short uppercase eyebrow that names the task category, followed by a larger action-oriented title that includes the current subject or recipient when useful, such as `CONTACT VENDOR` and `Send <vendor> a Message`. Keep both lines inside the accessible modal title region with the close control aligned at the top-right. Do not repeat either title as another heading in the content.
- Place one short introductory paragraph between the header and form when users need purpose, scope, or response expectations before acting. Keep detailed instructions, alerts, privacy notes, and security notices inside the scrollable region near the fields or decisions they explain.
- Keep the footer semantically connected to submission. It may contain concise delivery, privacy, consequence, or ownership copy plus the primary action. Submission loading, disabled, and retry states must appear on or adjacent to the footer action; validation errors remain beside their relevant fields in the scrollable region.
- Make the persistent footer visually continuous with the modal paper. Its background color must exactly match the modal content surface in every theme and state; inherit the paper background or use the same design token rather than a translucent gradient, tinted panel, or separately hard-coded color. If the footer needs separation from scrolling content, use spacing, a subtle top border, or a restrained shadow that fades into the same paper background.
- Use a dedicated scroll container for long forms or evidence views. Reserve a small gutter for the scrollbar, keep the scrollbar discoverable when content overflows, and do not let it cover fields, attachments, images, or controls.
- Preserve the intrinsic aspect ratio of attachments, payment proofs, QR codes, service images, and other media. Fit media within the available content width with an appropriate `object-fit` behavior; never stretch media or force the modal to scroll sideways.

#### Mobile behavior

- At widths up to approximately `48em`, present task modals as bottom sheets aligned to the bottom edge. Use the full viewport width, cap the working height at approximately `min(92dvh, 48rem)`, leave a small portion of the underlying page visible above the sheet, round only the top corners, and remove any gap beneath the sheet.
- Keep the fixed header compact but readable. Scale the action title for narrow screens without truncating the subject, preserve space for the close control, and do not allow the close control to overlap either title line.
- Arrange the complete task in one vertical reading order. Convert related desktop field groups to one column, make cards, inputs, selects, text areas, alerts, uploads, and media use the full available width, and maintain enough bottom clearance for the on-screen keyboard.
- Stack footer guidance and actions vertically. Keep concise guidance directly above the action it qualifies, make the primary action full-width and at least 44 CSS pixels tall, and include `env(safe-area-inset-bottom)` in the footer padding. Hide a redundant Cancel button when the close control performs the same safe action.
- When the on-screen keyboard reduces the visual viewport, keep the focused field scrollable into view and keep the footer reachable without causing the page behind the modal to move.

#### Desktop and wider-screen behavior

- Above the `48em` mobile breakpoint (the reference CSS begins at `48.0625em`), center the modal and use a bounded task-appropriate width; the Contact Vendor reference uses `lg`. Cap the working height at `min(88dvh, 48rem)`, use a clear dialog radius such as `xl`, and preserve comfortable space around the modal at shorter viewport heights.
- Keep the same mobile-first reading and tab order. Progressively place only closely related, short fields into columns, such as name and email; keep long text, uploads, alerts, and explanatory content full-width.
- Lay out the footer horizontally when space permits: contextual delivery or privacy guidance on the left and the primary action on the right. If explicit cancellation is necessary, place Cancel immediately before the primary action; otherwise rely on the clearly available close control.
- Keep the primary action content-sized on desktop while retaining at least a 44-pixel interactive height. Footer copy must wrap and yield space to the action rather than forcing horizontal overflow.

#### Interaction, accessibility, and verification

- Provide an accessible modal title, trap keyboard focus within the dialog, move initial focus to the first meaningful field or control, support Escape and close-button dismissal only when safe, and return focus to the invoking control after close.
- If closing would discard user input or interrupt an in-flight operation, disable unsafe dismissal or require an explicit discard confirmation. Do not silently lose entered data.
- Preserve visible focus indicators and logical keyboard order across the header, scrollable content, and footer. Do not rely on hover to expose instructions or actions.
- Verify every new or changed modal at narrow mobile, mobile with the keyboard open, tablet, standard desktop, and short desktop viewport sizes. Test with enough content and long values to overflow. Confirm that only the intended main region scrolls, the header and footer remain reachable, no horizontal scrollbar or sideways movement appears, the footer does not cover the final field, and loading, disabled, validation, error, close, Escape, and focus-return states behave correctly.

## Required Figma Screen Areas

When generating or implementing screens, prioritize role-based screen visibility.

### Public / Guest

- Landing page
- Vendor search / discovery
- Vendor profile / service details
- Login
- Register
- Forgot password
- Reset password

### Authentication and Security

- Login
- Register
- MFA verification
- Account locked state
- Forgot password
- Reset password
- Session expiry warning modal
- Unauthorized / access denied page

### Customer

- Customer dashboard
- Search vendors
- Vendor details
- Booking flow / booking request
- Booking confirmation
- Booking history
- Payment / checkout placeholder
- Reviews and ratings
- Notifications
- Profile and account settings

### Vendor Staff

- Staff dashboard
- Assigned bookings
- Booking detail
- Schedule view
- Limited customer details

### Vendor Admin

- Vendor dashboard
- Business profile management
- Staff management
- Service catalog management
- Pricing management
- Availability calendar
- Booking management
- Vendor analytics

### Platform Admin

- Platform admin dashboard
- Vendor approval queue
- User management / moderation
- Dispute resolution
- Audit logs
- Reports / compliance dashboard

## RBAC Expectations

RBAC must determine which screens and actions are visible. Permissions are assigned to roles, not directly to users.

| Role | Create | Read | Update | Delete | Manage Users |
| --- | --- | --- | --- | --- | --- |
| Guest | No | Public vendor listings and vendor profiles | No | No | No |
| Customer | Bookings, reviews, own profile data | Own data, public vendor data | Own profile, bookings where allowed | Own reviews, cancel allowed bookings | No |
| Vendor Staff | Booking status updates, internal notes where allowed | Assigned bookings and limited customer details | Assigned operational tasks | Limited/no destructive actions | No |
| Vendor Admin | Services, schedules, staff records, vendor announcements | Vendor business data, staff, bookings, analytics | Vendor profile, services, pricing, schedules | Vendor-owned non-critical records where allowed | Vendor staff only |
| Platform Admin | Platform records and admin actions | All platform data needed for governance | Users, vendors, disputes, moderation state | Administrative deletion/suspension where authorized | Yes |

## Authentication and Session Management Requirements

Use these defaults unless explicitly changed:

- Primary auth: email + password.
- MFA: required for Platform Admin and Vendor Admin; optional/recommended for Vendor Staff; optional for Customer.
- OAuth: optional/future enhancement for Google/Apple login.
- Password hashing: Argon2id preferred; bcrypt acceptable fallback. Never store plaintext passwords; never use MD5/SHA-1 for password storage.
- Access token: short-lived JWT, about 15 minutes.
- Refresh token: server-tracked/rotated refresh token, about 7–30 days depending on risk.
- Token storage: HttpOnly, Secure, SameSite cookies. Avoid localStorage for sensitive tokens.
- Session fixation prevention: regenerate session identifiers after login.
- Logout: invalidate refresh token server-side.
- CSRF protection: SameSite cookies plus anti-CSRF token for state-changing requests.
- Lockout policy: 5 failed attempts triggers temporary lockout, suggested 15 minutes.
- UX/security crossover: warn users before session expiry.
- Error handling: use generic login errors to avoid user enumeration.

## IAS Module Deliverables to Support

### Module 1 — Security Requirements Worksheet

The app description, CIA Triad, IAAA framework, and OWASP risks must be specific to GetPrio features.

Required content:

- 3–5 sentence application description.
- CIA Triad analysis for confidentiality, integrity, and availability.
- IAAA mapping for identification, authentication, authorization, and accountability.
- At least three relevant OWASP Top 10 risks with justification.

### Module 2 — Privacy Impact Assessment

Use the NPC/Philippine Data Privacy Act framing.

Required content:

- Processing activity description.
- Data subjects: customers, vendor admins, vendor staff, platform admins.
- Data inventory table with field name, data type, PI/SPI classification, purpose, and retention.
- Legal basis under RA 10173.
- At least three privacy risks and mitigations.
- 100–150 word privacy notice draft.

Expected data categories:

- Customer PI: full name, email, mobile number, address if required, profile image, account credentials/password hash.
- Transactional data: bookings, service selections, timestamps, invoices, payment references, review content.
- Vendor data: business name, contact details, service catalog, staff records, business verification documents if required.
- Staff data: name, email, role, schedule, assigned bookings.
- System/security data: audit logs, login attempts, IP/device metadata, session records.

### Module 3 — Authentication and Access Control Design Document

Required sections:

1. Authentication Design — mechanism chosen and justification based on data sensitivity.
2. RBAC Model — user roles and CRUD/manage-user permissions.
3. Session Management Plan — token type, expiry, storage, invalidation, CSRF protection.
4. Login Flow Description — normal login, MFA, error handling, lockout, password reset.

### Module 4 — Vulnerability Assessment Report

If no deployed staging app exists, use predicted findings based on GetPrio architecture and Figma screens.

Required sections:

1. Executive Summary — scope, timeline, tools, and plain-language summary for non-technical audience.
2. Findings Table — vulnerability, severity, OWASP category, evidence/screenshot/log placeholder, CVSS score, and remediation.
3. Attack Surface Map — every endpoint, form, and input field mapped to likely OWASP risk.
4. Remediation Plan — for every Critical/High finding, include specific fix, responsible party, and target resolution date.
5. Residual Risk Statement — known accepted risks and rationale.

Tools referenced by instructor:

- Nmap: `nmap -sV -sC [target IP]`
- Nikto: `nikto -h http://[target IP]`
- OWASP ZAP: active scan of pages/forms
- Burp Suite Community: intercept login requests, test weak credentials, lockout policy
- DVWA/WebGoat: controlled lab targets

Legal framing:

- Penetration testing without written authorization is a criminal offense under RA 10175.
- Any testing must have written authorization and defined scope.
- For capstone without staging, create a structured predicted vulnerability assessment.

## Common GetPrio Attack Surface

Prioritize these in Module 4 and secure implementation:

- Login form: credential stuffing, brute force, weak lockout, user enumeration.
- Registration form: fake accounts, weak validation, enumeration.
- Vendor search: injection, excessive data exposure.
- Vendor profile: stored XSS via descriptions/reviews.
- Booking request: IDOR, parameter tampering, injection.
- Payment/checkout: payment reference tampering, broken access control.
- Review submission: stored XSS, spam/abuse.
- Profile update: unauthorized update, weak validation.
- Vendor onboarding: sensitive document exposure, upload risks.
- Staff management: privilege escalation, broken access control.
- Admin vendor approval: CSRF, broken access control.
- Dispute handling: sensitive data leakage.
- Audit logs: unauthorized access, log tampering.

## Presentation Narrative

Final student presentation is expected to walk through:

1. GetPrio capstone application — what it does, who uses it, and what data it handles.
2. Security requirements — CIA and IAAA mapped to app-specific features.
3. Privacy Impact Assessment — data classification, legal basis, and key risks.
4. Authentication and Access Control Design — mechanism, RBAC, session management.
5. Vulnerability Assessment Report — findings, severity, and remediation.

## Implementation Guidance for AI Agents

- Keep screens and routes role-aware.
- Avoid implementing privileged screens as merely hidden UI; enforce server-side authorization.
- Use realistic but capstone-friendly mock data if backend is incomplete.
- Add comments or docs when a screen exists to support an IAS/HCI deliverable.
- Prefer predictable file organization and component names so Figma, sitemap, and documentation can reference them.
- Do not introduce security-sensitive shortcuts such as localStorage token storage unless explicitly marked as insecure/non-production.
