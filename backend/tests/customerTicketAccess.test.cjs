const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requestMatchesTicket,
  userOwnsTicket
} = require("../src/services/customerTicketAccess.js");

test("linked queue tickets trust only their account owner", () => {
  const ticket = {
    userId: "owner-1",
    customerEmail: "shared@example.com",
    customerPhone: "09171234567"
  };

  assert.equal(
    userOwnsTicket(
      {
        _id: "other-user",
        email: "shared@example.com",
        phone: "09171234567"
      },
      ticket
    ),
    false
  );
  assert.equal(
    requestMatchesTicket(
      {
        customerEmail: "shared@example.com",
        customerPhone: "09171234567"
      },
      ticket
    ),
    false
  );
  assert.equal(userOwnsTicket({ _id: "owner-1" }, ticket), true);
});

test("unclaimed guest tickets can still be verified through matching contact details", () => {
  const ticket = {
    userId: null,
    customerEmail: "guest@example.com",
    customerPhone: "09179876543"
  };

  assert.equal(userOwnsTicket({ _id: "user-1", email: "guest@example.com" }, ticket), true);
  assert.equal(requestMatchesTicket({ customerPhone: "09179876543" }, ticket), true);
});
