# Public Help Center

Carlo selected prototype A (topic directory) on September 10, 2026. It keeps topic cards, prominent search, popular shortcuts, FAQs and contact escalation within the existing public app shell.

Implemented at `/help`, with shareable `?topic=`, `?article=` and `?q=` states. Search covers titles, topic names and article text, matches all query words, and preserves its state when returning from an article. Missing article/topic links offer recovery. Articles link to existing contact, signup and legal destinations. No simulated feedback collection or prototype controls remain.

The guide content covers queue joining, status, cancellation and notifications; booking preparation/cancellation; payment questions/refund contacts; sign-in and privacy; business setup and reporting. It does not define new refund terms or promise support response times. Existing terms and privacy policy remain the source for their respective rules. The separate policy wording review identified in the footer audit is still outstanding.

Source behavior reviewed: JoinedQueuePage waiting-only cancellation and notification fallback; LoginPage password recovery; CustomerBookingDetailPage status-dependent cancellation; ContactPage support routing; TermsPage and PrivacyPolicyPage.

Prototype A is absorbed; B, C and the development-only prototype files have been removed. Deployment is separate from this local implementation.

## Deferred maintenance improvements

See the [Help Center maintenance plan](../plan/help-center-maintenance.md), tracked in [Future Goals](../plan/future-goals.md). The next proposed improvement is article/FAQ ownership and verified review dates; an admin content editor is a later conditional phase.
