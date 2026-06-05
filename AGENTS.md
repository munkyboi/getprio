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
