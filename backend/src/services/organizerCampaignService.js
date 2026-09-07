const sanitizeHtml = require("sanitize-html");
const bookingRepository = require("../repositories/bookings");
const campaignRepository = require("../repositories/organizerCampaigns");
const locationServiceRepository = require("../repositories/locationServices");
const paymentProofStorageService = require("./paymentProofStorageService");
const pushNotificationService = require("./pushNotificationService");
const notificationService = require("./notificationService");
const userRepository = require("../repositories/users");
const ratingRepository = require("../repositories/ratings");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");
const organizerCampaignEvents = require("./organizerCampaignEvents");
const entitlementAdmissionService = require("./entitlementAdmissionService");

function makeHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function audit(campaignId, eventType, user, metadata = {}) {
  if (typeof campaignRepository.recordEvent !== "function") return;
  await campaignRepository.recordEvent({ campaignId, eventType, actorUserId: user?._id || null, actorRole: "customer", metadata });
  organizerCampaignEvents.publish(campaignId, { eventType });
}

async function notifyCampaignUser({ userId, campaignId, title, body, eventType }) {
  if (typeof campaignRepository.recordEvent !== "function") return;
  await campaignRepository.createNotice?.({ campaignId, recipientUserId: userId, eventType, title, body });
  organizerCampaignEvents.publish(campaignId, { eventType });
  const recipient = await userRepository.findUserById(userId);
  if (!recipient || recipient.notificationSettings?.campaignAlerts === false) return;
  const method = recipient.notificationSettings?.preferredContactMethod || "in_app";
  if (method === "email" && recipient.email) {
    await notificationService.sendEmail({ to: recipient.email, subject: title, text: body, purpose: eventType, metadata: { campaignId } });
    return;
  }
  if (method === "sms" && recipient.phone) {
    await notificationService.sendSms({ to: recipient.phone, body });
    return;
  }
  await pushNotificationService.sendUserNotification({ userId, title, body, url: `/account/campaigns/${campaignId}/manage`, tag: `${eventType}-${campaignId}`, eventType });
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw makeHttpError(`${label} is required.`, 400);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw makeHttpError(`${label} must be ${maxLength} characters or fewer.`, 400);
  }
  return text;
}

function positiveInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw makeHttpError(`${label} must be a whole number between 1 and ${maximum}.`, 400);
  }
  return parsed;
}

function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
}

function validateSimpleRichText(value, label, maxLength, { required = false, moderate = false } = {}) {
  const richText = sanitizeHtml(String(value || "").trim(), {
    allowedAttributes: {},
    allowedTags: ["p", "br", "strong", "em", "s", "ul", "ol", "li", "blockquote"],
    disallowedTagsMode: "discard"
  }).trim();
  const plainText = sanitizeHtml(richText, { allowedAttributes: {}, allowedTags: [] }).replace(/\s+/g, " ").trim();
  if (required && !plainText) throw makeHttpError(`${label} is required.`, 400);
  if (plainText.length > maxLength) throw makeHttpError(`${label} must be ${maxLength} characters or fewer.`, 400);
  if (richText.length > maxLength * 20) throw makeHttpError(`${label} formatting is too complex. Simplify it and try again.`, 400);
  if (moderate) assertPublicTextFieldsAllowed({ [label]: plainText });
  return plainText ? richText : "";
}

function validateDescription(value) {
  return validateSimpleRichText(value, "Campaign description", 1000, { moderate: true });
}

function validatePaymentInstructions(value) {
  return validateSimpleRichText(value, "Payment instructions", 2000, { required: true });
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function resolveDeadlineAtManilaCutoff(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const deadline = new Date(`${value}T22:00:00+08:00`);
    const manila = new Date(deadline.getTime() + MANILA_OFFSET_MS);
    const resolvedDate = `${manila.getUTCFullYear()}-${String(manila.getUTCMonth() + 1).padStart(2, "0")}-${String(manila.getUTCDate()).padStart(2, "0")}`;
    if (Number.isNaN(deadline.getTime()) || resolvedDate !== value) {
      throw makeHttpError("Campaign deadline must be a valid date.", 400);
    }
    return deadline;
  }

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return deadline;
  const manila = new Date(deadline.getTime() + MANILA_OFFSET_MS);
  const usesFixedCutoff = manila.getUTCHours() === 22
    && manila.getUTCMinutes() === 0
    && manila.getUTCSeconds() === 0
    && manila.getUTCMilliseconds() === 0;
  if (!usesFixedCutoff) {
    throw makeHttpError("Campaign deadline must use the 10:00 PM Asia/Manila cutoff.", 400);
  }
  return deadline;
}

function parseDeadline(value, scheduledStartAt) {
  const deadline = resolveDeadlineAtManilaCutoff(value);
  const scheduledStart = new Date(scheduledStartAt);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    throw makeHttpError("Campaign deadline must be in the future.", 400);
  }
  if (Number.isNaN(scheduledStart.getTime()) || deadline.getTime() >= scheduledStart.getTime()) {
    throw makeHttpError("Campaign deadline must be before the booking starts.", 400);
  }
  return deadline.toISOString();
}

async function createCampaign({ user, body }) {
  if (typeof body?.website === "string" && body.website.trim()) throw makeHttpError("Campaign could not be created.", 400);
  const bookingId = positiveInteger(body?.bookingId, "Booking", Number.MAX_SAFE_INTEGER);
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.customerUserId) !== String(user?._id)) {
    throw makeHttpError("Booking not found.", 404);
  }
  await entitlementAdmissionService.admit({ tenantId: booking.tenantId, featureKey: "campaigns" });
  if (booking.status !== "confirmed" || booking.paymentStatus !== "paid") {
    throw makeHttpError("Only a paid, vendor-validated booking can start a campaign.", 409);
  }
  if (!booking.organizerCampaignOptIn) {
    throw makeHttpError("This booking was not selected for an organizer campaign.", 409);
  }

  const title = requiredText(body?.title, "Campaign title", 120);
  const description = validateDescription(body?.description);
  const paymentInstructions = validatePaymentInstructions(body?.paymentInstructions);
  assertPublicTextFieldsAllowed({ "Campaign title": title });

  let campaign;
  try {
    campaign = await campaignRepository.createCampaign({
      bookingId, organizerUserId: user._id, title, description,
      deadlineAt: parseDeadline(body?.deadlineAt, booking.scheduledStartAt),
      contributionFeeCents: positiveInteger(body?.contributionFeeCents, "Contribution fee", 100000000),
      requiredContributors: positiveInteger(body?.requiredContributors, "Contributor count", 100), paymentInstructions
    });
  } catch (error) {
    if (error?.code === "23505") throw makeHttpError("This booking already has a campaign.", 409);
    throw error;
  }
  await audit(campaign.id, "campaign_created", user, { bookingId });
  return attachBookingDetails(campaign, booking);
}

async function listCampaignsForCustomer({ user }) {
  await expireDueCampaigns();
  return campaignRepository.listCampaignsForCustomer(user._id);
}

async function attachBookingDetails(campaign, existingBooking = null) {
  if (!campaign) return campaign;
  const booking = existingBooking || await bookingRepository.findBookingById(campaign.bookingId);
  if (!booking) return campaign;
  const organizerTrustRating = campaign.organizerTrustRating
    || (campaign.organizerUserId ? await ratingRepository.getUserTrustAggregate(campaign.organizerUserId) : undefined);
  const bundleItems = booking.bundleItems?.length
    ? booking.bundleItems
    : [{
        id: booking.serviceId,
        serviceId: booking.serviceId,
        serviceName: booking.serviceName,
        serviceSlug: booking.serviceSlug,
        imageUrl: booking.serviceImageUrl || "",
        bookingQuantity: booking.bookingQuantity,
        priceAmountCents: booking.servicePriceAmountCents,
        currency: booking.serviceCurrency,
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt,
        sortOrder: 0
      }];
  return {
    ...campaign,
    ...(organizerTrustRating ? { organizerTrustRating } : {}),
    scheduledStartAt: booking.scheduledStartAt,
    booking: {
      id: booking._id,
      reference: booking.reference,
      vendorName: booking.tenantName,
      vendorSlug: booking.tenantSlug,
      locationName: booking.locationName,
      locationSlug: booking.locationSlug,
      locationAddress: booking.locationAddress || "",
      locationTimezone: booking.locationTimezone || "Asia/Manila",
      scheduledStartAt: booking.scheduledStartAt,
      scheduledEndAt: booking.scheduledEndAt,
      bundleItems
    }
  };
}

async function getCampaignForOrganizer({ user, campaignId }) {
  await campaignRepository.expireStaleReservations?.(campaignId);
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign || String(campaign.organizerUserId) !== String(user?._id)) {
    throw makeHttpError("Campaign not found.", 404);
  }
  const [contributions, reimbursements, events] = await Promise.all([
    campaignRepository.listContributionsByCampaign?.(campaign.id) || [],
    campaignRepository.listReimbursementsByCampaign?.(campaign.id) || [],
    campaignRepository.listEventsByCampaign?.(campaign.id) || []
  ]);
  const contributionsWithTrust = await Promise.all(contributions.map(async (contribution) => ({ ...contribution, trustRating: await ratingRepository.getUserTrustAggregate(contribution.contributorUserId) })));
  return { ...campaign, contributions: contributionsWithTrust, reimbursements, events };
}

async function updateCampaign({ user, campaignId, body }) {
  if (typeof body?.website === "string" && body.website.trim()) throw makeHttpError("Campaign could not be updated.", 400);
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.DRAFT) throw makeHttpError("Only a draft campaign can be edited.", 409);
  const booking = await bookingRepository.findBookingById(campaign.bookingId);
  const title = requiredText(body?.title, "Campaign title", 120);
  const description = validateDescription(body?.description);
  const paymentInstructions = validatePaymentInstructions(body?.paymentInstructions);
  assertPublicTextFieldsAllowed({ "Campaign title": title });
  const updated = await campaignRepository.updateDraftCampaign({
    campaignId: campaign.id, title, description,
    deadlineAt: parseDeadline(body?.deadlineAt, booking.scheduledStartAt),
    contributionFeeCents: positiveInteger(body?.contributionFeeCents, "Contribution fee", 100000000),
    requiredContributors: positiveInteger(body?.requiredContributors, "Contributor count", 100), paymentInstructions
  });
  if (!updated) throw makeHttpError("Campaign could not be edited because its state changed.", 409);
  await audit(campaign.id, "campaign_updated", user);
  return attachBookingDetails(updated, booking);
}

async function unpublishCampaign({ user, campaignId }) {
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.COLLECTING) throw makeHttpError("Only a collecting campaign can be unpublished.", 409);
  const unpublished = await campaignRepository.unpublishCampaign(campaign.id);
  if (!unpublished) throw makeHttpError("A campaign with contributors cannot be unpublished.", 409);
  await audit(campaign.id, "campaign_unpublished", user);
  return { ...unpublished, scheduledStartAt: campaign.scheduledStartAt };
}

async function getCampaignForCustomer({ user, campaignId }) {
  await campaignRepository.expireStaleReservations?.(campaignId);
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  if (String(campaign.organizerUserId) === String(user?._id)) {
    const result = await getCampaignForOrganizer({ user, campaignId });
    const organizerTrustRating = await ratingRepository.getUserTrustAggregate(campaign.organizerUserId);
    return attachBookingDetails({ ...result, organizerTrustRating, notices: await campaignRepository.listNotices?.({ campaignId: campaign.id, recipientUserId: user._id }) || [] });
  }
  const contribution = await campaignRepository.findContributionByCampaignAndUser(campaign.id, user?._id);
  if (!contribution) throw makeHttpError("Campaign not found.", 404);
  const reimbursement = await campaignRepository.findReimbursementByContributionId(contribution.id);
  const organizerTrustRating = await ratingRepository.getUserTrustAggregate(campaign.organizerUserId);
  const notices = await campaignRepository.listNotices?.({ campaignId: campaign.id, recipientUserId: user._id }) || [];
  return attachBookingDetails({ ...campaign, contribution, reimbursement, organizerTrustRating, notices });
}

async function publishCampaign({ user, campaignId, visibility = "private_link", website = "" }) {
  if (typeof website === "string" && website.trim()) throw makeHttpError("Campaign could not be published.", 400);
  if (!["private_link", "public"].includes(visibility)) {
    throw makeHttpError("Campaign visibility must be private_link or public.", 400);
  }
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.DRAFT) {
    throw makeHttpError("Only a draft campaign can be published.", 409);
  }

  const booking = await bookingRepository.findBookingById(campaign.bookingId);
  if (!booking || String(booking.customerUserId) !== String(user._id) || booking.status !== "confirmed" || booking.paymentStatus !== "paid") {
    throw makeHttpError("The linked booking is no longer eligible for publishing.", 409);
  }
  await entitlementAdmissionService.admit({ tenantId: booking.tenantId, featureKey: "campaigns" });
  parseDeadline(campaign.deadlineAt, booking.scheduledStartAt);

  if (visibility === "public") {
    const locationService = await locationServiceRepository.findLocationServiceByLocationAndServiceId(
      booking.tenantId,
      booking.locationId,
      booking.serviceId
    );
    if (!locationService?.groupFunded?.allowPublicCampaigns) {
      throw makeHttpError("This vendor service does not allow public campaigns.", 409);
    }
    if (typeof campaignRepository.publishPublicCampaignWithinCap !== "function" && await campaignRepository.countActivePublicCampaignsForOrganizer(user._id) >= 2) {
      throw makeHttpError("You can have at most two active public campaigns.", 409);
    }
  }

  const published = visibility === "public" && typeof campaignRepository.publishPublicCampaignWithinCap === "function"
    ? await campaignRepository.publishPublicCampaignWithinCap({ campaignId: campaign.id, organizerUserId: user._id, maximum: 2 })
    : await campaignRepository.publishCampaign({ campaignId: campaign.id, visibility });
  if (!published) {
    throw makeHttpError("Campaign could not be published because its state changed.", 409);
  }
  await audit(campaign.id, "campaign_published", user, { visibility });
  return attachBookingDetails(published, booking);
}

async function joinCampaign({ user, campaignId, body }) {
  if (typeof body?.website === "string" && body.website.trim()) {
    throw makeHttpError("Campaign could not be joined.", 400);
  }
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.COLLECTING || new Date(campaign.deadlineAt).getTime() <= Date.now()) {
    throw makeHttpError("This campaign is not accepting contributors.", 409);
  }
  if (String(campaign.organizerUserId) === String(user?._id)) {
    throw makeHttpError("The organizer cannot occupy a contributor slot.", 409);
  }
  try {
    const contribution = await campaignRepository.createContribution({
      campaignId: campaign.id,
      contributorUserId: user._id,
      amountCents: campaign.contributionFeeCents
    });
    if (!contribution) throw makeHttpError("All contributor slots are currently filled.", 409);
    if (contribution.joinFailure === "cooldown") {
      throw makeHttpError(`You can retry this reservation after ${new Date(contribution.retryAvailableAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.`, 429);
    }
    if (contribution.joinFailure === "unpaid_limit") {
      throw makeHttpError("You can hold at most three unpaid campaign reservations at a time.", 409);
    }
    if (contribution.joinFailure === "retry_exhausted") {
      throw makeHttpError("This campaign reservation has already used its one retry.", 409);
    }
    if (contribution.joinFailure === "already_joined") {
      throw makeHttpError("You have already joined this campaign.", 409);
    }
    await audit(campaign.id, "contributor_joined", user, { contributionId: contribution.id });
    notifyCampaignUser({ userId: campaign.organizerUserId, campaignId: campaign.id, title: "New campaign contributor", body: "A contributor joined your campaign.", eventType: "campaign_contributor_joined" }).catch(() => {});
    return contribution;
  } catch (error) {
    if (error?.code === "23505") throw makeHttpError("You have already joined this campaign.", 409);
    throw error;
  }
}

async function leaveCampaign({ user, campaignId }) {
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  await campaignRepository.expireStaleReservations?.(campaign.id);
  const contribution = await campaignRepository.findContributionByCampaignAndUser(campaign.id, user?._id);
  if (!contribution) throw makeHttpError("Campaign contribution not found.", 404);
  if (contribution.status === campaignRepository.CONTRIBUTION_STATUSES.EXPIRED) {
    throw makeHttpError("This campaign reservation has already expired.", 409);
  }
  if (contribution.status !== campaignRepository.CONTRIBUTION_STATUSES.PENDING_PROOF) {
    throw makeHttpError("You cannot leave after submitting contribution proof.", 409);
  }
  const withdrawn = await campaignRepository.withdrawPendingContribution({
    campaignId: campaign.id,
    contributionId: contribution.id,
    contributorUserId: user._id
  });
  if (!withdrawn) {
    throw makeHttpError("The campaign contribution changed before it could be released.", 409);
  }
  await audit(campaign.id, "contributor_left", user, { contributionId: contribution.id });
  notifyCampaignUser({
    userId: campaign.organizerUserId,
    campaignId: campaign.id,
    title: "Campaign slot released",
    body: "A contributor left before submitting payment proof.",
    eventType: "campaign_contributor_left"
  }).catch(() => {});
  return { left: true };
}

async function uploadContributionProofDirect({ user, campaignId, body, fileBuffer }) {
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.COLLECTING || new Date(campaign.deadlineAt).getTime() <= Date.now()) {
    throw makeHttpError("This campaign is not accepting contribution proofs.", 409);
  }
  const contribution = await campaignRepository.findContributionByCampaignAndUser(campaign.id, user._id);
  if (!contribution) throw makeHttpError("Join the campaign before submitting proof.", 409);
  if (contribution.status === campaignRepository.CONTRIBUTION_STATUSES.PENDING_PROOF
    && contribution.reservationExpiresAt
    && new Date(contribution.reservationExpiresAt).getTime() <= Date.now()) {
    throw makeHttpError("Your campaign reservation expired before proof was submitted.", 409);
  }
  if (![campaignRepository.CONTRIBUTION_STATUSES.PENDING_PROOF, campaignRepository.CONTRIBUTION_STATUSES.REJECTED].includes(contribution.status)) {
    throw makeHttpError("This contribution cannot accept another proof.", 409);
  }
  const paymentReference = requiredText(body?.paymentReference, "Payment reference", 160);
  const upload = await paymentProofStorageService.uploadGroupFundedBinary({ campaign, user, body, fileBuffer });
  const submitted = await campaignRepository.submitContributionProof({ contributionId: contribution.id, paymentReference, proof: upload.proof });
  if (!submitted) {
    const latest = await campaignRepository.findContributionByCampaignAndUser(campaign.id, user._id);
    if (latest?.status === campaignRepository.CONTRIBUTION_STATUSES.EXPIRED) {
      throw makeHttpError("Your campaign reservation expired before proof was submitted.", 409);
    }
    throw makeHttpError("Contribution proof could not be submitted because its state changed.", 409);
  }
  await audit(campaign.id, "contribution_proof_submitted", user, { contributionId: contribution.id });
  notifyCampaignUser({ userId: campaign.organizerUserId, campaignId: campaign.id, title: "Contribution proof submitted", body: "A contributor submitted payment proof for your review.", eventType: "campaign_proof_submitted" }).catch(() => {});
  return submitted;
}

async function createEvidenceAccess({ user, campaignId, contributionId, kind = "contribution" }) {
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  const contribution = await campaignRepository.findContributionById(contributionId);
  if (!contribution || String(contribution.campaignId) !== String(campaign.id)) throw makeHttpError("Evidence not found.", 404);
  const authorized = [campaign.organizerUserId, contribution.contributorUserId].some((id) => String(id) === String(user?._id));
  if (!authorized) throw makeHttpError("Evidence not found.", 404);
  const evidence = kind === "reimbursement"
    ? await campaignRepository.findReimbursementEvidenceByContributionId(contribution.id)
    : await campaignRepository.findContributionEvidenceById(contribution.id);
  if (!evidence?.object_key) throw makeHttpError("Evidence not found.", 404);
  await audit(campaign.id, "campaign_evidence_viewed", user, { contributionId: contribution.id, kind });
  return paymentProofStorageService.createCampaignEvidenceViewAccess({ objectKey: evidence.object_key, fileName: evidence.file_name, contentType: evidence.content_type, sizeBytes: evidence.size_bytes });
}

async function reviewContribution({ user, campaignId, contributionId, body }) {
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.COLLECTING) {
    throw makeHttpError("This campaign is not accepting contribution reviews.", 409);
  }
  const contribution = await campaignRepository.findContributionById(contributionId);
  if (!contribution || String(contribution.campaignId) !== String(campaign.id)) {
    throw makeHttpError("Contribution not found.", 404);
  }
  const decision = body?.decision;
  if (!["accept", "reject"].includes(decision)) {
    throw makeHttpError("Review decision must be accept or reject.", 400);
  }
  const rejectionReason = decision === "reject" ? requiredText(body?.rejectionReason, "Rejection reason", 500) : null;
  const rejectedBeforeProof = decision === "reject"
    && contribution.status === campaignRepository.CONTRIBUTION_STATUSES.PENDING_PROOF;
  const reviewed = await campaignRepository.reviewContribution({
    contributionId: contribution.id, actorUserId: user._id, decision, rejectionReason
  });
  if (!reviewed) throw makeHttpError("Contribution could not be reviewed because its state changed.", 409);
  const collectedCampaign = decision === "accept" ? await campaignRepository.markCollectedIfTargetReached?.(campaign.id) : null;
  await audit(campaign.id, decision === "accept" ? "contribution_accepted" : "contribution_rejected", user, { contributionId: contribution.id });
  if (collectedCampaign) await audit(campaign.id, "campaign_collected", user, {});
  notifyCampaignUser({
    userId: contribution.contributorUserId,
    campaignId: campaign.id,
    title: decision === "accept"
      ? "Contribution accepted"
      : rejectedBeforeProof
        ? "Campaign slot released"
        : "Contribution needs attention",
    body: decision === "accept"
      ? "The organizer accepted your contribution proof."
      : rejectedBeforeProof
        ? `The organizer released your campaign reservation: ${rejectionReason}`
        : `The organizer rejected your proof: ${rejectionReason}`,
    eventType: `campaign_contribution_${decision}ed`
  }).catch(() => {});
  return reviewed;
}

async function cancelCampaign({ user, campaignId, body }) {
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (![campaignRepository.CAMPAIGN_STATUSES.DRAFT, campaignRepository.CAMPAIGN_STATUSES.COLLECTING, campaignRepository.CAMPAIGN_STATUSES.COLLECTED].includes(campaign.status)) {
    throw makeHttpError("This campaign cannot be cancelled in its current state.", 409);
  }
  const reason = requiredText(body?.reason, "Cancellation reason", 500);
  const acceptedContributions = await campaignRepository.listAcceptedContributions(campaign.id);
  if (!acceptedContributions.length) {
    // No contributor money was accepted, so cancellation is immediately final.
    const cancelled = await campaignRepository.cancelWithoutRefund({ campaignId: campaign.id, reason });
    await audit(campaign.id, "campaign_cancelled", user, { reason, reimbursementCount: 0 });
    return cancelled;
  }
  const cancelled = typeof campaignRepository.beginCancellationWithReimbursements === "function"
    ? await campaignRepository.beginCancellationWithReimbursements({ campaignId: campaign.id, reason })
    : await campaignRepository.beginCancellation({ campaignId: campaign.id, reason });
  if (!cancelled) throw makeHttpError("Campaign could not be cancelled because its state changed.", 409);
  if (typeof campaignRepository.beginCancellationWithReimbursements !== "function") {
    await Promise.all(acceptedContributions.map(async (contribution) => {
      await campaignRepository.markContributionRefundPending(contribution.id);
      await campaignRepository.createReimbursement({ campaignId: campaign.id, contribution });
    }));
  }
  await audit(campaign.id, "campaign_refund_pending", user, { reason, reimbursementCount: acceptedContributions.length });
  return cancelled;
}

async function submitReimbursementEvidence({ user, campaignId, contributionId, body, fileBuffer }) {
  const campaign = await getCampaignForOrganizer({ user, campaignId });
  if (campaign.status !== campaignRepository.CAMPAIGN_STATUSES.REFUND_PENDING) throw makeHttpError("This campaign is not awaiting reimbursements.", 409);
  const contribution = await campaignRepository.findContributionById(contributionId);
  if (!contribution || String(contribution.campaignId) !== String(campaign.id)) throw makeHttpError("Contribution not found.", 404);
  const reimbursement = await campaignRepository.findReimbursementByContributionId(contribution.id);
  if (!reimbursement) throw makeHttpError("Reimbursement obligation not found.", 404);
  const upload = await paymentProofStorageService.uploadGroupFundedBinary({ campaign, user, body, fileBuffer });
  const sent = typeof campaignRepository.markReimbursementSentWithContribution === "function"
    ? await campaignRepository.markReimbursementSentWithContribution({ reimbursementId: reimbursement.id, contributionId: contribution.id, proof: upload.proof })
    : await campaignRepository.markReimbursementSent({ reimbursementId: reimbursement.id, proof: upload.proof });
  if (!sent) throw makeHttpError("Reimbursement evidence could not be recorded because its state changed.", 409);
  if (typeof campaignRepository.markReimbursementSentWithContribution !== "function") await campaignRepository.markContributionRefundSent(contribution.id);
  await audit(campaign.id, "reimbursement_sent", user, { contributionId: contribution.id, reimbursementId: sent.id });
  notifyCampaignUser({ userId: contribution.contributorUserId, campaignId: campaign.id, title: "Reimbursement marked sent", body: "Confirm only after you receive the organizer's reimbursement.", eventType: "campaign_reimbursement_sent" }).catch(() => {});
  return sent;
}

async function confirmReimbursement({ user, campaignId, contributionId }) {
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign || campaign.status !== campaignRepository.CAMPAIGN_STATUSES.REFUND_PENDING) throw makeHttpError("Campaign not found.", 404);
  const contribution = await campaignRepository.findContributionById(contributionId);
  if (!contribution || String(contribution.campaignId) !== String(campaign.id)) throw makeHttpError("Contribution not found.", 404);
  const atomicResult = typeof campaignRepository.confirmReimbursementAndMaybeCancel === "function"
    ? await campaignRepository.confirmReimbursementAndMaybeCancel({ campaignId: campaign.id, contributionId: contribution.id, contributorUserId: user._id })
    : null;
  const reimbursement = atomicResult?.reimbursement || (typeof campaignRepository.confirmReimbursementAndMaybeCancel !== "function"
    ? await campaignRepository.confirmReimbursement({ reimbursementId: (await campaignRepository.findReimbursementByContributionId(contribution.id))?.id, contributorUserId: user._id })
    : null);
  if (!reimbursement) throw makeHttpError("This reimbursement is not ready for your confirmation.", 409);
  if (!atomicResult) await campaignRepository.markContributionRefundConfirmed(contribution.id);
  const finalizedCampaign = atomicResult?.campaign || (!atomicResult ? await campaignRepository.finalizeCancellationIfFullyConfirmed(campaign.id) : null);
  await audit(campaign.id, "reimbursement_confirmed", user, { contributionId: contribution.id, reimbursementId: reimbursement.id, campaignCancelled: Boolean(finalizedCampaign) });
  notifyCampaignUser({ userId: campaign.organizerUserId, campaignId: campaign.id, title: "Reimbursement confirmed", body: "A contributor confirmed receiving their reimbursement.", eventType: "campaign_reimbursement_confirmed" }).catch(() => {});
  return reimbursement;
}

async function disputeReimbursement({ user, campaignId, contributionId, body }) {
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign || campaign.status !== campaignRepository.CAMPAIGN_STATUSES.REFUND_PENDING) throw makeHttpError("Campaign not found.", 404);
  const contribution = await campaignRepository.findContributionById(contributionId);
  if (!contribution || String(contribution.campaignId) !== String(campaign.id) || String(contribution.contributorUserId) !== String(user?._id)) throw makeHttpError("Contribution not found.", 404);
  const reason = requiredText(body?.reason, "Dispute reason", 500);
  const reimbursementRecord = await campaignRepository.findReimbursementByContributionId(contribution.id);
  const reimbursement = reimbursementRecord && (typeof campaignRepository.disputeReimbursementWithContribution === "function"
    ? await campaignRepository.disputeReimbursementWithContribution({ reimbursementId: reimbursementRecord.id, contributionId: contribution.id, contributorUserId: user._id, reason })
    : await campaignRepository.disputeReimbursement({ reimbursementId: reimbursementRecord.id, contributorUserId: user._id, reason }));
  if (!reimbursement) throw makeHttpError("This reimbursement is not ready for a dispute.", 409);
  if (typeof campaignRepository.disputeReimbursementWithContribution !== "function") await campaignRepository.markContributionRefundDisputed(contribution.id);
  await audit(campaign.id, "reimbursement_disputed", user, { contributionId: contribution.id, reimbursementId: reimbursement.id });
  notifyCampaignUser({ userId: campaign.organizerUserId, campaignId: campaign.id, title: "Reimbursement disputed", body: "A contributor reported that their reimbursement was not received or was incorrect.", eventType: "campaign_reimbursement_disputed" }).catch(() => {});
  return reimbursement;
}

async function getCampaignPreview(publicToken) {
  const campaign = await campaignRepository.findPublicCampaignByToken(String(publicToken || "").trim());
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  const { bookingId, ...publicCampaign } = campaign;
  const booking = bookingId ? await bookingRepository.findBookingById(bookingId) : null;
  if (!booking) return publicCampaign;
  const bundleItems = booking.bundleItems?.length
    ? booking.bundleItems
    : [{
        id: booking.serviceId,
        serviceId: booking.serviceId,
        serviceName: booking.serviceName,
        serviceSlug: booking.serviceSlug,
        imageUrl: booking.serviceImageUrl || "",
        bookingQuantity: booking.bookingQuantity,
        priceAmountCents: booking.servicePriceAmountCents,
        currency: booking.serviceCurrency,
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt,
        sortOrder: 0
      }];
  return {
    ...publicCampaign,
    booking: {
      vendorName: booking.tenantName,
      vendorSlug: booking.tenantSlug,
      locationName: booking.locationName,
      locationAddress: booking.locationAddress || "",
      locationTimezone: booking.locationTimezone,
      scheduledStartAt: booking.scheduledStartAt,
      scheduledEndAt: booking.scheduledEndAt,
      bundleItems
    }
  };
}

async function listPublicCampaigns(filters = {}) {
  const search = String(filters.search || "").trim();
  if (search.length > 120) throw makeHttpError("Search must be 120 characters or fewer.", 400);
  if (filters.date && !isValidDateOnly(filters.date)) throw makeHttpError("Invalid date filter.", 400);
  await expireDueCampaigns();
  const campaigns = await campaignRepository.listPublicCampaigns({ limit: 50, search, date: filters.date || "" });
  return campaigns.map(({ bookingId: _bookingId, ...campaign }) => campaign);
}

async function expireDueCampaigns() {
  const overdue = typeof campaignRepository.markOverdueReviews === "function" ? await campaignRepository.markOverdueReviews() : [];
  for (const contribution of overdue) {
    const campaign = await campaignRepository.findCampaignById(contribution.campaignId);
    if (!campaign) continue;
    await audit(campaign.id, "contribution_review_overdue", null, { contributionId: contribution.id });
    notifyCampaignUser({ userId: campaign.organizerUserId, campaignId: campaign.id, title: "Contribution review overdue", body: "A contribution proof needs review and is now overdue.", eventType: "campaign_review_overdue" }).catch(() => {});
    notifyCampaignUser({ userId: contribution.contributorUserId, campaignId: campaign.id, title: "Contribution review overdue", body: "Your proof was not reviewed within the review window. You may report the campaign.", eventType: "campaign_review_overdue" }).catch(() => {});
  }
  const campaigns = await campaignRepository.listExpiredCollectingCampaigns();
  for (const campaign of campaigns) {
    await cancelCampaign({ user: { _id: campaign.organizerUserId }, campaignId: campaign.id, body: { reason: "Campaign deadline expired." } });
  }
  return campaigns.length;
}

async function reportCampaign({ user, campaignId, body }) {
  if (typeof body?.website === "string" && body.website.trim()) throw makeHttpError("Campaign report could not be submitted.", 400);
  const categories = new Set(["misleading", "prohibited_financial_activity", "harassment", "spam", "other"]);
  if (!categories.has(body?.category)) throw makeHttpError("Choose a valid report category.", 400);
  const details = typeof body?.details === "string" ? body.details.trim() : "";
  if (details.length > 1000) throw makeHttpError("Report details must be 1000 characters or fewer.", 400);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (await campaignRepository.countReportsByUserSince(user._id, since) >= 3) throw makeHttpError("You have reached the daily campaign report limit.", 429);
  const campaign = await campaignRepository.findCampaignById(campaignId);
  if (!campaign) throw makeHttpError("Campaign not found.", 404);
  const report = await campaignRepository.createReport({ campaignId: campaign.id, reporterUserId: user._id, category: body.category, details });
  await audit(campaign.id, "campaign_reported", user, { reportId: report.id, category: body.category });
  return report;
}

async function cancelCampaignForBooking({ bookingId, reason = "The linked booking was cancelled." }) {
  const campaign = await campaignRepository.findCampaignByBookingId(bookingId);
  if (!campaign || ![campaignRepository.CAMPAIGN_STATUSES.DRAFT, campaignRepository.CAMPAIGN_STATUSES.COLLECTING, campaignRepository.CAMPAIGN_STATUSES.COLLECTED].includes(campaign.status)) return null;
  return cancelCampaign({ user: { _id: campaign.organizerUserId }, campaignId: campaign.id, body: { reason } });
}

module.exports = { cancelCampaign, cancelCampaignForBooking, confirmReimbursement, createCampaign, createEvidenceAccess, disputeReimbursement, expireDueCampaigns, getCampaignForCustomer, getCampaignForOrganizer, getCampaignPreview, joinCampaign, leaveCampaign, listCampaignsForCustomer, listPublicCampaigns, publishCampaign, reportCampaign, reviewContribution, submitReimbursementEvidence, unpublishCampaign, updateCampaign, uploadContributionProofDirect };
