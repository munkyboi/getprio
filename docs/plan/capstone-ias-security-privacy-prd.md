# GetPrio IAS Security and Privacy PRD

## Problem Statement

GetPrio must support Information Assurance and Security deliverables that are specific to the actual capstone product. Security requirements, privacy analysis, authentication design, RBAC, and vulnerability assessment should not be generic documents; they must map to the same roles, screens, forms, endpoints, and data handled by the marketplace and booking experience.

## Solution

Define a security and privacy planning layer that supports IAS Modules 1 to 4. The deliverables should cover CIA, IAAA, Philippine privacy law framing, authentication and access control design, and a predicted vulnerability assessment if no authorized staging environment exists.

## User Stories

1. As a student presenter, I want app-specific CIA and IAAA mappings, so that I can explain how security protects real GetPrio features.
2. As a customer, I want my personal and transactional data protected, so that booking and payment-related activity remains private and accurate.
3. As a vendor admin, I want staff permissions and audit trails, so that business operations are controlled and accountable.
4. As vendor staff, I want only the access needed for assigned work, so that customer details are not overexposed.
5. As a platform admin, I want strong authentication and audit logs, so that privileged governance actions are protected.
6. As a capstone reviewer, I want privacy risks and mitigations mapped to RA 10173, so that the project demonstrates responsible data handling.
7. As a security reviewer, I want an attack surface map for every form and endpoint, so that likely OWASP risks are visible before implementation.
8. As a developer, I want remediation guidance tied to severity, so that high-risk gaps can be fixed first.

## Implementation Decisions

- Use email and password as the primary authentication method.
- Require MFA for Platform Admin and Vendor Admin.
- Recommend MFA for Vendor Staff and allow optional MFA for Customer.
- Prefer Argon2id for password hashing; bcrypt remains an acceptable fallback when already present in the implementation.
- Use short-lived access tokens of about 15 minutes.
- Use server-tracked and rotated refresh tokens of about 7 to 30 days, depending on risk.
- Store sensitive tokens in HttpOnly, Secure, SameSite cookies when productionizing session transport.
- Avoid localStorage for sensitive tokens in production.
- Regenerate session identifiers after login and invalidate refresh tokens on logout.
- Protect state-changing cookie-authenticated requests with SameSite cookies and anti-CSRF tokens.
- Apply temporary lockout after 5 failed login attempts, suggested 15 minutes.
- Use generic login and password reset responses to reduce user enumeration risk.
- Preserve audit logging for authentication, authorization, vendor admin, platform admin, booking, payment, review, and dispute actions.

## Module 1 Requirements

The Security Requirements Worksheet must include:

- A 3 to 5 sentence GetPrio application description.
- CIA Triad analysis for confidentiality, integrity, and availability.
- IAAA mapping for identification, authentication, authorization, and accountability.
- At least three OWASP Top 10 risks with GetPrio-specific justification.

Recommended OWASP risks:

| Risk | GetPrio Relevance |
| --- | --- |
| Broken Access Control | Customers, vendor staff, vendor admins, and platform admins have different data boundaries. |
| Identification and Authentication Failures | Login, password reset, MFA, lockout, and session expiry are core account safety controls. |
| Injection | Search, booking forms, profile fields, service catalog entries, and admin filters accept user input. |
| Cross-Site Scripting | Vendor profiles, service descriptions, reviews, and dispute notes may display stored user content. |
| Security Logging and Monitoring Failures | Platform admin actions, disputes, approvals, and auth events require accountability. |

## Module 2 Requirements

The Privacy Impact Assessment must use NPC/Philippine Data Privacy Act framing and include:

- Processing activity description.
- Data subjects: customers, vendor admins, vendor staff, and platform admins.
- Data inventory table with field name, data type, PI/SPI classification, purpose, and retention.
- Legal basis under RA 10173.
- At least three privacy risks and mitigations.
- A 100 to 150 word privacy notice draft.

Expected data inventory:

| Category | Example Fields | Privacy Notes |
| --- | --- | --- |
| Customer PI | Full name, email, mobile number, address if required, profile image | Used for account, booking, notification, and support workflows. |
| Credentials | Password hash, MFA state, reset tokens | Sensitive security data; never store plaintext passwords. |
| Transactional data | Bookings, service selections, timestamps, invoices, payment references, review content | Required for service delivery, disputes, and records. |
| Group-funded booking data | Campaign visibility, description, participant records, contribution proof metadata, refund records, public campaign metadata | Public payloads must be minimized; contribution proof and refund evidence stay role-scoped and non-public. |
| Vendor data | Business name, contact details, service catalog, verification documents | Public/private split must be explicit. |
| Staff data | Name, email, role, schedule, assigned bookings | Vendor-owned operational data with access limits. |
| System/security data | Audit logs, login attempts, IP/device metadata, session records | Needed for accountability, fraud prevention, and security monitoring. |

## Module 3 Requirements

The Authentication and Access Control Design Document must include:

1. Authentication design and justification based on data sensitivity.
2. RBAC model for Guest, Customer, Vendor Staff, Vendor Admin, and Platform Admin.
3. Session management plan covering token type, expiry, storage, invalidation, and CSRF protection.
4. Login flow description for normal login, MFA, generic error handling, lockout, and password reset.

## Module 4 Requirements

The Vulnerability Assessment Report must include:

1. Executive summary with scope, timeline, tools, and a plain-language summary.
2. Findings table with vulnerability, severity, OWASP category, evidence placeholder, CVSS score, and remediation.
3. Attack surface map for every endpoint, form, and input field.
4. Remediation plan for every Critical/High finding, including specific fix, responsible party, and target resolution date.
5. Residual risk statement with accepted risks and rationale.

If no deployed staging app is authorized, produce a predicted vulnerability assessment based on architecture and screen inventory. Do not run penetration tests against systems without written authorization and scope.

## Attack Surface Priorities

| Surface | Likely Risk |
| --- | --- |
| Login | Brute force, credential stuffing, weak lockout, user enumeration. |
| Registration | Fake accounts, weak validation, account enumeration. |
| Vendor search | Injection, scraping, excessive data exposure. |
| Vendor profile | Stored XSS through descriptions and reviews. |
| Booking request | IDOR, parameter tampering, injection. |
| Payment / checkout | Payment reference tampering, broken access control. |
| Group-funded campaign creation and contribution proof | Stored XSS, excessive public data exposure, payment proof tampering, broken access control, refund repudiation. |
| Review submission | Stored XSS, spam, abusive content. |
| Profile update | Unauthorized update, weak validation. |
| Vendor onboarding | Sensitive document exposure, unsafe upload handling. |
| Staff management | Privilege escalation, broken access control. |
| Vendor approval | CSRF, broken platform authorization. |
| Dispute handling | Sensitive data leakage. |
| Audit logs | Unauthorized access, log tampering. |

## Testing Decisions

- Add focused tests for auth failures, lockout, MFA-required branches, session invalidation, and generic error responses.
- Add RBAC tests for each role and high-risk endpoint group.
- Add privacy-oriented tests or checks for overexposed customer fields in public, staff, and vendor views.
- Add validation and sanitization tests for profile, service, review, booking, dispute, and admin note inputs.
- For capstone vulnerability assessment, document predicted evidence placeholders when live authorized testing is unavailable.

## Out of Scope

- Unauthorized active scanning of third-party or production systems.
- Full legal opinion on RA 10173 compliance.
- Production-grade SOC monitoring.
- Payment provider certification.

## Further Notes

This PRD should drive IAS written deliverables and high-risk implementation backlog items. It should be updated when new screens, endpoints, forms, or collected data fields are added.
