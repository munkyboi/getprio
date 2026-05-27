const express = require("express");
const bcrypt = require("bcryptjs");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const tenantRepository = require("../repositories/tenants");
const ticketRepository = require("../repositories/tickets");
const userRepository = require("../repositories/users");

const router = express.Router();

router.use(authenticate);

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function buildUserPayload(user) {
  const memberships = (user.tenantMemberships || []).filter(
    (membership) => membership.isActive !== false
  );
  const tenants = await tenantRepository.findTenantsByIds(
    memberships.map((membership) => membership.tenantId)
  );
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    oauthProviders: [...new Set((user.oauthAccounts || []).map((account) => account.provider))],
    lastLoginProvider: user.lastLoginProvider,
    tenants: memberships
      .map((membership) => {
        const tenant = tenantsById.get(String(membership.tenantId));
        if (!tenant) {
          return null;
        }

        return {
          id: String(tenant._id),
          name: tenant.name,
          slug: tenant.slug,
          role: membership.role,
          isActive: membership.isActive !== false
        };
      })
      .filter(Boolean)
  };
}

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const tickets = await ticketRepository.listTicketsByUserId(req.user._id, {
      limit: 50,
      sort: req.query.sort,
      direction: req.query.direction
    });

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        emailVerified: Boolean(req.user.emailVerified)
      },
      tickets: tickets.map((ticket) => ({
        id: ticket._id,
        lookupCode: ticket.lookupCode,
        ticketNumber: ticket.ticketNumber,
        tenantName: ticket.tenantName,
        tenantSlug: ticket.tenantSlug,
        locationName: ticket.locationName,
        locationSlug: ticket.locationSlug,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      }))
    });
  })
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);

    if (!name) {
      const error = new Error("Name is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!email || !validateEmail(email)) {
      const error = new Error("A valid email is required.");
      error.statusCode = 400;
      throw error;
    }

    const existingUser = await userRepository.findUserByEmail(email, {
      excludeId: req.user._id
    });
    if (existingUser) {
      const error = new Error("That email is already registered.");
      error.statusCode = 409;
      throw error;
    }

    const updatedUser = await userRepository.updateUser(req.user._id, {
      name,
      email,
      phone: phone || null,
      emailVerified: req.user.email === email ? req.user.emailVerified : false
    });

    res.json({
      user: await buildUserPayload(updatedUser)
    });
  })
);

router.patch(
  "/password",
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (newPassword.length < 8) {
      const error = new Error("New password must be at least 8 characters.");
      error.statusCode = 400;
      throw error;
    }

    if (req.user.passwordHash) {
      const passwordMatches = await bcrypt.compare(currentPassword, req.user.passwordHash);
      if (!passwordMatches) {
        const error = new Error("Current password is incorrect.");
        error.statusCode = 401;
        throw error;
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updatedUser = await userRepository.updateUser(req.user._id, {
      passwordHash,
      lastLoginProvider: "password"
    });

    res.json({
      user: await buildUserPayload(updatedUser)
    });
  })
);

module.exports = router;
