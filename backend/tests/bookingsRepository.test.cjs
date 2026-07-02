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
      // Try next candidate.
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

test("vendor booking list orders incoming requests by newest created date", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          if (/SELECT COUNT\(\*\)/.test(query)) {
            return { rows: [{ count: 0 }] };
          }
          return { rows: [] };
        }
      }
    }
  });

  const result = await bookingsRepository.listBookingsForTenant(1, {
    locationId: 2,
    limit: 100
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].query, /SELECT COUNT\(\*\)/);
  assert.deepEqual(calls[0].params, [1, 2]);

  assert.match(
    calls[1].query,
    /ORDER BY\s+bookings\.created_at DESC,\s+bookings\.id DESC\s+LIMIT \$3 OFFSET \$4/s
  );
  assert.deepEqual(calls[1].params, [1, 2, 100, 0]);
  assert.deepEqual(result.bookings, []);
  assert.equal(result.totalItems, 0);
});

test("customer booking list supports pagination metadata", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          if (/SELECT COUNT\(\*\)/.test(query)) {
            return { rows: [{ count: 7 }] };
          }
          return {
            rows: [
              {
                id: 11,
                reference: "BKG-11",
                tenant_id: 1,
                tenant_name: "Demo Tenant",
                tenant_slug: "demo",
                location_id: 2,
                location_name: "Main",
                location_slug: "main",
                service_id: 3,
                service_name: "Consultation",
                service_slug: "consultation",
                booking_quantity: 1,
                customer_user_id: 9,
                customer_name: "Customer",
                customer_email: "customer@example.com",
                customer_phone: "09170000000",
                scheduled_start_at: new Date("2026-06-29T02:00:00.000Z"),
                scheduled_end_at: new Date("2026-06-29T03:00:00.000Z"),
                status: "pending",
                notes: null,
                payment_reference: null,
                payment_status: "unpaid",
                payment_proof_object_key: null,
                payment_proof_file_name: null,
                payment_proof_content_type: null,
                payment_proof_size_bytes: null,
                payment_proof_uploaded_at: null,
                payment_verified_at: null,
                payment_verified_by_user_id: null,
                payment_rejected_at: null,
                payment_rejected_by_user_id: null,
                payment_rejection_reason: null,
                pending_expires_at: null,
                expired_at: null,
                expiration_reason: null,
                contact_verified_at: null,
                contact_verification_channel: null,
                notify_by_email: true,
                notify_by_sms: false,
                sms_alert_fee_payment_id: null,
                queue_ticket_id: null,
                checked_in_at: null,
                no_show_at: null,
                created_at: new Date("2026-06-28T02:00:00.000Z"),
                updated_at: new Date("2026-06-28T02:00:00.000Z")
              }
            ]
          };
        }
      }
    }
  });

  const result = await bookingsRepository.listBookingsForCustomer(11, {
    pageSize: 5,
    offset: 5
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].query, /SELECT COUNT\(\*\)/);
  assert.deepEqual(calls[0].params, [11]);
  assert.match(calls[1].query, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(calls[1].params, [11, 5, 5]);
  assert.equal(result.totalItems, 7);
  assert.equal(result.bookings[0]._id, "11");
});

test("vendor booking list applies search filters and timezone-aware scheduled date range filters", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          if (/SELECT COUNT\(\*\)/.test(query)) {
            return { rows: [{ count: 42 }] };
          }
          return { rows: [] };
        }
      }
    }
  });

  const result = await bookingsRepository.listBookingsForTenant(1, {
    locationId: 2,
    page: 2,
    pageSize: 15,
    status: "confirmed",
    scheduledDateFrom: "2026-06-25",
    scheduledDateTo: "2026-06-28",
    search: "Alice"
  });

  assert.equal(calls.length, 2);

  assert.match(calls[0].query, /SELECT COUNT\(\*\)/);
  assert.match(
    calls[0].query,
    /\(bookings\.scheduled_start_at AT TIME ZONE store_locations\.timezone\)::date BETWEEN \$4::date AND \$5::date/
  );
  assert.match(calls[0].query, /bookings\.customer_name ILIKE \$6/);
  assert.deepEqual(calls[0].params, [1, 2, "confirmed", "2026-06-25", "2026-06-28", "%Alice%"]);

  assert.match(
    calls[1].query,
    /LIMIT \$7 OFFSET \$8/
  );
  assert.deepEqual(calls[1].params, [1, 2, "confirmed", "2026-06-25", "2026-06-28", "%Alice%", 15, 15]);
  assert.equal(result.totalItems, 42);
});

test("pending booking expiration excludes bookings with submitted payment proof", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          return { rows: [{ id: 123 }] };
        }
      }
    }
  });

  const expiredIds = await bookingsRepository.expirePendingBookings({
    tenantId: 1,
    now: "2026-06-23T07:00:00.000Z",
    reason: "Expired after pending booking window."
  });

  assert.deepEqual(expiredIds, ["123"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /status = 'pending'/);
  assert.match(calls[0].query, /payment_proof_object_key IS NULL/);
  assert.match(calls[0].query, /tenant_id = \$3/);
  assert.deepEqual(calls[0].params, [
    "2026-06-23T07:00:00.000Z",
    "Expired after pending booking window.",
    1
  ]);
});

test("booking creation retries once on duplicate reference and then reloads the inserted booking", async () => {
  const calls = [];
  let insertAttempts = 0;
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });

          if (String(query).includes("INSERT INTO bookings")) {
            insertAttempts += 1;
            if (insertAttempts === 1) {
              const error = new Error("duplicate key");
              error.code = "23505";
              throw error;
            }

            return { rows: [{ id: 77 }] };
          }

          if (String(query).includes("WHERE bookings.id = $1")) {
            return {
              rows: [
                {
                  id: 77,
                  reference: "BKG-RETRY",
                  tenant_id: 1,
                  location_id: 2,
                  service_id: 3,
                  customer_user_id: null,
                  customer_name: "Retry Customer",
                  customer_email: null,
                  customer_phone: null,
                  booking_quantity: 1,
                  scheduled_start_at: new Date("2026-06-23T08:00:00.000Z"),
                  scheduled_end_at: new Date("2026-06-23T09:00:00.000Z"),
                  status: "pending",
                  notes: null,
                  payment_reference: null,
                  payment_status: "unpaid",
                  payment_proof_object_key: null,
                  payment_proof_file_name: null,
                  payment_proof_content_type: null,
                  payment_proof_size_bytes: null,
                  payment_proof_uploaded_at: null,
                  payment_verified_at: null,
                  payment_verified_by_user_id: null,
                  payment_rejected_at: null,
                  payment_rejected_by_user_id: null,
                  payment_rejection_reason: null,
                  pending_expires_at: null,
                  expired_at: null,
                  expiration_reason: null,
                  notify_by_email: true,
                  notify_by_sms: false,
                  sms_alert_fee_payment_id: null,
                  contact_verified_at: null,
                  contact_verification_channel: null,
                  queue_ticket_id: null,
                  checked_in_at: null,
                  checked_in_by_user_id: null,
                  no_show_at: null,
                  no_show_by_user_id: null,
                  created_at: new Date("2026-06-23T08:00:00.000Z"),
                  updated_at: new Date("2026-06-23T08:00:00.000Z"),
                  tenant_name: "Tenant",
                  tenant_slug: "tenant",
                  location_name: "Main",
                  location_slug: "main",
                  service_name: "Consultation",
                  service_slug: "consultation",
                  service_manual_payment_required: false,
                  service_price_amount_cents: 0,
                  service_currency: "PHP",
                  service_price_display: "Free",
                  location_payment_method_label: "",
                  location_payment_account_display_name: "",
                  location_payment_account_identifier_display: "",
                  location_payment_qr_image_url: "",
                  location_payment_qr_active: false,
                  queue_ticket_number: null,
                  queue_ticket_lookup_code: null,
                  queue_ticket_status: null
                }
              ]
            };
          }

          throw new Error(`Unexpected query: ${String(query)}`);
        }
      }
    }
  });

  const booking = await bookingsRepository.createBooking({
    tenantId: 1,
    locationId: 2,
    serviceId: 3,
    customerName: "Retry Customer",
    scheduledStartAt: "2026-06-23T08:00:00.000Z",
    scheduledEndAt: "2026-06-23T09:00:00.000Z"
  });

  assert.equal(insertAttempts, 2);
  assert.equal(booking._id, "77");
  assert.equal(calls.filter((call) => String(call.query).includes("INSERT INTO bookings")).length, 2);
  assert.equal(calls.filter((call) => String(call.query).includes("WHERE bookings.id = $1")).length, 1);
});

test("booking updates return the current booking when no fields change and skip queue-ticket updates with no data", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      calls.push({ query, params });
      return {
        rows: [
          {
            id: 10,
            reference: "BKG-10",
            tenant_id: 1,
            location_id: 2,
            service_id: 3,
            customer_user_id: null,
            customer_name: "Customer",
            customer_email: null,
            customer_phone: null,
            booking_quantity: 1,
            scheduled_start_at: new Date("2026-06-23T08:00:00.000Z"),
            scheduled_end_at: new Date("2026-06-23T09:00:00.000Z"),
            status: "pending",
            notes: null,
            payment_reference: null,
            payment_status: "unpaid",
            payment_proof_object_key: null,
            payment_proof_file_name: null,
            payment_proof_content_type: null,
            payment_proof_size_bytes: null,
            payment_proof_uploaded_at: null,
            payment_verified_at: null,
            payment_verified_by_user_id: null,
            payment_rejected_at: null,
            payment_rejected_by_user_id: null,
            payment_rejection_reason: null,
            pending_expires_at: null,
            expired_at: null,
            expiration_reason: null,
            notify_by_email: true,
            notify_by_sms: false,
            sms_alert_fee_payment_id: null,
            contact_verified_at: null,
            contact_verification_channel: null,
            queue_ticket_id: null,
            checked_in_at: null,
            checked_in_by_user_id: null,
            no_show_at: null,
            no_show_by_user_id: null,
            created_at: new Date("2026-06-23T08:00:00.000Z"),
            updated_at: new Date("2026-06-23T08:00:00.000Z"),
            tenant_name: "Tenant",
            tenant_slug: "tenant",
            location_name: "Main",
            location_slug: "main",
            service_name: "Consultation",
            service_slug: "consultation",
            service_manual_payment_required: false,
            service_price_amount_cents: 0,
            service_currency: "PHP",
            service_price_display: "Free",
            location_payment_method_label: "",
            location_payment_account_display_name: "",
            location_payment_account_identifier_display: "",
            location_payment_qr_image_url: "",
            location_payment_qr_active: false,
            queue_ticket_number: null,
            queue_ticket_lookup_code: null,
            queue_ticket_status: null
          }
        ]
      };
    }
  };
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: client
    }
  });

  const booking = await bookingsRepository.updateBooking(10, {}, { client });
  const queueTicketUpdate = await bookingsRepository.updateBookingByQueueTicketId(5, {}, { client });

  assert.equal(booking._id, "10");
  assert.equal(queueTicketUpdate, null);
  assert.equal(calls.length, 1);
});

test("count overlapping active bookings uses the expected time window and exclusion id", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          return { rows: [{ count: 3 }] };
        }
      }
    }
  });

  const count = await bookingsRepository.countOverlappingActiveBookings(1, {
    client: {
      query: async (query, params) => {
        calls.push({ query, params });
        return { rows: [{ count: 3 }] };
      }
    },
    locationId: 2,
    serviceId: 3,
    startsAt: "2026-06-23T08:00:00.000Z",
    endsAt: "2026-06-23T09:00:00.000Z",
    excludeBookingId: 4
  });

  assert.equal(count, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /\(\$3::bigint IS NULL OR service_id = \$3::bigint\)/);
  assert.match(calls[0].query, /scheduled_start_at < \$6::timestamptz/);
  assert.match(calls[0].query, /\(\$7::bigint IS NULL OR id <> \$7::bigint\)/);
  assert.deepEqual(calls[0].params, [1, 2, 3, ["pending", "confirmed", "rescheduled"], "2026-06-23T08:00:00.000Z", "2026-06-23T09:00:00.000Z", 4]);
});

test("count overlapping active bookings can count branch-wide capacity across services", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          return { rows: [{ count: 1 }] };
        }
      }
    }
  });

  const count = await bookingsRepository.countOverlappingActiveBookings(1, {
    locationId: 2,
    serviceId: null,
    startsAt: "2026-06-23T08:00:00.000Z",
    endsAt: "2026-06-23T09:30:00.000Z"
  });

  assert.equal(count, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /\(\$3::bigint IS NULL OR service_id = \$3::bigint\)/);
  assert.deepEqual(calls[0].params, [1, 2, null, ["pending", "confirmed", "rescheduled"], "2026-06-23T08:00:00.000Z", "2026-06-23T09:30:00.000Z", null]);
});
