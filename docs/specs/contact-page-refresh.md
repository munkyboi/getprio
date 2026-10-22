# Contact page refresh

Replace the confusing public contact page with a responsive GetPrio support page. The old ContactForm is a capstone-only placeholder: submit changes local state without sending, its vendor instance has no selected recipient, and modal flex/min-height rules cause document overflow.

Acceptance criteria:
- One primary GetPrio support contact action with a clearly identified recipient.
- No simulated submit success, reference-number promises, or unimplemented anti-abuse claims.
- Explicitly label an email-app handoff; users can add attachments in their email client.
- Provide a separate link to vendor discovery for business-specific contact details; do not render an unaddressed vendor form.
- Concise account/payment/technical help, readable typography, GetPrio orange/cream/charcoal colors, scoped CSS, ordinary document scrolling, no footer overlap at mobile/tablet/desktop widths.
- Preserve existing vendor modal and shared navigation/footer behavior.

The public support email defaults to the owner-confirmed support@getprio.online. VITE_GETPRIO_SUPPORT_EMAIL can override it; missing or blank configuration retains the default so the support action stays available. No new support backend or ticket reference service is implied.

Typography: the user selected Aleo after comparing serif options. Contact headings use self-hosted Aleo 600, with its OFL license bundled under shared/fonts/aleo. Body text and buttons retain the existing sans-serif styling.

Project-wide heading rollout: web app and platform dashboard share shared/typography.css and the variable Aleo asset. Default headings use 600; explicit component weights remain supported by the real 100–900 range. Existing sans-serif body, control, and utility-title styles remain. No email-rendering or Flutter typography changes are included without separate scope confirmation.
