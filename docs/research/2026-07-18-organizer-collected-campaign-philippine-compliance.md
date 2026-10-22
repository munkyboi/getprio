# Philippine compliance boundary for organizer-collected campaigns

Status: planning research, current to 2026-07-18. This is not legal or tax advice; GetPrio must obtain advice from qualified Philippine counsel before production launch.

## Product analyzed

GetPrio lets an organizer create a collection campaign only after their own booking is paid and vendor-confirmed. Contributors send money directly to the organizer using organizer-provided instructions. GetPrio records campaign details, evidence, organizer decisions, contributor reimbursement confirmation, ratings, reports, and audit events, but does not hold, transmit, settle, or automatically reimburse money.

## Decision

The proposed design can proceed as a **record-only, organizer-to-contributor collection feature** only if it preserves the boundaries below. It must not be presented as investment crowdfunding, a wallet, escrow, or a GetPrio payment service. Formal BSP, SEC, DTI, privacy, consumer, and tax review remains a release gate.

## Regulatory boundaries

### 1. Payment-system risk — BSP review is required before payment expansion

The National Payment Systems Act framework is broad. BSP's OPS FAQ describes an operator as including a person that maintains a platform enabling payments or fund transfers, operates the system/network for transfers, or processes payments on another person's behalf. The current product direction reduces risk by keeping money outside GetPrio, but it is not a definitive exemption. Counsel should obtain a BSP-scope assessment before launch.

Product must not add without that assessment:

- platform-held balances, wallets, escrow, or pooled funds;
- payment initiation, transfer routing, settlement, or automatic reimbursement;
- a GetPrio-controlled payment account or merchant-of-record role for contributor money;
- payment fees calculated from, deducted from, or conditioned on the contributor transfer.

Use organizer payment instructions and evidence as a record of a direct private payment, not as a GetPrio checkout. Never state that GetPrio received, guaranteed, verified, or refunded the money.

Source: [BSP — Operators of Payment Systems FAQ](https://www.bsp.gov.ph/PaymentAndSettlement/FAQ_OPS_Registration.pdf).

### 2. Securities/crowdfunding risk — do not create an investment product

SEC crowdfunding rules govern online equity- and lending-based crowdfunding involving an offer or sale of securities, investors, issuers, and registered intermediaries/funding portals. The campaign must therefore remain a fixed reimbursement for a booked service, not an investment or financing offer.

Product and policy rules:

- use **organizer-collected campaign** or **cost-sharing campaign** in legal/customer copy; do not market it as investment crowdfunding;
- prohibit profit, interest, dividends, returns, ownership, transferable claims, or raising capital for a business/project;
- make the contribution fee, contributor count, booking, and organizer payment separation clear before a customer joins;
- obtain SEC advice before permitting any return, lending, revenue share, investment solicitation, or public capital-raising behavior.

Source: [SEC Memorandum Circular No. 14, Rules and Regulations Governing Crowdfunding](https://www.sec.gov.ph/wp-content/uploads/2019Advisory/2019MCNo14.pdf).

### 3. Data privacy — payment/reimbursement evidence requires a dedicated privacy control set

Screenshots, reference numbers, bank/wallet details, contact preferences, roster identity, ratings, reports, and audit events are personal data. The Data Privacy Act and its IRR require transparency, a declared legitimate purpose, proportionality, lawful processing, appropriate security, data-subject rights, and retention no longer than necessary. The IRR also requires clear information about purpose, extent, retention, and rights.

Before release, GetPrio must:

- update the privacy notice to identify organizer-collected campaigns, evidence, ratings, reports, recipients, access rules, and retention;
- document a lawful basis per purpose; obtain explicit consent where the chosen basis requires it;
- conduct/update a Privacy Impact Assessment and map storage, object access, processors, retention, deletion, and breach response;
- enforce scoped organizer/contributor access; prohibit vendor and public access to evidence; use private storage and short-lived access links;
- record privileged Platform Admin evidence access, limit it to report/dispute/audit cases, and apply a retention/deletion schedule;
- keep silent-push payloads free of evidence, payment references, and sensitive campaign data.

Sources: [Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/), [DPA IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/), [NPC guidance on personal data in images/video](https://privacy.gov.ph/reminder-on-sharing-photos-and-videos-containing-personal-data/).

### 4. E-commerce and consumer protection — disclosure and redress are release requirements

The Internet Transactions Act provides the e-commerce consumer/merchant framework. DTI announced that DAO 25-12 requires covered online merchants, e-retailers, e-marketplaces, and digital platforms to register for the E-Commerce Philippine Trustmark. GetPrio must have counsel confirm its coverage/classification and complete any applicable DTI registration before production use.

The campaign flow and Terms must clearly disclose:

- booking payment versus separate organizer-to-contributor money;
- that GetPrio is not escrow, a payment processor, or the refund payer;
- organizer evidence review, review-overdue, reimbursement confirmation/refusal, report, and Platform Admin freeze paths;
- campaign deadline, cancellation, and no-change-to-booking rule;
- the accessible internal complaint/redress channel and external regulator/contact details as appropriate.

Sources: [DTI — Internet Transactions Act](https://ecommerce.dti.gov.ph/internet-transactions-act-of-2023/), [DTI Trustmark registration notice](https://www.dti.gov.ph/dti-latest-news/dti-sets-sept-30-deadline-mandatory-trustmark-registration).

### 5. Ratings, public discovery, and disputes

Public vendor reviews and public campaign listing create consumer-content, privacy, and fairness risk. The planned controls are required product constraints:

- only a verified qualifying interaction can create a rating;
- public vendor comments need moderation/reporting and a vendor reply; private user ratings remain private;
- disputed ratings are excluded from aggregates pending review; do not use ratings as the sole automated basis for access denial in v1;
- public campaign pages reveal only campaign/service information and aggregate progress; no payment evidence, bank details, contributor identities, or private ratings;
- retain audit evidence for reports/disputes only under a documented, proportionate schedule.

The DPA's transparency, proportionality, security, access, correction, objection, and erasure principles govern this information processing. For any materially automated decision based on ratings, obtain specific privacy/legal review before enabling it.

Sources: [Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/), [DPA IRR](https://privacy.gov.ph/wp-content/uploads/2023/06/IRR_RA-10173-as-amended.pdf).

### 6. Tax and accounting — release blocker for advice, not a product conclusion

This research does not determine whether an organizer's collected contributions are taxable income, reimbursement, or otherwise reportable in a particular case. GetPrio must obtain Philippine tax/accounting advice, keep product copy from making tax promises, and distinguish the vendor booking receipt from the organizer's private collection record.

## Required release artifacts

1. Written BSP/fintech and SEC scope advice confirming the product description and prohibited features.
2. DTI Internet Transactions Act/Trustmark applicability decision and any required registration.
3. Updated Terms, campaign disclosure, reimbursement/dispute policy, ratings policy, and internal redress procedure.
4. Updated privacy notice, PIA, retention schedule, processor/data-sharing inventory, evidence-access policy, and breach procedure.
5. RBAC/IDOR/evidence-access/rating-dispute test evidence and IAS Module 1–4 traceability updates.
6. Philippine tax/accounting advice and approved customer-facing wording.

## Sources checked

- BSP, *Operators of Payment Systems FAQ*, accessed 2026-07-18.
- SEC, *Rules and Regulations Governing Crowdfunding*, MC No. 14 s. 2019, accessed 2026-07-18.
- National Privacy Commission, *Republic Act No. 10173* and *IRR of the Data Privacy Act*, accessed 2026-07-18.
- Department of Trade and Industry, *Internet Transactions Act of 2023* and Trustmark registration notice, accessed 2026-07-18.
