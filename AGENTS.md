# AGENTS.md — GetPrio Capstone Context

This repository supports the GetPrio capstone project. Codex and other AI coding agents should treat this file as the primary source of project context before creating screens, routes, components, documents, or security-related implementation.

## Product Summary

GetPrio is a multi-tenant QR-based digital queue management platform. Customers join queues through public QR or online links, verify queue joins, receive ticket numbers, monitor queue movement, and optionally receive near-turn alerts. Vendors manage tenant queue operations, walk-in tickets, locations, service counters, staff access, customer history, queue settings, public board branding, and subscription-related limits. Platform administrators monitor tenants, users, subscriptions, queue fees, queue join payments, and billing events through a separate operations dashboard.

## Capstone Roles

Use these roles consistently across UI, routing, authorization, data models, and documentation:

| Role | Description |
| --- | --- |
| Guest | Public visitor who can view landing content, register, log in, open public queue boards, and join a queue through a tenant QR or online link. |
| Customer | Registered user who can manage profile details, join queues, view ticket history, monitor current tickets, and receive notifications. |
| Vendor Staff | Vendor-side worker with limited tenant access for queue operations, assigned counters, and customer/ticket handling. |
| Vendor Admin | Vendor business owner/admin who manages tenant queue settings, locations, counters, staff, walk-in tickets, history, reports, branding, and billing-related settings. |
| Platform Admin | GetPrio administrator who monitors tenants, users, queue fees, subscriptions, queue join payments, billing events, and platform settings. |

## HCI + IAS Integration Rule

This project is both an HCI prototype and an Information Assurance and Security capstone. Do not treat Figma screens, user journeys, RBAC, privacy, and vulnerability assessment as separate artifacts. They must trace to the same product architecture.

Design decisions should support this chain:

1. Figma/user flows define the screens, forms, endpoints, and user actions.
2. IAS Module 1 maps CIA and IAAA controls to those specific features.
3. IAS Module 2 maps the collected data to privacy classification, legal basis, risks, and mitigations.
4. IAS Module 3 maps authentication, RBAC, session management, and login flow to the same roles/screens.
5. IAS Module 4 maps every endpoint, form, and input field to likely OWASP risks, severity, evidence, and remediation.

## Required Figma Screen Areas

When generating or implementing screens, prioritize role-based screen visibility.

### Public / Guest

- Landing page
- Login
- Register
- Public queue board
- QR/online join queue page
- Ticket lookup state
- Forgot password
- Reset password

### Authentication and Security

- Login
- Register
- OTP verification for public queue join
- CAPTCHA/security check on queue join
- Account locked state / rate-limit state
- Forgot password
- Reset password
- Session expiry warning modal
- Unauthorized / access denied page

### Customer

- Customer dashboard
- Join queue form
- OTP verification
- Ticket confirmation
- Public queue monitor
- Ticket lookup/cancellation
- Queue history
- Payment / checkout placeholder
- Notifications
- Profile and account settings

### Vendor Staff

- Staff dashboard
- Assigned counter view
- Queue operation view
- Ticket detail
- Limited customer/ticket details

### Vendor Admin

- Vendor dashboard
- Queue operations
- Walk-in ticket issuance
- Location management
- Service counter management
- Staff management
- Customer/client history
- Queue history and reports
- Public board theme management
- Queue settings
- Billing/subscription status

### Platform Admin

- Platform admin dashboard
- Tenant list
- User list
- Queue fee configuration
- Subscription plan management
- Queue join payment records
- Billing event records
- Platform settings

## RBAC Expectations

RBAC must determine which screens and actions are visible. Permissions are assigned to roles, not directly to users.

| Role | Create | Read | Update | Delete | Manage Users |
| --- | --- | --- | --- | --- | --- |
| Guest | Queue join requests after OTP/security checks | Landing content, public queue board, own lookup-code ticket state | Own pending join form before submission | Own waiting ticket through lookup code where allowed | No |
| Customer | Queue joins, own profile data | Own account, own queue history, public board data | Own profile and notification preferences | Own waiting ticket where allowed | No |
| Vendor Staff | Walk-in tickets, assigned operational updates | Assigned tenant queue, limited ticket/customer details | Ticket status and counter-related operational actions | Limited/no destructive actions | No |
| Vendor Admin | Locations, counters, staff links, walk-in tickets, settings, public board themes | Tenant queue data, staff, clients, history, reports, billing status | Tenant settings, queue actions, locations, counters, staff roles, themes | Vendor-owned non-critical records where allowed | Vendor staff only |
| Platform Admin | Platform fee/settings changes and admin records | Platform-wide tenants, users, subscriptions, payments, billing events | Queue fees, subscription plan settings, platform settings | Administrative disabling/removal where authorized | Yes |

## Authentication and Session Management Requirements

Use these defaults unless explicitly changed:

- Primary auth: email + password.
- MFA: required for Platform Admin and Vendor Admin; optional/recommended for Vendor Staff; optional for Customer.
- OAuth2: planned post-MVP enhancement for Google/Apple login, primarily for Vendor Admin and Platform Admin accounts. Do not describe OAuth2 as an MVP-complete feature until implemented.
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

- Customer PI: name, email, mobile number, account credentials/password hash, queue notes when provided.
- Queue data: ticket number, lookup code, queue status, join channel, tenant/location, service counter, timestamps, cancellation state.
- Transactional data: queue join payment status, provider references, billing checkout/session records, subscription records.
- Vendor data: tenant/business name, slug, contact details, locations, store hours, queue settings, public board theme assets.
- Staff data: name, email, tenant role, assigned counter/location access.
- System/security data: OTP records, notification delivery logs, login attempts, IP/device metadata if collected, session records, billing webhook events.

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
- Public queue board: excessive data exposure, tenant enumeration, cache/privacy leakage.
- Queue join form: fake joins, injection, spam/abuse, CAPTCHA bypass, OTP brute force.
- Ticket lookup/cancellation: lookup-code guessing, IDOR, unauthorized cancellation.
- Queue operations: broken tenant access control, parameter tampering, race conditions.
- Payment/checkout: payment reference tampering, broken access control, webhook spoofing.
- Profile update: unauthorized update, weak validation.
- Vendor onboarding: tenant slug enumeration, weak validation, duplicate tenant abuse.
- Public board theme uploads: unsafe file upload, stored XSS through asset URLs.
- Staff management: privilege escalation, broken access control.
- Platform dashboard: unauthorized platform access, overbroad data exposure.
- Notification logs: sensitive contact leakage.
- Billing events: unauthorized access, log tampering.

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
