const { assertPublicTextAllowed } = require("../services/contentModeration");

const MODERATED_FIELD_NAMES = new Set([
  "name",
  "displayname",
  "tenantname",
  "ownername",
  "ownerdisplayname",
  "slug",
  "tenantslug",
  "locationslug",
  "serviceslug",
  "counterslug",
  "title",
  "campaigntitle",
  "description",
  "message",
  "subject",
  "notes",
  "note",
  "reason",
  "replacementnote",
  "overridereason",
  "publicprofilecategory",
  "paymentmethodlabel",
  "paymentbankname",
  "paymentaccountdisplayname",
  "bookingquantitylabel"
]);

function formatFieldName(fieldName) {
  return String(fieldName)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function assertModeratedPayloadAllowed(value, fieldName = "") {
  if (typeof value === "string") {
    if (MODERATED_FIELD_NAMES.has(fieldName.toLowerCase())) {
      assertPublicTextAllowed(value, formatFieldName(fieldName));
    }
    return;
  }

  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => assertModeratedPayloadAllowed(item));
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => assertModeratedPayloadAllowed(nestedValue, key));
}

function moderatePublicText(req, res, next) {
  try {
    assertModeratedPayloadAllowed(req.body);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  MODERATED_FIELD_NAMES,
  assertModeratedPayloadAllowed,
  moderatePublicText
};
