const tenantRepository = require("../repositories/tenants");
const crypto = require("node:crypto");
const storeLocationRepository = require("../repositories/storeLocations");
const vendorServiceRepository = require("../repositories/vendorServices");
const locationServiceRepository = require("../repositories/locationServices");
const groupFundedRepository = require("../repositories/groupFundedBookings");
const bookingRepository = require("../repositories/bookings");
const userRepository = require("../repositories/users");
const contentModeration = require("./contentModeration");
const paymentProofStorageService = require("./paymentProofStorageService");
const pushNotificationService = require("./pushNotificationService");
const queueEvents = require("./queueEvents");

const VENDOR_REVIEW_BUFFER_HOURS = 24;
const VENDOR_REVIEW_HOLD_HOURS = 24;
const SUBMITTED_PROOF_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const VENDOR_ALERT_EVENT_TYPES = Object.freeze([
  groupFundedRepository.EVENT_TYPES.CAMPAIGN_CREATED,
  groupFundedRepository.EVENT_TYPES.CONTRIBUTION_SUBMITTED,
  groupFundedRepository.EVENT_TYPES.FUNDING_COMPLETED,
  groupFundedRepository.EVENT_TYPES.CAPACITY_HOLD_CREATED,
  groupFundedRepository.EVENT_TYPES.REPLACEMENT_SLOT_ACCEPTED,
  groupFundedRepository.EVENT_TYPES.REPLACEMENT_SLOT_DECLINED,
  groupFundedRepository.EVENT_TYPES.VENDOR_REJECTED,
  groupFundedRepository.EVENT_TYPES.VENDOR_APPROVED,
  groupFundedRepository.EVENT_TYPES.FUNDING_DEADLINE_EXPIRED,
  groupFundedRepository.EVENT_TYPES.VENDOR_REVIEW_EXPIRED
]);

function makeHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function publishCampaignStreamUpdate(tenant, campaign) {
  if (!campaign?.locationId) {
    return;
  }

  const streamTenant = tenant?.slug
    ? tenant
    : campaign.tenantId
      ? await tenantRepository.findTenantById(campaign.tenantId)
      : null;

  if (!streamTenant?.slug) {
    return;
  }

  queueEvents.publish(streamTenant.slug);
}

function normalizeText(value, fallback = "") {
  if (Array.isArray(value)) {
    return normalizeText(value[0], fallback);
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text || fallback;
  }
  return fallback;
}

function normalizeDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBookingQuantity(service, value) {
  const quantity = Number(value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) {
    throw makeHttpError("bookingQuantity must be between 1 and 24.", 400);
  }
  if (!service.allowBookingQuantity && quantity !== 1) {
    throw makeHttpError("This service does not allow booking multiple units.", 400);
  }
  return quantity;
}

function getDurationMinutes(service, quantity) {
  const durationMinutes = Number(service.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw makeHttpError("Service duration must be configured before group-funded bookings can be created.", 409);
  }
  return durationMinutes * quantity;
}

function assertBranchPaymentInstructions(location) {
  if (!location.paymentQrActive || !location.paymentQrImageUrl) {
    throw makeHttpError("Group-funded booking requires active branch payment instructions.", 409);
  }
}

function getGroupFundedSettings(locationService) {
  const settings = locationService?.groupFunded || {};
  if (!locationService || !locationService.isActive || !settings.enabled) {
    throw makeHttpError("Group-funded booking is not available for this service at this branch.", 409);
  }
  return settings;
}

function resolvePayableAmountCents(service, locationService, bookingQuantity) {
  const unitAmount = locationService.priceAmountCents ?? service.priceAmountCents;
  const amount = Number(unitAmount || 0) * Number(bookingQuantity || 1);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw makeHttpError("Group-funded booking requires a positive service price.", 409);
  }
  return amount;
}

function validateRequiredContributors(value, settings) {
  const requiredContributors = Number(value || settings.defaultRequiredContributors);
  if (!Number.isInteger(requiredContributors)) {
    throw makeHttpError("requiredContributors must be an integer.", 400);
  }
  if (
    requiredContributors < Number(settings.minRequiredContributors) ||
    requiredContributors > Number(settings.maxRequiredContributors)
  ) {
    throw makeHttpError("requiredContributors is outside the vendor-configured bounds.", 400);
  }
  return requiredContributors;
}

function validateFundingDeadline(value, scheduledStartAt, settings) {
  const deadline = normalizeDateTime(value);
  if (!deadline || deadline.getTime() <= Date.now()) {
    throw makeHttpError("fundingDeadlineAt must be a future date and time.", 400);
  }
  const minDeadlineAt = Date.now() + Number(settings.minDeadlineHours || 1) * 60 * 60 * 1000;
  if (deadline.getTime() < minDeadlineAt) {
    throw makeHttpError("fundingDeadlineAt is earlier than the vendor-configured minimum.", 400);
  }
  const maxDeadlineAt = Date.now() + Number(settings.maxDeadlineDays || 1) * 24 * 60 * 60 * 1000;
  if (deadline.getTime() > maxDeadlineAt) {
    throw makeHttpError("fundingDeadlineAt is later than the vendor-configured maximum.", 400);
  }
  const reviewBufferMs = VENDOR_REVIEW_BUFFER_HOURS * 60 * 60 * 1000;
  if (deadline.getTime() > scheduledStartAt.getTime() - reviewBufferMs) {
    throw makeHttpError("fundingDeadlineAt must leave time for vendor review before the service starts.", 400);
  }
  return deadline;
}

function validateDescription(value) {
  const description = normalizeText(value);
  if (description.length > 280) {
    throw makeHttpError("description must be 280 characters or fewer.", 400);
  }
  contentModeration.assertPublicTextAllowed(description, "Campaign description");
  return description;
}

function validateCampaignTitle(value, fallback) {
  const title = normalizeText(value, fallback);
  if (title.length > 90) {
    throw makeHttpError("Campaign title must be 90 characters or fewer.", 400);
  }
  contentModeration.assertPublicTextAllowed(title, "Campaign title");
  return title;
}

function resolveVisibility(value, settings) {
  const visibility = normalizeText(value, "private_link");
  if (!["private_link", "public"].includes(visibility)) {
    throw makeHttpError("visibility must be private_link or public.", 400);
  }
  if (visibility === "public" && !settings.allowPublicCampaigns) {
    throw makeHttpError("This vendor does not allow public group-funded campaigns.", 409);
  }
  return visibility;
}

function formatDisplayName(user) {
  return normalizeText(user?.displayName || user?.name || user?.username || user?.email, "Customer");
}

function assertCampaignAcceptsContributions(campaign) {
  if (!campaign || campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDING) {
    throw makeHttpError("This campaign is not accepting contributions.", 409);
  }
  if (new Date(campaign.fundingDeadlineAt).getTime() <= Date.now()) {
    throw makeHttpError("This campaign funding deadline has passed.", 409);
  }
}

function getBookingCapacityServiceId(service, capacityScope = "service") {
  return capacityScope === "location" ? null : service._id;
}

async function loadCampaignBookingContext(campaign, options = {}) {
  const location = await storeLocationRepository.findLocationById(campaign.locationId, options);
  if (!location || String(location.tenantId) !== String(campaign.tenantId) || !location.isActive) {
    throw makeHttpError("Campaign location is no longer available.", 409);
  }

  const service = await vendorServiceRepository.findServiceByTenantAndSlug(
    campaign.tenantId,
    campaign.serviceSlugSnapshot,
    options
  );
  if (!service || String(service._id) !== String(campaign.serviceId) || !service.isActive) {
    throw makeHttpError("Campaign service is no longer available.", 409);
  }

  const locationService = await locationServiceRepository.findLocationServiceByLocationAndServiceId(
    campaign.tenantId,
    campaign.locationId,
    campaign.serviceId,
    options
  );
  if (!locationService || !locationService.isActive) {
    throw makeHttpError("Campaign service is no longer available at this branch.", 409);
  }

  return { location, service, locationService };
}

async function assertCampaignSlotCapacity(campaign, options = {}) {
  const { service, locationService } = await loadCampaignBookingContext(campaign, options);
  const capacityServiceId = getBookingCapacityServiceId(service, service.bookingCapacityScope);
  const activeCount = await bookingRepository.countOverlappingActiveBookings(campaign.tenantId, {
    ...options,
    locationId: campaign.locationId,
    serviceId: capacityServiceId,
    startsAt: campaign.scheduledStartAt,
    endsAt: campaign.scheduledEndAt
  });
  const activeHoldCount = await groupFundedRepository.countOverlappingActiveCapacityHolds(campaign.tenantId, {
    ...options,
    locationId: campaign.locationId,
    serviceId: capacityServiceId,
    startsAt: campaign.scheduledStartAt,
    endsAt: campaign.scheduledEndAt
  });
  const capacity = Number(locationService.capacity || 1);
  if (activeCount + activeHoldCount >= capacity) {
    throw makeHttpError("This slot is no longer available for group-funded review.", 409);
  }
  return { service, locationService, capacity, activeCount, activeHoldCount };
}

async function createRefundObligations({ campaign, reason, actor = null, client }) {
  const verifiedContributions = await groupFundedRepository.listContributionsByCampaign(campaign._id, {
    client,
    statuses: [groupFundedRepository.CONTRIBUTION_STATUSES.VERIFIED]
  });
  const existingRefunds = await groupFundedRepository.listRefundsByCampaign(campaign._id, { client });
  const refundedContributionIds = new Set(existingRefunds.map((refund) => String(refund.contributionId)));
  const refunds = [];
  for (const contribution of verifiedContributions) {
    if (refundedContributionIds.has(String(contribution._id))) {
      continue;
    }
    const refund = await groupFundedRepository.createRefund(
      {
        campaignId: campaign._id,
        contributionId: contribution._id,
        userId: contribution.userId,
        amountCents: contribution.amountCents,
        currency: contribution.currency,
        refundReason: reason,
        refundStatus: groupFundedRepository.REFUND_STATUSES.PENDING,
        vendorActorUserId: actor?._id || null
      },
      { client }
    );
    refunds.push(refund);
    await groupFundedRepository.updateContribution(
      {
        contributionId: contribution._id,
        contributionStatus: groupFundedRepository.CONTRIBUTION_STATUSES.REFUND_PENDING,
        refundStatus: groupFundedRepository.REFUND_STATUSES.PENDING
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.REFUND_OBLIGATION_CREATED,
        actorUserId: actor?._id || null,
        actorRole: actor ? "vendor" : null,
        source: actor ? "vendor" : "system",
        metadata: { contributionId: contribution._id, refundId: refund._id, reason }
      },
      { client }
    );
  }
  return refunds;
}

async function startVendorReviewIfFunded({ campaign, actor, client }) {
  if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDED) {
    return { campaign, capacityHold: null };
  }

  try {
    await assertCampaignSlotCapacity(campaign, { client, excludeCampaignId: campaign._id });
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
    const recoveryCampaign = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.SLOT_RECOVERY
      },
      { client }
    );
    return { campaign: recoveryCampaign, capacityHold: null };
  }

  const now = new Date();
  const reviewExpiresAt = new Date(now.getTime() + VENDOR_REVIEW_HOLD_HOURS * 60 * 60 * 1000);
  const reviewCampaign = await groupFundedRepository.updateCampaignReviewFields(
    {
      campaignId: campaign._id,
      campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW,
      vendorReviewStartedAt: now.toISOString(),
      vendorReviewExpiresAt: reviewExpiresAt.toISOString()
    },
    { client }
  );
  const capacityHold = await groupFundedRepository.createCapacityHold(
    {
      campaignId: campaign._id,
      tenantId: campaign.tenantId,
      locationId: campaign.locationId,
      serviceId: campaign.serviceId,
      scheduledStartAt: campaign.scheduledStartAt,
      scheduledEndAt: campaign.scheduledEndAt,
      bookingQuantity: campaign.bookingQuantity,
      expiresAt: reviewExpiresAt.toISOString()
    },
    { client }
  );
  await groupFundedRepository.recordEvent(
    {
      campaignId: campaign._id,
      tenantId: campaign.tenantId,
      locationId: campaign.locationId,
      eventType: groupFundedRepository.EVENT_TYPES.CAPACITY_HOLD_CREATED,
      actorUserId: actor?._id || null,
      actorRole: actor ? "vendor" : "system",
      source: actor ? "vendor" : "system",
      metadata: { capacityHoldId: capacityHold._id, expiresAt: capacityHold.expiresAt }
    },
    { client }
  );
  return { campaign: reviewCampaign, capacityHold };
}

function normalizeProofPayload(body = {}) {
  const paymentReference = normalizeText(body.paymentReference);
  const paymentProofObjectKey = normalizeText(body.paymentProofObjectKey);
  const paymentProofFileName = normalizeText(body.paymentProofFileName);
  const paymentProofContentType = normalizeText(body.paymentProofContentType);
  const paymentProofSizeBytes = Number(body.paymentProofSizeBytes || 0);

  if (!paymentReference) {
    throw makeHttpError("paymentReference is required.", 400);
  }
  if (!paymentProofObjectKey || !paymentProofFileName) {
    throw makeHttpError("payment proof metadata is required.", 400);
  }
  if (!SUBMITTED_PROOF_CONTENT_TYPES.has(paymentProofContentType)) {
    throw makeHttpError("paymentProofContentType must be image/jpeg, image/png, image/webp, or application/pdf.", 400);
  }
  if (!Number.isInteger(paymentProofSizeBytes) || paymentProofSizeBytes <= 0 || paymentProofSizeBytes > 8 * 1024 * 1024) {
    throw makeHttpError("paymentProofSizeBytes must be between 1 byte and 8 MB.", 400);
  }

  return {
    paymentReference,
    paymentProofObjectKey,
    paymentProofFileName,
    paymentProofContentType,
    paymentProofSizeBytes
  };
}

function normalizeRefundEvidencePayload(body = {}) {
  const evidenceObjectKey = normalizeText(body.evidenceObjectKey);
  const evidenceFileName = normalizeText(body.evidenceFileName);
  const evidenceContentType = normalizeText(body.evidenceContentType);
  const evidenceSizeBytes = Number(body.evidenceSizeBytes || 0);
  if (!evidenceObjectKey && !evidenceFileName && !evidenceContentType && !evidenceSizeBytes) {
    return {};
  }
  if (!evidenceObjectKey || !evidenceFileName) {
    throw makeHttpError("refund evidence metadata is incomplete.", 400);
  }
  if (!SUBMITTED_PROOF_CONTENT_TYPES.has(evidenceContentType)) {
    throw makeHttpError("evidenceContentType must be image/jpeg, image/png, image/webp, or application/pdf.", 400);
  }
  if (!Number.isInteger(evidenceSizeBytes) || evidenceSizeBytes <= 0 || evidenceSizeBytes > 8 * 1024 * 1024) {
    throw makeHttpError("evidenceSizeBytes must be between 1 byte and 8 MB.", 400);
  }
  return { evidenceObjectKey, evidenceFileName, evidenceContentType, evidenceSizeBytes };
}

function buildCampaignWithSlot(campaign, scheduledStartAt, scheduledEndAt) {
  return {
    ...campaign,
    scheduledStartAt: scheduledStartAt.toISOString(),
    scheduledEndAt: scheduledEndAt.toISOString()
  };
}

async function resolveReplacementSlot(campaign, scheduledStartAtValue, options = {}) {
  const scheduledStartAt = normalizeDateTime(scheduledStartAtValue);
  if (!scheduledStartAt || scheduledStartAt.getTime() <= Date.now()) {
    throw makeHttpError("scheduledStartAt must be a future date and time.", 400);
  }
  const { service } = await loadCampaignBookingContext(campaign, options);
  const scheduledEndAt = new Date(
    scheduledStartAt.getTime() + getDurationMinutes(service, campaign.bookingQuantity) * 60 * 1000
  );
  if (scheduledStartAt.getTime() <= new Date(campaign.fundingDeadlineAt).getTime()) {
    throw makeHttpError("replacement slot must be after the funding deadline.", 400);
  }
  return { scheduledStartAt, scheduledEndAt };
}

async function createCampaign({ user, body }) {
  const tenantSlug = normalizeText(body.tenantSlug).toLowerCase();
  const locationSlug = normalizeText(body.locationSlug).toLowerCase();
  const serviceSlug = vendorServiceRepository.normalizeServiceSlug(body.serviceSlug);
  const scheduledStartAt = normalizeDateTime(body.scheduledStartAt);

  if (!tenantSlug || !locationSlug || !serviceSlug) {
    throw makeHttpError("tenantSlug, locationSlug, and serviceSlug are required.", 400);
  }
  if (!scheduledStartAt || scheduledStartAt.getTime() <= Date.now()) {
    throw makeHttpError("scheduledStartAt must be a future date and time.", 400);
  }

  const tenant = await tenantRepository.findTenantBySlug(tenantSlug, { activeOnly: true });
  if (!tenant || !tenant.publicProfileEnabled || tenant.vendorApprovalStatus !== "approved") {
    throw makeHttpError("Vendor not found.", 404);
  }
  const location = await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, locationSlug);
  if (!location || !location.isActive) {
    throw makeHttpError("Location not found.", 404);
  }
  assertBranchPaymentInstructions(location);
  const service = await vendorServiceRepository.findServiceByTenantAndSlug(tenant._id, serviceSlug);
  if (!service || !service.isActive) {
    throw makeHttpError("Service not found.", 404);
  }
  const locationService = await locationServiceRepository.findLocationServiceByLocationAndServiceId(
    tenant._id,
    location._id,
    service._id
  );
  const settings = getGroupFundedSettings(locationService);
  const bookingQuantity = normalizeBookingQuantity(service, body.bookingQuantity);
  const scheduledEndAt = new Date(scheduledStartAt.getTime() + getDurationMinutes(service, bookingQuantity) * 60 * 1000);
  const requiredContributors = validateRequiredContributors(body.requiredContributors, settings);
  const fundingDeadlineAt = validateFundingDeadline(body.fundingDeadlineAt, scheduledStartAt, settings);
  const targetAmountCents = resolvePayableAmountCents(service, locationService, bookingQuantity);
  const requiredContributionAmountCents = Math.ceil(targetAmountCents / requiredContributors);
  const roundingAdjustmentCents = (requiredContributionAmountCents * requiredContributors) - targetAmountCents;

  if (
    settings.minContributionAmountCents !== null &&
    requiredContributionAmountCents < Number(settings.minContributionAmountCents)
  ) {
    throw makeHttpError("Computed contribution is below the vendor-configured minimum.", 400);
  }
  if (
    settings.maxContributionAmountCents !== null &&
    requiredContributionAmountCents > Number(settings.maxContributionAmountCents)
  ) {
    throw makeHttpError("Computed contribution is above the vendor-configured maximum.", 400);
  }

  const campaign = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.createCampaign(
      {
        tenantId: tenant._id,
        locationId: location._id,
        serviceId: service._id,
        locationServiceId: locationService._id,
        organizerUserId: user._id,
        visibility: resolveVisibility(body.visibility, settings),
        organizerDisplayName: formatDisplayName(user),
        campaignTitle: validateCampaignTitle(body.campaignTitle, `${service.name} group booking`),
        description: validateDescription(body.description),
        serviceNameSnapshot: service.name,
        serviceSlugSnapshot: service.slug,
        locationNameSnapshot: location.name,
        locationSlugSnapshot: location.slug,
        bookingQuantity,
        scheduledStartAt: scheduledStartAt.toISOString(),
        scheduledEndAt: scheduledEndAt.toISOString(),
        fundingDeadlineAt: fundingDeadlineAt.toISOString(),
        currency: service.currency || "PHP",
        targetAmountCents,
        requiredContributionAmountCents,
        roundingAdjustmentCents,
        requiredContributors,
        eligibilitySnapshot: {
          groupFunded: settings,
          paymentMethodLabel: location.paymentMethodLabel,
          paymentAccountDisplayName: location.paymentAccountDisplayName,
          paymentAccountIdentifierDisplay: location.paymentAccountIdentifierDisplay,
          paymentQrImageUrl: location.paymentQrImageUrl,
          priceAmountCents: targetAmountCents
        }
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CAMPAIGN_CREATED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { visibility: campaign.visibility }
      },
      { client }
    );
    return campaign;
  });
  if (tenant.notificationSettings?.bookingIntake !== false) {
    pushNotificationService.notifyVendorGroupFundedCampaignCreated({ tenant, campaign }).catch((error) => {
      console.warn("[web-push-group-funded-created-skipped]", error.message);
    });
  }
  await publishCampaignStreamUpdate(tenant, campaign);
  return campaign;
}

async function getCampaignForCustomer({ user, campaignIdOrToken }) {
  let campaign = /^\d+$/.test(String(campaignIdOrToken))
    ? await groupFundedRepository.findCampaignById(campaignIdOrToken)
    : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken);
  if (!campaign) {
    throw makeHttpError("Campaign not found.", 404);
  }
  if (
    campaign.campaignStatus === groupFundedRepository.CAMPAIGN_STATUSES.FUNDING &&
    new Date(campaign.fundingDeadlineAt).getTime() <= Date.now()
  ) {
    const expired = await expireFundingCampaign({ campaignId: campaign._id });
    campaign = expired.campaign;
  }
  const contribution = await groupFundedRepository.findContributionByCampaignAndUser(campaign._id, user._id);
  const isOrganizer = String(campaign.organizerUserId) === String(user._id);
  if (!isOrganizer && !contribution && campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDING) {
    throw makeHttpError("Campaign not found.", 404);
  }
  const refunds = contribution
    ? (await groupFundedRepository.listRefundsByCampaign(campaign._id))
        .filter((refund) => String(refund.userId) === String(user._id))
    : [];
  const location = await storeLocationRepository.findLocationById(campaign.locationId);
  const paymentSnapshot = campaign.eligibilitySnapshot || {};
  const hasActiveLocationPaymentDestination = Boolean(location?.paymentQrActive && location.paymentQrImageUrl);
  const paymentQrImageUrl = hasActiveLocationPaymentDestination
    ? paymentSnapshot.paymentQrImageUrl || location.paymentQrImageUrl
    : "";
  campaign.paymentDestination = paymentQrImageUrl
    ? {
        methodLabel: paymentSnapshot.paymentMethodLabel || location?.paymentMethodLabel || "Payment",
        accountDisplayName: paymentSnapshot.paymentAccountDisplayName || location?.paymentAccountDisplayName || "",
        accountIdentifierDisplay: paymentSnapshot.paymentAccountIdentifierDisplay || location?.paymentAccountIdentifierDisplay || "",
        qrImageUrl: paymentQrImageUrl
      }
    : null;
  const tenant = await tenantRepository.findTenantById(campaign.tenantId);
  campaign.contributorReservationSummary = await getContributorReservationSummary(campaign);
  return { campaign, contribution, refunds, tenant };
}

async function getPublicCampaign({ publicToken }) {
  const campaign = await groupFundedRepository.findCampaignByPublicToken(publicToken);
  if (!campaign) {
    throw makeHttpError("Campaign not found.", 404);
  }
  const tenant = await tenantRepository.findTenantById(campaign.tenantId);
  campaign.contributorReservationSummary = await getContributorReservationSummary(campaign);
  return { campaign, tenant };
}

function buildContributorReservationSummary(campaign, totals) {
  const verifiedContributorCount = Math.min(
    Number(campaign.requiredContributors || 0),
    Number(totals.verifiedContributorCount || 0)
  );
  const pendingVerificationContributorCount = Math.min(
    Math.max(Number(campaign.requiredContributors || 0) - verifiedContributorCount, 0),
    Number(totals.pendingVerificationContributorCount || 0)
  );
  const filledContributorCount = verifiedContributorCount + pendingVerificationContributorCount;
  return {
    verifiedContributorCount,
    pendingVerificationContributorCount,
    vacantContributorCount: Math.max(Number(campaign.requiredContributors || 0) - filledContributorCount, 0),
    filledContributorCount
  };
}

async function getContributorReservationSummary(campaign, options = {}) {
  const totals = campaign.contributorReservationTotals
    || await groupFundedRepository.getContributionReservationSummary(campaign._id, options);
  return buildContributorReservationSummary(campaign, totals);
}

function maskOrganizerDisplayName(value) {
  const text = normalizeText(value, "Organizer");
  const firstCharacter = text[0]?.toUpperCase();
  return firstCharacter ? `Organizer ${firstCharacter}.` : "Organizer";
}

function formatPublicCampaign(campaign, tenant = null) {
  const publicOrganizerName = normalizeText(campaign.organizerProfileDisplayName)
    ? campaign.organizerProfileDisplayName
    : maskOrganizerDisplayName(campaign.organizerDisplayName);

  return {
    id: campaign._id,
    publicToken: campaign.publicToken,
    tenantId: campaign.tenantId,
    tenantSlug: tenant?.slug || null,
    vendorName: tenant?.name || "",
    locationId: campaign.locationId,
    serviceId: campaign.serviceId,
    campaignStatus: campaign.campaignStatus,
    visibility: campaign.visibility,
    organizerDisplayName: publicOrganizerName,
    campaignTitle: campaign.campaignTitle || campaign.serviceNameSnapshot,
    description: campaign.description,
    serviceName: campaign.serviceNameSnapshot,
    serviceSlug: campaign.serviceSlugSnapshot,
    locationName: campaign.locationNameSnapshot,
    locationSlug: campaign.locationSlugSnapshot,
    bookingQuantity: campaign.bookingQuantity,
    scheduledStartAt: campaign.scheduledStartAt,
    scheduledEndAt: campaign.scheduledEndAt,
    fundingDeadlineAt: campaign.fundingDeadlineAt,
    currency: campaign.currency,
    targetAmountCents: campaign.targetAmountCents,
    requiredContributionAmountCents: campaign.requiredContributionAmountCents,
    roundingAdjustmentCents: campaign.roundingAdjustmentCents,
    requiredContributors: campaign.requiredContributors,
    paidParticipantCount: campaign.paidParticipantCount,
    fundedAmountCents: campaign.fundedAmountCents,
    fundedAt: campaign.fundedAt,
    contributorReservationSummary: campaign.contributorReservationSummary || null,
    linkedBookingId: null,
    replacementSlot: campaign.replacementScheduledStartAt
      ? {
          scheduledStartAt: campaign.replacementScheduledStartAt,
          scheduledEndAt: campaign.replacementScheduledEndAt,
          proposedAt: campaign.replacementProposedAt,
          note: campaign.replacementNote
        }
      : null,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt
  };
}

async function listPublicCampaignsForVendorLocation({ tenantSlug, locationSlug, serviceSlug, limit }) {
  const tenant = await tenantRepository.findTenantBySlug(String(tenantSlug || "").toLowerCase(), { activeOnly: true });
  if (!tenant || !tenant.publicProfileEnabled || tenant.vendorApprovalStatus !== "approved") {
    throw makeHttpError("Vendor not found.", 404);
  }

  const location = await storeLocationRepository.findLocationByTenantAndSlug(
    tenant._id,
    String(locationSlug || "").toLowerCase()
  );
  if (!location || !location.isActive) {
    throw makeHttpError("Location not found.", 404);
  }

  const campaigns = await groupFundedRepository.listPublicCampaignsForVendorLocation(tenant._id, location._id, {
    serviceSlug: serviceSlug ? vendorServiceRepository.normalizeServiceSlug(serviceSlug) : "",
    limit: Math.min(Math.max(Number(limit || 20) || 20, 1), 50)
  });
  return campaigns.map((campaign) => {
    campaign.contributorReservationSummary = buildContributorReservationSummary(
      campaign,
      campaign.contributorReservationTotals || {
        verifiedContributorCount: 0,
        pendingVerificationContributorCount: 0
      }
    );
    return formatPublicCampaign(campaign, tenant);
  });
}

async function reportPublicCampaignAbuse({ publicToken, body = {}, actor = null, ipAddress = "" }) {
  const campaign = await groupFundedRepository.findCampaignByPublicToken(publicToken);
  if (!campaign) {
    throw makeHttpError("Campaign not found.", 404);
  }

  const reason = normalizeText(body.reason).slice(0, 500);
  contentModeration.assertPublicTextAllowed(reason, "Report reason");
  const reporterIpHash = ipAddress
    ? crypto.createHash("sha256").update(String(ipAddress)).digest("hex")
    : null;

  await groupFundedRepository.recordEvent({
    campaignId: campaign._id,
    tenantId: campaign.tenantId,
    locationId: campaign.locationId,
    eventType: groupFundedRepository.EVENT_TYPES.ABUSE_REPORTED,
    actorUserId: actor?._id || null,
    actorRole: actor ? "customer" : "guest",
    source: "public",
    metadata: {
      reason: reason || "reported_from_public_campaign_page",
      reporterIpHash
    }
  });

  return { ok: true };
}

async function listCustomerCampaigns({ user }) {
  const campaigns = await groupFundedRepository.listCampaignsForUser(user._id);
  return Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      contribution: await groupFundedRepository.findContributionByCampaignAndUser(campaign._id, user._id)
    }))
  );
}

async function uploadContributionProofDirect({ user, campaignIdOrToken, body, fileBuffer }) {
  const campaign = /^\d+$/.test(String(campaignIdOrToken))
    ? await groupFundedRepository.findCampaignById(campaignIdOrToken)
    : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken);
  if (!campaign) {
    throw makeHttpError("Campaign not found.", 404);
  }
  assertCampaignAcceptsContributions(campaign);

  const existingContribution = await groupFundedRepository.findContributionByCampaignAndUser(
    campaign._id,
    user._id
  );
  if (existingContribution) {
    throw makeHttpError("You have already submitted a contribution for this campaign.", 409);
  }
  const reservationSummary = await getContributorReservationSummary(campaign);
  if (reservationSummary.vacantContributorCount === 0) {
    throw makeHttpError("All contributor positions are temporarily reserved. Please try again if a pending proof is rejected.", 409);
  }

  return paymentProofStorageService.uploadGroupFundedBinary({
    campaign,
    user,
    body,
    fileBuffer
  });
}

async function submitContributionProof({ user, campaignIdOrToken, body }) {
  const proof = normalizeProofPayload(body);
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = /^\d+$/.test(String(campaignIdOrToken))
      ? await groupFundedRepository.findCampaignById(campaignIdOrToken, { client, forUpdate: true })
      : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken, { client, forUpdate: true });
    if (!campaign) {
      throw makeHttpError("Campaign not found.", 404);
    }
    assertCampaignAcceptsContributions(campaign);

    const existingContribution = await groupFundedRepository.findContributionByCampaignAndUser(
      campaign._id,
      user._id,
      { client, forUpdate: true }
    );
    if (existingContribution) {
      throw makeHttpError("You have already submitted a contribution for this campaign.", 409);
    }
    const reservationSummary = await getContributorReservationSummary(campaign, { client });
    if (reservationSummary.vacantContributorCount === 0) {
      throw makeHttpError("All contributor positions are temporarily reserved. Please try again if a pending proof is rejected.", 409);
    }

    let participant = await groupFundedRepository.findParticipantByCampaignAndUser(campaign._id, user._id, { client });
    if (!participant) {
      participant = await groupFundedRepository.createParticipant(
        {
          campaignId: campaign._id,
          userId: user._id,
          participantRole: String(campaign.organizerUserId) === String(user._id)
            ? groupFundedRepository.PARTICIPANT_ROLES.ORGANIZER
            : groupFundedRepository.PARTICIPANT_ROLES.CONTRIBUTOR,
          displayName: formatDisplayName(user)
        },
        { client }
      );
    }

    const contribution = await groupFundedRepository.createContribution(
      {
        campaignId: campaign._id,
        participantId: participant._id,
        userId: user._id,
        amountCents: campaign.requiredContributionAmountCents,
        currency: campaign.currency,
        contributionStatus: groupFundedRepository.CONTRIBUTION_STATUSES.SUBMITTED,
        ...proof,
        paymentProofUploadedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString()
      },
      { client }
    );

    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CONTRIBUTION_SUBMITTED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { contributionId: contribution._id }
      },
      { client }
    );

    campaign.contributorReservationSummary = {
      ...reservationSummary,
      pendingVerificationContributorCount: reservationSummary.pendingVerificationContributorCount + 1,
      vacantContributorCount: reservationSummary.vacantContributorCount - 1,
      filledContributorCount: reservationSummary.filledContributorCount + 1
    };
    return { campaign, contribution };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  if (tenant?.notificationSettings?.paymentProofReview !== false) {
    pushNotificationService.notifyVendorGroupFundedProofReview({
      tenant,
      campaign: result.campaign,
      contribution: result.contribution
    }).catch((error) => {
      console.warn("[web-push-group-funded-proof-review-skipped]", error.message);
    });
  }
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function cancelOrganizerCampaign({ user, campaignIdOrToken, reason }) {
  const cancellationReason = normalizeText(reason, "organizer_canceled");
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = /^\d+$/.test(String(campaignIdOrToken))
      ? await groupFundedRepository.findCampaignById(campaignIdOrToken, { client, forUpdate: true })
      : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken, { client, forUpdate: true });
    if (!campaign || String(campaign.organizerUserId) !== String(user._id)) {
      throw makeHttpError("Campaign not found.", 404);
    }
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDING) {
      throw makeHttpError("Only funding-stage campaigns can be canceled by the organizer.", 409);
    }
    if (Number(campaign.fundedAmountCents || 0) >= Number(campaign.targetAmountCents || 0)) {
      throw makeHttpError("Fully funded campaigns cannot be canceled by the organizer.", 409);
    }
    const canceled = await groupFundedRepository.updateCampaignStatus(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.ORGANIZER_CANCELED,
        canceledAt: new Date().toISOString(),
        cancellationReason
      },
      { client }
    );
    const refunds = await createRefundObligations({
      campaign,
      reason: "organizer_canceled",
      actor: user,
      client
    });
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.ORGANIZER_CANCELED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { reason: cancellationReason, refundCount: refunds.length }
      },
      { client }
    );
    return { campaign: canceled, refunds };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function updateOrganizerCampaignDetails({ user, campaignIdOrToken, body }) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = /^\d+$/.test(String(campaignIdOrToken))
      ? await groupFundedRepository.findCampaignById(campaignIdOrToken, { client, forUpdate: true })
      : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken, { client, forUpdate: true });
    if (!campaign || String(campaign.organizerUserId) !== String(user._id)) {
      throw makeHttpError("Campaign not found.", 404);
    }
    if (
      Number(campaign.fundedAmountCents || 0) >= Number(campaign.targetAmountCents || 0) ||
      Number(campaign.paidParticipantCount || 0) >= Number(campaign.requiredContributors || 0)
    ) {
      throw makeHttpError("Fully funded campaigns can no longer be edited.", 409);
    }
    if (
      [
        groupFundedRepository.CAMPAIGN_STATUSES.ORGANIZER_CANCELED,
        groupFundedRepository.CAMPAIGN_STATUSES.FUNDING_FAILED,
        groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REJECTED,
        groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW_EXPIRED,
        groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_CANCELED
      ].includes(campaign.campaignStatus)
    ) {
      throw makeHttpError("This campaign can no longer be edited.", 409);
    }

    let settings = campaign.eligibilitySnapshot?.groupFunded || {};
    const locationService = await locationServiceRepository.findLocationServiceByLocationAndServiceId(
      campaign.tenantId,
      campaign.locationId,
      campaign.serviceId,
      { client }
    );
    if (locationService?.groupFunded) {
      settings = locationService.groupFunded;
    }

    const updated = await groupFundedRepository.updateCampaignDetails(
      {
        campaignId: campaign._id,
        campaignTitle: validateCampaignTitle(body?.campaignTitle, campaign.campaignTitle || campaign.serviceNameSnapshot),
        description: validateDescription(body?.description),
        visibility: resolveVisibility(body?.visibility, settings)
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CAMPAIGN_VISIBILITY_CHANGED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: {
          previousVisibility: campaign.visibility,
          visibility: updated.visibility,
          titleChanged: updated.campaignTitle !== campaign.campaignTitle,
          descriptionChanged: updated.description !== campaign.description
        }
      },
      { client }
    );
    return { campaign: updated };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return { ...result, tenant };
}

async function assertVendorCampaignAccess({ tenant, campaign }) {
  if (!campaign || String(campaign.tenantId) !== String(tenant._id)) {
    throw makeHttpError("Campaign not found.", 404);
  }
}

async function verifyContribution({ tenant, user, contributionId }) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const contribution = await groupFundedRepository.findContributionById(contributionId, { client, forUpdate: true });
    if (!contribution) {
      throw makeHttpError("Contribution not found.", 404);
    }
    const campaign = await groupFundedRepository.findCampaignById(contribution.campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    if (contribution.contributionStatus === groupFundedRepository.CONTRIBUTION_STATUSES.VERIFIED) {
      return { campaign, contribution };
    }
    if (contribution.contributionStatus !== groupFundedRepository.CONTRIBUTION_STATUSES.SUBMITTED) {
      throw makeHttpError("Only submitted contribution proofs can be verified.", 409);
    }
    if (
      campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDING ||
      Number(campaign.fundedAmountCents || 0) >= Number(campaign.targetAmountCents || 0) ||
      Number(campaign.paidParticipantCount || 0) >= Number(campaign.requiredContributors || 0)
    ) {
      throw makeHttpError("This campaign is already fully funded. Reject any remaining submitted proofs instead.", 409);
    }

    const verified = await groupFundedRepository.updateContribution(
      {
        contributionId: contribution._id,
        contributionStatus: groupFundedRepository.CONTRIBUTION_STATUSES.VERIFIED,
        verifiedAt: new Date().toISOString(),
        verifiedByUserId: user._id
      },
      { client }
    );
    let updatedCampaign = await groupFundedRepository.recomputeCampaignFunding(campaign._id, { client });
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CONTRIBUTION_VERIFIED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { contributionId: verified._id }
      },
      { client }
    );
    if (
      campaign.campaignStatus === groupFundedRepository.CAMPAIGN_STATUSES.FUNDING &&
      updatedCampaign.campaignStatus === groupFundedRepository.CAMPAIGN_STATUSES.FUNDED
    ) {
      await groupFundedRepository.recordEvent(
        {
          campaignId: campaign._id,
          tenantId: campaign.tenantId,
          locationId: campaign.locationId,
          eventType: groupFundedRepository.EVENT_TYPES.FUNDING_COMPLETED,
          actorUserId: user._id,
          actorRole: "vendor",
          source: "vendor",
          metadata: { fundedAmountCents: updatedCampaign.fundedAmountCents }
        },
        { client }
      );
      const reviewResult = await startVendorReviewIfFunded({
        campaign: updatedCampaign,
        actor: user,
        client
      });
      updatedCampaign = reviewResult.campaign;
    }
    return { campaign: updatedCampaign, contribution: verified };
  });
  if (
    tenant.notificationSettings?.bookingIntake !== false &&
    result.campaign.campaignStatus === groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW
  ) {
    pushNotificationService.notifyVendorGroupFundedReviewReady({ tenant, campaign: result.campaign }).catch((error) => {
      console.warn("[web-push-group-funded-review-ready-skipped]", error.message);
    });
  }
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function rejectContribution({ tenant, user, contributionId, reason, refundDisposition = "not_required" }) {
  const rejectionReason = normalizeText(reason);
  if (!rejectionReason) {
    throw makeHttpError("reason is required.", 400);
  }
  if (!["not_required", "required"].includes(refundDisposition)) {
    throw makeHttpError("refundDisposition must be not_required or required.", 400);
  }
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const contribution = await groupFundedRepository.findContributionById(contributionId, { client, forUpdate: true });
    if (!contribution) {
      throw makeHttpError("Contribution not found.", 404);
    }
    const campaign = await groupFundedRepository.findCampaignById(contribution.campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    const refundRequired = refundDisposition === "required";
    const existingRefund = refundRequired
      ? await groupFundedRepository.findRefundByContributionId(contribution._id, { client, forUpdate: true })
      : null;
    if (existingRefund) {
      return { campaign, contribution, refund: existingRefund };
    }
    if (contribution.contributionStatus !== groupFundedRepository.CONTRIBUTION_STATUSES.SUBMITTED) {
      throw makeHttpError("Only submitted contribution proofs can be rejected.", 409);
    }
    const rejected = await groupFundedRepository.updateContribution(
      {
        contributionId: contribution._id,
        contributionStatus: refundRequired
          ? groupFundedRepository.CONTRIBUTION_STATUSES.REFUND_PENDING
          : groupFundedRepository.CONTRIBUTION_STATUSES.REJECTED,
        rejectedAt: new Date().toISOString(),
        rejectedByUserId: user._id,
        rejectionReason,
        refundStatus: refundRequired ? groupFundedRepository.REFUND_STATUSES.PENDING : null
      },
      { client }
    );
    let refund = null;
    if (refundRequired) {
      refund = await groupFundedRepository.createRefund(
        {
          campaignId: campaign._id,
          contributionId: contribution._id,
          userId: contribution.userId,
          amountCents: contribution.amountCents,
          currency: contribution.currency,
          refundReason: campaign.fundedAmountCents >= campaign.targetAmountCents
            ? "excess_contribution"
            : "contribution_rejected",
          refundStatus: groupFundedRepository.REFUND_STATUSES.PENDING,
          vendorActorUserId: user._id,
          notes: rejectionReason
        },
        { client }
      );
      await groupFundedRepository.recordEvent(
        {
          campaignId: campaign._id,
          tenantId: campaign.tenantId,
          locationId: campaign.locationId,
          eventType: groupFundedRepository.EVENT_TYPES.REFUND_OBLIGATION_CREATED,
          actorUserId: user._id,
          actorRole: "vendor",
          source: "vendor",
          metadata: { contributionId: rejected._id, refundId: refund._id, reason: refund.refundReason }
        },
        { client }
      );
    }
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CONTRIBUTION_REJECTED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { contributionId: rejected._id, refundDisposition, refundId: refund?._id || null }
      },
      { client }
    );
    return { campaign, contribution: rejected, refund };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function expireFundingCampaign({ campaignId, actor = null } = {}) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.findCampaignById(campaignId, { client, forUpdate: true });
    if (!campaign) {
      throw makeHttpError("Campaign not found.", 404);
    }
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.FUNDING) {
      return { campaign, refunds: [] };
    }
    if (new Date(campaign.fundingDeadlineAt).getTime() > Date.now()) {
      throw makeHttpError("Campaign funding deadline has not passed.", 409);
    }

    const expiredCampaign = await groupFundedRepository.updateCampaignStatus(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.FUNDING_FAILED,
        canceledAt: new Date().toISOString(),
        cancellationReason: "funding_deadline_expired"
      },
      { client }
    );
    const refunds = await createRefundObligations({
      campaign,
      reason: "funding_failed",
      actor,
      client
    });
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.FUNDING_DEADLINE_EXPIRED,
        actorUserId: actor?._id || null,
        actorRole: actor ? "system" : null,
        source: "system",
        metadata: { refundCount: refunds.length }
      },
      { client }
    );
    return { campaign: expiredCampaign, refunds };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

function normalizeVendorCampaignStatuses(status) {
  if (!status) {
    return [];
  }
  const values = Array.isArray(status) ? status : String(status).split(",");
  const allowed = new Set(Object.values(groupFundedRepository.CAMPAIGN_STATUSES));
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .filter((value) => allowed.has(value));
}

async function listVendorCampaigns({ tenant, query = {} }) {
  return groupFundedRepository.listCampaignsForVendor(tenant._id, {
    locationId: query.locationId,
    statuses: normalizeVendorCampaignStatuses(query.status || query.statuses),
    limit: Math.min(Math.max(Number(query.limit || 50) || 50, 1), 100)
  });
}

function buildRefundSummary(refunds, contributions) {
  const refundEligibleStatuses = new Set([
    groupFundedRepository.CONTRIBUTION_STATUSES.VERIFIED,
    groupFundedRepository.CONTRIBUTION_STATUSES.REFUND_PENDING,
    groupFundedRepository.CONTRIBUTION_STATUSES.REFUNDED,
    groupFundedRepository.CONTRIBUTION_STATUSES.POLICY_REVIEW_REQUIRED
  ]);
  return {
    totalCount: refunds.length,
    completedCount: refunds.filter((refund) => refund.refundStatus === groupFundedRepository.REFUND_STATUSES.COMPLETED).length,
    eligibleContributionCount: contributions.filter((contribution) => refundEligibleStatuses.has(contribution.contributionStatus)).length
  };
}

async function listVendorAlertEvents({ tenant, query = {} }) {
  return groupFundedRepository.listVendorAlertEvents(tenant._id, {
    locationId: query.locationId,
    eventTypes: VENDOR_ALERT_EVENT_TYPES,
    limit: Math.min(Math.max(Number(query.limit || 20) || 20, 1), 50)
  });
}

async function getVendorCampaign({ tenant, campaignId }) {
  const campaign = await groupFundedRepository.findCampaignById(campaignId);
  await assertVendorCampaignAccess({ tenant, campaign });
  const [contributions, refunds, capacityHolds] = await Promise.all([
    groupFundedRepository.listContributionsByCampaign(campaign._id),
    groupFundedRepository.listRefundsByCampaign(campaign._id),
    groupFundedRepository.listCapacityHoldsByCampaign(campaign._id)
  ]);
  campaign.refundSummary = buildRefundSummary(refunds, contributions);
  return { campaign, contributions, refunds, capacityHolds };
}

async function createVendorContributionProofAccess({ tenant, contributionId }) {
  const contribution = await groupFundedRepository.findContributionById(contributionId);
  if (!contribution) {
    throw makeHttpError("Contribution not found.", 404);
  }

  const campaign = await groupFundedRepository.findCampaignById(contribution.campaignId);
  await assertVendorCampaignAccess({ tenant, campaign });

  if (!contribution.paymentProofObjectKey) {
    throw makeHttpError("Payment proof has not been submitted for this contribution.", 404);
  }

  return paymentProofStorageService.createViewAccess({
    booking: contribution
  });
}

async function rejectVendorCampaign({ tenant, user, campaignId, reason }) {
  const rejectionReason = normalizeText(reason);
  if (!rejectionReason) {
    throw makeHttpError("reason is required.", 400);
  }

  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.findCampaignById(campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    if (![
      groupFundedRepository.CAMPAIGN_STATUSES.FUNDED,
      groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW,
      groupFundedRepository.CAMPAIGN_STATUSES.SLOT_RECOVERY
    ].includes(campaign.campaignStatus)) {
      throw makeHttpError("Only funded campaigns can be rejected by the vendor.", 409);
    }

    const rejectedCampaign = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REJECTED,
        canceledAt: new Date().toISOString(),
        cancellationReason: rejectionReason
      },
      { client }
    );
    const activeHold = await groupFundedRepository.findActiveCapacityHoldByCampaign(campaign._id, {
      client,
      forUpdate: true
    });
    if (activeHold) {
      await groupFundedRepository.updateCapacityHold(
        {
          capacityHoldId: activeHold._id,
          holdStatus: groupFundedRepository.CAPACITY_HOLD_STATUSES.RELEASED,
          releasedAt: new Date().toISOString()
        },
        { client }
      );
    }
    const refunds = await createRefundObligations({
      campaign,
      reason: "vendor_rejected",
      actor: user,
      client
    });
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.VENDOR_REJECTED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { reason: rejectionReason, refundCount: refunds.length }
      },
      { client }
    );
    return { campaign: rejectedCampaign, refunds };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function expireVendorReview({ tenant, user = null, campaignId }) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.findCampaignById(campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW) {
      return { campaign, refunds: [] };
    }
    if (campaign.vendorReviewExpiresAt && new Date(campaign.vendorReviewExpiresAt).getTime() > Date.now()) {
      throw makeHttpError("Vendor review has not expired.", 409);
    }
    const expiredCampaign = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW_EXPIRED,
        canceledAt: new Date().toISOString(),
        cancellationReason: "vendor_review_expired"
      },
      { client }
    );
    const activeHold = await groupFundedRepository.findActiveCapacityHoldByCampaign(campaign._id, {
      client,
      forUpdate: true
    });
    if (activeHold) {
      await groupFundedRepository.updateCapacityHold(
        {
          capacityHoldId: activeHold._id,
          holdStatus: groupFundedRepository.CAPACITY_HOLD_STATUSES.EXPIRED,
          releasedAt: new Date().toISOString()
        },
        { client }
      );
      await groupFundedRepository.recordEvent(
        {
          campaignId: campaign._id,
          tenantId: campaign.tenantId,
          locationId: campaign.locationId,
          eventType: groupFundedRepository.EVENT_TYPES.CAPACITY_HOLD_EXPIRED,
          actorUserId: user?._id || null,
          actorRole: user ? "vendor" : "system",
          source: user ? "vendor" : "system",
          metadata: { capacityHoldId: activeHold._id }
        },
        { client }
      );
    }
    const refunds = await createRefundObligations({
      campaign,
      reason: "vendor_review_expired",
      actor: user,
      client
    });
    return { campaign: expiredCampaign, refunds };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function approveVendorCampaign({ tenant, user, campaignId }) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.findCampaignById(campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW) {
      throw makeHttpError("Only campaigns in vendor review can be approved.", 409);
    }
    if (Number(campaign.fundedAmountCents || 0) < Number(campaign.targetAmountCents || 0)) {
      throw makeHttpError("Campaign must be fully funded before approval.", 409);
    }
    if (campaign.linkedBookingId) {
      throw makeHttpError("Campaign already has a linked booking.", 409);
    }
    const activeHold = await groupFundedRepository.findActiveCapacityHoldByCampaign(campaign._id, {
      client,
      forUpdate: true
    });
    if (!activeHold) {
      throw makeHttpError("Campaign does not have an active group-funded capacity hold.", 409);
    }
    if (new Date(activeHold.expiresAt).getTime() <= Date.now()) {
      throw makeHttpError("Campaign vendor review hold has expired.", 409);
    }
    await assertCampaignSlotCapacity(campaign, { client, excludeCampaignId: campaign._id });

    const organizer = await userRepository.findUserById(campaign.organizerUserId, { client });
    const booking = await bookingRepository.createGroupFundedBooking(
      {
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        serviceId: campaign.serviceId,
        customerUserId: campaign.organizerUserId,
        customerName: organizer?.name || campaign.organizerDisplayName || "Customer",
        customerEmail: organizer?.email || null,
        customerPhone: organizer?.phone || null,
        bookingQuantity: campaign.bookingQuantity,
        scheduledStartAt: campaign.scheduledStartAt,
        scheduledEndAt: campaign.scheduledEndAt,
        notes: "Group-funded booking approved by vendor.",
        paymentReference: `group-funded:${campaign._id}`,
        paymentVerifiedAt: new Date().toISOString(),
        paymentVerifiedByUserId: user._id,
        notifyByEmail: Boolean(organizer?.email),
        notifyBySms: false,
        groupFundedBookingId: campaign._id
      },
      { client }
    );
    const approvedCampaign = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.CONFIRMED,
        linkedBookingId: booking._id,
        confirmedAt: new Date().toISOString()
      },
      { client }
    );
    await groupFundedRepository.updateCapacityHold(
      {
        capacityHoldId: activeHold._id,
        holdStatus: groupFundedRepository.CAPACITY_HOLD_STATUSES.CONVERTED,
        releasedAt: new Date().toISOString(),
        convertedBookingId: booking._id
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.VENDOR_APPROVED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { bookingId: booking._id }
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.LINKED_BOOKING_CREATED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { bookingId: booking._id, capacityHoldId: activeHold._id }
      },
      { client }
    );
    return { campaign: approvedCampaign, booking, capacityHold: activeHold };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function proposeReplacementSlot({ tenant, user, campaignId, body = {} }) {
  const note = normalizeText(body.note);
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = await groupFundedRepository.findCampaignById(campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    if (![
      groupFundedRepository.CAMPAIGN_STATUSES.FUNDED,
      groupFundedRepository.CAMPAIGN_STATUSES.SLOT_RECOVERY,
      groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW,
      groupFundedRepository.CAMPAIGN_STATUSES.REPLACEMENT_PROPOSED
    ].includes(campaign.campaignStatus)) {
      throw makeHttpError("Only fully funded campaigns can receive replacement slot proposals.", 409);
    }
    if (Number(campaign.fundedAmountCents || 0) < Number(campaign.targetAmountCents || 0)) {
      throw makeHttpError("Campaign must be fully funded before proposing a replacement slot.", 409);
    }
    const { scheduledStartAt, scheduledEndAt } = await resolveReplacementSlot(campaign, body.scheduledStartAt, { client });
    await assertCampaignSlotCapacity(buildCampaignWithSlot(campaign, scheduledStartAt, scheduledEndAt), { client });

    const activeHold = await groupFundedRepository.findActiveCapacityHoldByCampaign(campaign._id, {
      client,
      forUpdate: true
    });
    if (activeHold) {
      await groupFundedRepository.updateCapacityHold(
        {
          capacityHoldId: activeHold._id,
          holdStatus: groupFundedRepository.CAPACITY_HOLD_STATUSES.RELEASED,
          releasedAt: new Date().toISOString()
        },
        { client }
      );
    }

    const proposed = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.REPLACEMENT_PROPOSED,
        setReplacementProposal: true,
        replacementScheduledStartAt: scheduledStartAt.toISOString(),
        replacementScheduledEndAt: scheduledEndAt.toISOString(),
        replacementProposedAt: new Date().toISOString(),
        replacementProposedByUserId: user._id,
        replacementNote: note
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.REPLACEMENT_SLOT_PROPOSED,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: {
          scheduledStartAt: proposed.replacementScheduledStartAt,
          scheduledEndAt: proposed.replacementScheduledEndAt,
          note
        }
      },
      { client }
    );
    return { campaign: proposed };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function acceptReplacementSlot({ user, campaignIdOrToken }) {
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = /^\d+$/.test(String(campaignIdOrToken))
      ? await groupFundedRepository.findCampaignById(campaignIdOrToken, { client, forUpdate: true })
      : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken, { client, forUpdate: true });
    if (!campaign || String(campaign.organizerUserId) !== String(user._id)) {
      throw makeHttpError("Campaign not found.", 404);
    }
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.REPLACEMENT_PROPOSED) {
      throw makeHttpError("This campaign has no replacement slot awaiting organizer approval.", 409);
    }
    const scheduledStartAt = normalizeDateTime(campaign.replacementScheduledStartAt);
    const scheduledEndAt = normalizeDateTime(campaign.replacementScheduledEndAt);
    if (!scheduledStartAt || !scheduledEndAt) {
      throw makeHttpError("Replacement slot details are missing.", 409);
    }
    await assertCampaignSlotCapacity(buildCampaignWithSlot(campaign, scheduledStartAt, scheduledEndAt), { client });
    const now = new Date();
    const reviewExpiresAt = new Date(now.getTime() + VENDOR_REVIEW_HOLD_HOURS * 60 * 60 * 1000);
    const accepted = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REVIEW,
        vendorReviewStartedAt: now.toISOString(),
        vendorReviewExpiresAt: reviewExpiresAt.toISOString(),
        setScheduledSlot: true,
        scheduledStartAt: scheduledStartAt.toISOString(),
        scheduledEndAt: scheduledEndAt.toISOString(),
        setReplacementProposal: true,
        replacementScheduledStartAt: null,
        replacementScheduledEndAt: null,
        replacementProposedAt: null,
        replacementProposedByUserId: null,
        replacementNote: null
      },
      { client }
    );
    const capacityHold = await groupFundedRepository.createCapacityHold(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        serviceId: campaign.serviceId,
        scheduledStartAt: scheduledStartAt.toISOString(),
        scheduledEndAt: scheduledEndAt.toISOString(),
        bookingQuantity: campaign.bookingQuantity,
        expiresAt: reviewExpiresAt.toISOString()
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.REPLACEMENT_SLOT_ACCEPTED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { scheduledStartAt: accepted.scheduledStartAt, scheduledEndAt: accepted.scheduledEndAt }
      },
      { client }
    );
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.CAPACITY_HOLD_CREATED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { capacityHoldId: capacityHold._id, expiresAt: capacityHold.expiresAt }
      },
      { client }
    );
    return { campaign: accepted, capacityHold };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function declineReplacementSlot({ user, campaignIdOrToken, reason }) {
  const declineReason = normalizeText(reason, "replacement_declined");
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const campaign = /^\d+$/.test(String(campaignIdOrToken))
      ? await groupFundedRepository.findCampaignById(campaignIdOrToken, { client, forUpdate: true })
      : await groupFundedRepository.findCampaignByPublicToken(campaignIdOrToken, { client, forUpdate: true });
    if (!campaign || String(campaign.organizerUserId) !== String(user._id)) {
      throw makeHttpError("Campaign not found.", 404);
    }
    if (campaign.campaignStatus !== groupFundedRepository.CAMPAIGN_STATUSES.REPLACEMENT_PROPOSED) {
      throw makeHttpError("This campaign has no replacement slot awaiting organizer approval.", 409);
    }
    const rejectedCampaign = await groupFundedRepository.updateCampaignReviewFields(
      {
        campaignId: campaign._id,
        campaignStatus: groupFundedRepository.CAMPAIGN_STATUSES.VENDOR_REJECTED,
        canceledAt: new Date().toISOString(),
        cancellationReason: declineReason
      },
      { client }
    );
    const refunds = await createRefundObligations({
      campaign,
      reason: "vendor_rejected",
      actor: user,
      client
    });
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: groupFundedRepository.EVENT_TYPES.REPLACEMENT_SLOT_DECLINED,
        actorUserId: user._id,
        actorRole: "customer",
        source: "account",
        metadata: { reason: declineReason, refundCount: refunds.length }
      },
      { client }
    );
    return { campaign: rejectedCampaign, refunds };
  });
  const tenant = await tenantRepository.findTenantById(result.campaign.tenantId);
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

async function updateManualRefund({ tenant, user, refundId, body = {} }) {
  const refundStatus = normalizeText(body.refundStatus);
  if (![
    groupFundedRepository.REFUND_STATUSES.IN_PROGRESS,
    groupFundedRepository.REFUND_STATUSES.COMPLETED,
    groupFundedRepository.REFUND_STATUSES.POLICY_REVIEW_REQUIRED
  ].includes(refundStatus)) {
    throw makeHttpError("refundStatus must be in_progress, completed, or policy_review_required.", 400);
  }
  const evidence = normalizeRefundEvidencePayload(body);
  const result = await groupFundedRepository.withTransaction(async (client) => {
    const refund = await groupFundedRepository.findRefundById(refundId, { client, forUpdate: true });
    if (!refund) {
      throw makeHttpError("Refund not found.", 404);
    }
    const campaign = await groupFundedRepository.findCampaignById(refund.campaignId, { client, forUpdate: true });
    await assertVendorCampaignAccess({ tenant, campaign });
    const updatedRefund = await groupFundedRepository.updateRefund(
      {
        refundId: refund._id,
        refundStatus,
        vendorActorUserId: user._id,
        notes: normalizeText(body.notes),
        ...evidence,
        completedAt: refundStatus === groupFundedRepository.REFUND_STATUSES.COMPLETED
          ? new Date().toISOString()
          : null
      },
      { client }
    );
    if (refundStatus === groupFundedRepository.REFUND_STATUSES.COMPLETED) {
      await groupFundedRepository.updateContribution(
        {
          contributionId: refund.contributionId,
          contributionStatus: groupFundedRepository.CONTRIBUTION_STATUSES.REFUNDED,
          refundStatus: groupFundedRepository.REFUND_STATUSES.COMPLETED
        },
        { client }
      );
    } else if (refundStatus === groupFundedRepository.REFUND_STATUSES.POLICY_REVIEW_REQUIRED) {
      await groupFundedRepository.updateContribution(
        {
          contributionId: refund.contributionId,
          contributionStatus: groupFundedRepository.CONTRIBUTION_STATUSES.POLICY_REVIEW_REQUIRED,
          refundStatus
        },
        { client }
      );
    }
    await groupFundedRepository.recordEvent(
      {
        campaignId: campaign._id,
        tenantId: campaign.tenantId,
        locationId: campaign.locationId,
        eventType: refundStatus === groupFundedRepository.REFUND_STATUSES.COMPLETED
          ? groupFundedRepository.EVENT_TYPES.REFUND_MARKED_COMPLETED
          : groupFundedRepository.EVENT_TYPES.REFUND_MARKED_IN_PROGRESS,
        actorUserId: user._id,
        actorRole: "vendor",
        source: "vendor",
        metadata: { refundId: updatedRefund._id, refundStatus }
      },
      { client }
    );
    return { campaign, refund: updatedRefund };
  });
  await publishCampaignStreamUpdate(tenant, result.campaign);
  return result;
}

module.exports = {
  acceptReplacementSlot,
  approveVendorCampaign,
  createCampaign,
  declineReplacementSlot,
  expireFundingCampaign,
  expireVendorReview,
  cancelOrganizerCampaign,
  createVendorContributionProofAccess,
  formatPublicCampaign,
  getCampaignForCustomer,
  getPublicCampaign,
  getVendorCampaign,
  listCustomerCampaigns,
  listPublicCampaignsForVendorLocation,
  listVendorAlertEvents,
  listVendorCampaigns,
  proposeReplacementSlot,
  reportPublicCampaignAbuse,
  rejectContribution,
  rejectVendorCampaign,
  submitContributionProof,
  uploadContributionProofDirect,
  updateOrganizerCampaignDetails,
  updateManualRefund,
  verifyContribution
};
