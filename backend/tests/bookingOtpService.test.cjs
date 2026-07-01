const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

test("booking OTP request and verify returns a server-side booking verification token", async () => {
  const otps = new Map();
  const sentEmails = [];
  const bookingOtpService = requireWithMocks("../src/services/bookingOtpService.js", {
    "../config/env": { jwtSecret: "test-secret" },
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/bookingOtps": {
      createOtp: async (data) => {
        const otp = {
          _id: "1",
          tenantId: String(data.tenantId),
          codeHash: data.codeHash,
          deliveryChannel: data.deliveryChannel,
          deliveryTarget: data.deliveryTarget,
          payload: data.payload,
          expiresAt: data.expiresAt,
          verifiedAt: null,
          verificationTokenHash: null,
          consumedAt: null,
          createdAt: new Date("2026-07-06T00:00:00.000Z"),
          updatedAt: new Date("2026-07-06T00:00:00.000Z")
        };
        otps.set(otp._id, otp);
        return otp;
      },
      findOtpByIdForUpdate: async (otpId) => otps.get(String(otpId)) || null,
      markOtpVerified: async (otpId, data) => {
        const otp = otps.get(String(otpId));
        const updated = {
          ...otp,
          verifiedAt: new Date("2026-07-06T00:02:00.000Z"),
          verificationTokenHash: data.verificationTokenHash
        };
        otps.set(String(otpId), updated);
        return updated;
      }
    },
    "./notificationService": {
      sendEmail: async (email) => {
        sentEmails.push(email);
      },
      sendSms: async () => {}
    }
  });

  const tenant = { _id: "tenant-1", name: "Demo Tenant" };
  const otp = await bookingOtpService.requestBookingOtp({
    tenant,
    payload: {
      tenantSlug: "demo",
      locationSlug: "main",
      serviceSlug: "consultation",
      scheduledStartAt: "2026-07-06T01:00:00.000Z",
      bookingQuantity: 2,
      customerName: "Customer One",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567"
    }
  });

  assert.equal(otp.otpId, "1");
  assert.equal(otps.get("1").payload.bookingQuantity, 2);
  assert.equal(sentEmails.length, 1);
  const code = sentEmails[0].text.match(/\b\d{6}\b/)[0];

  const verified = await bookingOtpService.verifyBookingOtp({
    tenant,
    otpId: otp.otpId,
    code
  });

  assert.equal(verified.verified, true);
  assert.equal(typeof verified.bookingVerificationToken, "string");
  assert.equal(verified.bookingVerificationToken.length, 64);
  assert.equal(verified.contactVerificationChannel, "email");
});

test("booking OTP service rejects invalid payloads, resend cooldowns, and verification mismatches", async () => {
  const crypto = require("node:crypto");
  const originalRandomInt = crypto.randomInt;
  const originalRandomBytes = crypto.randomBytes;
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-06T00:00:00.000Z");
  crypto.randomInt = () => 123456;
  crypto.randomBytes = () => Buffer.from("a".repeat(32), "hex");

  const otps = new Map();
  const bookingOtpService = requireWithMocks("../src/services/bookingOtpService.js", {
    "../config/env": { jwtSecret: "test-secret" },
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/bookingOtps": {
      createOtp: async (data) => {
        const otp = {
          _id: "2",
          tenantId: String(data.tenantId),
          codeHash: data.codeHash,
          deliveryChannel: data.deliveryChannel,
          deliveryTarget: data.deliveryTarget,
          payload: data.payload,
          expiresAt: data.expiresAt,
          verifiedAt: null,
          verificationTokenHash: null,
          consumedAt: null,
          createdAt: new Date("2026-07-06T00:00:00.000Z"),
          updatedAt: new Date("2026-07-06T00:00:00.000Z")
        };
        otps.set(otp._id, otp);
        return otp;
      },
      findOtpById: async (otpId) => otps.get(String(otpId)) || null,
      findOtpByIdForUpdate: async (otpId) => otps.get(String(otpId)) || null,
      markOtpVerified: async (otpId, data) => {
        const otp = otps.get(String(otpId));
        const updated = {
          ...otp,
          verifiedAt: new Date("2026-07-06T00:02:00.000Z"),
          verificationTokenHash: data.verificationTokenHash
        };
        otps.set(String(otpId), updated);
        return updated;
      },
      findVerifiedTokenForUpdate: async () => ({
        _id: "2",
        tenantId: "tenant-1",
        payload: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingQuantity: 2,
          customerName: "Customer One",
          customerEmail: "customer@example.com",
          customerPhone: "09171234567",
          notifyBySms: false,
          notes: ""
        },
        verifiedAt: new Date("2026-07-06T00:02:00.000Z"),
        deliveryChannel: "email",
        consumedAt: null,
        expiresAt: new Date("2026-07-06T00:20:00.000Z")
      }),
      markTokenConsumed: async () => {}
    },
    "./notificationService": {
      sendEmail: async () => {},
      sendSms: async () => {}
    }
  });

  try {
    await assert.rejects(
      () => bookingOtpService.requestBookingOtp({
        tenant: { _id: "tenant-1", name: "Demo Tenant" },
        payload: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingQuantity: 25,
          customerName: "Customer One",
          customerEmail: "customer@example.com",
          customerPhone: "09171234567"
        }
      }),
      (error) => error.statusCode === 400
    );

    await assert.rejects(
      () => bookingOtpService.requestBookingOtp({
        tenant: { _id: "tenant-1", name: "Demo Tenant" },
        payload: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingQuantity: 1,
          customerName: "Customer One",
          customerEmail: "",
          customerPhone: ""
        },
        channel: "sms"
      }),
      (error) => error.statusCode === 400
    );

    const otp = await bookingOtpService.requestBookingOtp({
      tenant: { _id: "tenant-1", name: "Demo Tenant" },
      payload: {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-07-06T01:00:00.000Z",
        bookingQuantity: 1,
        customerName: "Customer One",
        customerEmail: "customer@example.com",
        customerPhone: "09171234567"
      }
    });

    await assert.rejects(
      () => bookingOtpService.resendBookingOtp({ tenant: { _id: "tenant-1" }, otpId: otp.otpId }),
      (error) => error.statusCode === 429
    );

    await assert.rejects(
      () => bookingOtpService.verifyBookingOtp({ tenant: { _id: "tenant-1" }, otpId: otp.otpId, code: "12" }),
      (error) => error.statusCode === 400
    );

    await assert.rejects(
      () => bookingOtpService.verifyBookingOtp({ tenant: { _id: "tenant-1" }, otpId: otp.otpId, code: "999999" }),
      (error) => error.statusCode === 400
    );

    const verifiedPayload = await bookingOtpService.getVerifiedBookingPayload({
      tenant: { _id: "tenant-1" },
      token: "verified-token"
    });

    assert.equal(verifiedPayload.otpId, "2");
    assert.equal(verifiedPayload.payload.bookingQuantity, 2);

    await assert.rejects(
      () => bookingOtpService.getVerifiedBookingPayload({ tenant: { _id: "tenant-2" }, token: "verified-token" }),
      (error) => error.statusCode === 400
    );
  } finally {
    Date.now = originalNow;
    crypto.randomInt = originalRandomInt;
    crypto.randomBytes = originalRandomBytes;
  }
});
