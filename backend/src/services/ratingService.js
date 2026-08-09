const bookingRepository = require("../repositories/bookings");
const campaignRepository = require("../repositories/organizerCampaigns");
const ratingRepository = require("../repositories/ratings");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");
const organizerCampaignEvents = require("./organizerCampaignEvents");
const ticketRepository = require("../repositories/tickets");

function error(message, statusCode) { const next = new Error(message); next.statusCode = statusCode; return next; }
function stars(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw error("Rating must be between 1 and 5 stars.", 400); return parsed; }
function lowReason(value, score) {
  const reason = String(value || "").trim();
  if (score <= 2 && !reason) throw error("A low-rating reason is required for one or two stars.", 400);
  if (reason.length > 500) throw error("Low-rating reason must be 500 characters or fewer.", 400);
  return reason || null;
}

function vendorReviewFields(body) {
  const score = stars(body?.stars);
  const comment = String(body?.comment || "").trim();
  if (comment.length > 1000) throw error("Review comment must be 1000 characters or fewer.", 400);
  assertPublicTextFieldsAllowed({ "Review comment": comment });
  return { stars: score, comment };
}

async function rateVendor({ user, bookingId, body }) {
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.customerUserId) !== String(user?._id)) throw error("Booking not found.", 404);
  if (!["completed", "reviewed"].includes(booking.status)) throw error("The service must be completed before rating the vendor.", 409);
  const review = vendorReviewFields(body);
  try { return await ratingRepository.createVendorReview({ bookingId: booking._id, ticketId: null, tenantId: booking.tenantId, customerUserId: user._id, ...review }); }
  catch (next) { if (next?.code === "23505") throw error("You have already rated this booking.", 409); throw next; }
}

async function getQueueTicketRating({ user, lookupCode }) {
  const ticket = await ticketRepository.findTicketByLookupCode(String(lookupCode || "").trim().toUpperCase());
  if (!ticket || !ticket.userId || String(ticket.userId) !== String(user?._id)) {
    throw error("Queue ticket not found.", 404);
  }

  const rating = await ratingRepository.findVendorReviewByTicketId(ticket._id, user._id);
  return { eligible: ticket.status === "served", rating };
}

async function rateQueueTicket({ user, lookupCode, body }) {
  const ticket = await ticketRepository.findTicketByLookupCode(String(lookupCode || "").trim().toUpperCase());
  if (!ticket || !ticket.userId || String(ticket.userId) !== String(user?._id)) {
    throw error("Queue ticket not found.", 404);
  }
  if (ticket.status !== "served") {
    throw error("The queue service must be completed before rating the vendor.", 409);
  }

  const review = vendorReviewFields(body);
  try {
    return await ratingRepository.createVendorReview({
      bookingId: null,
      ticketId: ticket._id,
      tenantId: ticket.tenantId,
      customerUserId: user._id,
      ...review
    });
  } catch (next) {
    if (next?.code === "23505") throw error("You have already rated this queue visit.", 409);
    throw next;
  }
}

async function rateCampaignUser({ user, campaignId, contributionId, body }) {
  const campaign = await campaignRepository.findCampaignById(campaignId); if (!campaign) throw error("Campaign not found.", 404);
  const contribution = await campaignRepository.findContributionById(contributionId); if (!contribution || String(contribution.campaignId) !== String(campaign.id)) throw error("Contribution not found.", 404);
  let interactionType; let subjectUserId;
  if (String(campaign.organizerUserId) === String(user?._id)) { interactionType = "organizer_to_contributor"; subjectUserId = contribution.contributorUserId; if (!["accepted", "rejected", "refund_pending", "refund_sent", "refund_confirmed", "refund_disputed"].includes(contribution.status)) throw error("Review the contribution before rating this contributor.", 409); }
  else if (String(contribution.contributorUserId) === String(user?._id)) { interactionType = "contributor_to_organizer"; subjectUserId = campaign.organizerUserId; if (campaign.status !== "cancelled" && campaign.status !== "collected") throw error("The campaign must be closed before rating its organizer.", 409); }
  else throw error("Contribution not found.", 404);
  const score = stars(body?.stars); const privateNote = String(body?.privateNote || "").trim(); if (privateNote.length > 1000) throw error("Private note must be 1000 characters or fewer.", 400);
  try {
    const rating = await ratingRepository.createTrustRating({ interactionType, campaignId: campaign.id, contributionId: contribution.id, raterUserId: user._id, subjectUserId, stars: score, reasonCategory: lowReason(body?.reasonCategory, score), privateNote });
    organizerCampaignEvents.publish(campaign.id, { eventType: "campaign_trust_rating_submitted" });
    return rating;
  }
  catch (next) { if (next?.code === "23505") throw error("You have already rated this interaction.", 409); throw next; }
}

async function disputeRating({ user, body }) {
  const ratingType = body?.ratingType; if (!["vendor_review", "user_trust"].includes(ratingType)) throw error("Choose a valid rating type.", 400);
  const reason = String(body?.reason || "").trim(); if (!reason || reason.length > 1000) throw error("Dispute reason is required and must be 1000 characters or fewer.", 400);
  const rating = ratingType === "vendor_review"
    ? await ratingRepository.findVendorReviewById(body.ratingId)
    : await ratingRepository.findTrustRatingById(body.ratingId);
  if (!rating) throw error("Rating not found.", 404);
  const isParticipant = ratingType === "vendor_review"
    ? String(rating.customer_user_id) === String(user?._id)
    : [rating.rater_user_id, rating.subject_user_id].some((id) => String(id) === String(user?._id));
  if (!isParticipant) throw error("Rating not found.", 404);
  if (new Date(rating.created_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) throw error("The 30-day rating appeal window has closed.", 409);
  try { return await ratingRepository.createDispute({ ratingType, ratingId: body.ratingId, reporterUserId: user._id, reason }); }
  catch (next) { if (next?.code === "23505") throw error("You have already appealed this rating.", 409); throw next; }
}

async function rateOrganizerFromVendor({ user, tenant, bookingId, body }) {
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.tenantId) !== String(tenant?._id)) throw error("Booking not found.", 404);
  if (!["completed", "reviewed"].includes(booking.status)) throw error("The service must be completed before rating the organizer.", 409);
  const campaign = await campaignRepository.findCampaignByBookingId(booking._id);
  if (!campaign) throw error("Organizer campaign not found.", 404);
  const score = stars(body?.stars); const privateNote = String(body?.privateNote || "").trim();
  return ratingRepository.createTrustRating({ interactionType: "vendor_to_organizer", bookingId: booking._id, campaignId: campaign.id, raterUserId: user._id, subjectUserId: campaign.organizerUserId, stars: score, reasonCategory: lowReason(body?.reasonCategory, score), privateNote });
}

async function reviseVendorReview({ user, reviewId, body }) {
  const score = stars(body?.stars); const comment = String(body?.comment || "").trim();
  assertPublicTextFieldsAllowed({ "Review comment": comment });
  const review = await ratingRepository.reviseVendorReview({ reviewId, customerUserId: user._id, stars: score, comment });
  if (!review) throw error("This review can no longer be revised.", 409);
  return review;
}

async function replyToVendorReview({ user, tenant, reviewId, body }) {
  const reply = String(body?.reply || "").trim(); if (!reply || reply.length > 1000) throw error("Reply is required and must be 1000 characters or fewer.", 400);
  assertPublicTextFieldsAllowed({ "Vendor reply": reply });
  const review = await ratingRepository.replyToVendorReview({ reviewId, tenantId: tenant._id, actorUserId: user._id, reply });
  if (!review) throw error("This review cannot accept another reply.", 409);
  return review;
}

module.exports = { disputeRating, getQueueTicketRating, rateCampaignUser, rateOrganizerFromVendor, rateQueueTicket, rateVendor, replyToVendorReview, reviseVendorReview };
