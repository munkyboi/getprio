const { normalizePhilippineMobileNumber } = require("../utils/phone");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalizePhilippineMobileNumber(value);
}

function buildCustomerIdentityCandidates(user) {
  if (!user) {
    return [];
  }

  const candidates = [];

  if (user._id) {
    candidates.push({ kind: "userId", value: String(user._id) });
  }

  const email = normalizeEmail(user.email);
  if (email) {
    candidates.push({ kind: "email", value: email });
  }

  const phone = normalizePhone(user.phone);
  if (phone) {
    candidates.push({ kind: "phone", value: phone });
  }

  return candidates;
}

function doesIdentityMatchTicket(ticket, candidate) {
  if (!ticket || !candidate) {
    return false;
  }

  if (candidate.kind === "userId") {
    return String(ticket.userId || "") === String(candidate.value || "");
  }

  if (candidate.kind === "email") {
    return normalizeEmail(ticket.customerEmail) === candidate.value;
  }

  if (candidate.kind === "phone") {
    return normalizePhone(ticket.customerPhone) === candidate.value;
  }

  return false;
}

function userOwnsTicket(user, ticket) {
  return buildCustomerIdentityCandidates(user).some((candidate) =>
    doesIdentityMatchTicket(ticket, candidate)
  );
}

function requestMatchesTicket(requestBody, ticket) {
  const email = normalizeEmail(requestBody?.customerEmail);
  const phone = normalizePhone(requestBody?.customerPhone);

  if (!email && !phone) {
    return false;
  }

  if (email && normalizeEmail(ticket.customerEmail) === email) {
    return true;
  }

  if (phone && normalizePhone(ticket.customerPhone) === phone) {
    return true;
  }

  return false;
}

module.exports = {
  userOwnsTicket,
  requestMatchesTicket
};
