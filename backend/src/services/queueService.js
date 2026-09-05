const db = require("../config/db");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const queueEventRepository = require("../repositories/queueEvents");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const queueDayRepository = require("../repositories/queueDays");
const ticketRepository = require("../repositories/tickets");
const bookingRepository = require("../repositories/bookings");
const queueEvents = require("./queueEvents");
const queueLifecycle = require("./queueLifecycle");
const queueDayLifecycleService = require("./queueDayLifecycleService");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
const allowanceService = require("./allowanceService");
const {
  buildQueueEventActor,
  formatTicketNumber,
  getDateKey,
  getRecoveryDeadline
} = require("./queueHelpers");
const { buildQueueSnapshot, resolveLocation } = require("./queueSnapshotHelpers");
const {
  createTicketRecord,
  reserveNextSequence
} = require("./queueTicketPersistenceHelpers");
const {
  maybeAutoPauseQueueDay,
  maybeAutoResumeQueueDay,
  maybeNotifyUpcomingTickets
} = require("./queueAutomationHelpers");

async function appendQueueEvent(client, ticket, eventType, options = {}) {
  return queueEventRepository.createQueueEvent(
    {
      ticketId: ticket?._id || null,
      tenantId: ticket.tenantId,
      locationId: ticket.locationId,
      queueDateKey: ticket.dateKey,
      eventType,
      fromStatus: options.fromStatus || null,
      toStatus: options.toStatus || null,
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "system",
      metadata: options.metadata || {}
    },
    { client }
  );
}

async function appendScopedQueueEvent(client, data) {
  return queueEventRepository.createQueueEvent(
    {
      ticketId: null,
      tenantId: data.tenantId,
      locationId: data.locationId,
      queueDateKey: data.queueDateKey,
      eventType: data.eventType,
      fromStatus: null,
      toStatus: null,
      actorUserId: data.actorUserId || null,
      actorRole: data.actorRole || null,
      source: data.source || "system",
      metadata: data.metadata || {}
    },
    { client }
  );
}


function getCurrentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getTenantUsage(tenantId) {
  const subscription = await billingRepository.getActiveSubscriptionByTenantId(tenantId);
  const periodStart = subscription?.currentPeriodStart || getCurrentMonthStart();
  const periodEnd = subscription?.currentPeriodEnd || null;
  const emailsSentThisPeriod = await notificationDeliveryRepository.countSentTransactionalEmails(tenantId, {
    from: periodStart,
    to: periodEnd,
    ignoreMissingTable: true
  });

  return {
    periodStart,
    periodEnd,
    emailsSentThisPeriod
  };
}

function getQueueDayBusinessDateKey(resolution) {
  const businessDate = resolution?.businessDate || resolution?.queueDay?.businessDate;
  return businessDate ? String(businessDate).replace(/-/g, "") : null;
}

async function resolveQueueDayForSnapshot(tenant, location) {
  let resolution = await queueDayLifecycleService.getQueueDayForSnapshot(
    tenant,
    location
  );
  const queueDay = resolution.queueDay;

  if (
    queueDay?.state === "open"
    && queueDay.currentClosesAt
    && new Date(queueDay.currentClosesAt) <= new Date()
  ) {
    await queueDayLifecycleService.closeQueueDay(tenant, location, {
      source: "request_reconciliation",
      reason: "effective_hours_ended"
    });
    resolution = await queueDayLifecycleService.getQueueDayForSnapshot(
      tenant,
      location
    );
  }

  return resolution;
}

async function assertQueueDayOpen(tenant, location, options = {}) {
  if (location?.queueLifecycleMode === "enforced") {
    const queueDay = await queueDayLifecycleService.getAuthoritativeQueueDay(
      tenant._id,
      location._id,
      { client: options.client, state: "open", forUpdate: Boolean(options.client) }
    );
    if (queueDay && new Date(queueDay.currentClosesAt) > new Date()) {
      return queueDay;
    }
    if (queueDay && options.client) {
      await queueDayLifecycleService.closeLockedQueueDay(
        options.client,
        tenant,
        location,
        queueDay,
        { source: "request_reconciliation", reason: "effective_hours_ended" }
      );
    } else if (queueDay) {
      await queueDayLifecycleService.closeQueueDay(tenant, location, {
        source: "request_reconciliation",
        reason: "effective_hours_ended"
      });
    }
    throw Object.assign(new Error(queueDay
      ? "The Queue Day deadline has passed."
      : "The queue has not been opened by staff."), {
      statusCode: 409,
      code: queueDay ? "QUEUE_DAY_OVERDUE" : "QUEUE_DAY_UNOPENED"
    });
  }
  const queueDateKey = options.queueDateKey || getDateKey();
  const activeClosure = await queueDayClosureRepository.findActiveClosure(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );
  if (!activeClosure) {
    return;
  }

  const error = new Error("This queue day is closed. Reopen the queue to continue operations.");
  error.statusCode = 409;
  error.code = "QUEUE_DAY_CLOSED";
  throw error;
}

async function getQueueSnapshot(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const queueDayResolution = location?.queueLifecycleMode === "enforced"
    ? await resolveQueueDayForSnapshot(tenant, location)
    : null;
  const queueDateKey = getQueueDayBusinessDateKey(queueDayResolution);
  const snapshot = await buildQueueSnapshot(
    tenant,
    {
      ...options,
      location,
      ...(
        queueDateKey && !options.queueDateKey
          ? { queueDateKey }
          : {}
      )
    },
    getTenantUsage
  );
  if (location?.queueLifecycleMode === "shadow") {
    await queueDayLifecycleService.recordShadowComparison(
      tenant,
      location,
      snapshot.queueDay
    );
    return snapshot;
  }
  if (location?.queueLifecycleMode !== "enforced") {
    return snapshot;
  }
  const resolution = queueDayResolution;
  const queueDay = resolution.queueDay;
  snapshot.queueDay = queueDayLifecycleService.formatQueueDayStatus(
    queueDay,
    location,
    new Date(),
    resolution
  );
  if (queueDay?.state === "closed") {
    const closeEvent = await queueEventRepository.findLatestLifecycleEvent(
      queueDay._id,
      "queue_day_closed"
    );
    snapshot.queueDay.outcomeCounts = closeEvent?.metadata?.outcomes || null;
  }
  snapshot.queueIntake = {
    ...snapshot.queueIntake,
    state: snapshot.queueDay.intakeMode === "paused"
      ? "paused"
      : snapshot.queueDay.state === "open"
        ? snapshot.queueIntake.state
        : "closed",
    stateLabel: snapshot.queueDay.intakeMode === "paused"
      ? "Paused"
      : snapshot.queueDay.state === "open"
        ? snapshot.queueIntake.stateLabel
        : snapshot.queueDay.state === "unopened"
          ? "Not opened"
          : "Closed"
  };
  return snapshot;
}

async function assertQueueIntakeOpen(tenant, location, options = {}) {
  if (location?.queueLifecycleMode === "enforced") {
    return queueDayLifecycleService.assertIntakeOpen(tenant, location, options);
  }
  await assertQueueDayOpen(tenant, location, options);

  const queueDateKey = options.queueDateKey || getDateKey();
  const activePause = await queueDayPauseRepository.findActivePause(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );

  if (!activePause) {
    return;
  }

  const reasonText = activePause.pauseReason ? ` ${activePause.pauseReason}` : "";
  const error = new Error(
    `This queue is paused for new joins.${reasonText}`.trim()
  );
  error.statusCode = 409;
  error.code = "QUEUE_INTAKE_PAUSED";
  throw error;
}

async function assertRestoreCapacityAvailable(tenant, location, options = {}) {
  if (!tenant.autoPauseEnabled || !tenant.autoPauseThreshold) {
    return;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    client: options.client,
    locationId: location._id,
    dateKey: queueDateKey
  });

  if (waitingTickets.length < Number(tenant.autoPauseThreshold)) {
    return;
  }

  const error = new Error(
    `This queue is already at its intake threshold of ${tenant.autoPauseThreshold} waiting tickets. Resume or clear space before restoring a missed ticket.`
  );
  error.statusCode = 409;
  error.code = "QUEUE_RESTORE_THRESHOLD_REACHED";
  throw error;
}

async function publishSnapshot(tenant, options = {}) {
  const snapshot = await getQueueSnapshot(tenant, options);
  queueEvents.publish(tenant.slug, snapshot, {
    locationId: options.location?._id || snapshot.location?.id || null
  });
  return snapshot;
}

async function createTicket({
  tenant,
  location,
  userId,
  customerName,
  customerEmail,
  customerPhone,
  notifyByEmail,
  notifyBySms,
  joinChannel,
  notes,
  actorUserId,
  actorRole,
  servicePriorityBand,
  otpChainId,
  allowanceReservationKey
}) {
  const resolvedLocation = await resolveLocation(tenant, { location });
  await assertQueueIntakeOpen(tenant, resolvedLocation);
  const ticket = await db.withTransaction(async (client) => {
    const createdTicket = await createTicketForTenantInTransaction(client, {
      tenant,
      location: resolvedLocation,
      userId,
      customerName,
      customerEmail,
      customerPhone,
      notifyByEmail,
      notifyBySms,
      joinChannel,
      notes,
      servicePriorityBand,
      otpChainId,
      allowanceReservationKey
    });

    const actor = buildQueueEventActor({
      actorUserId,
      actorRole,
      source: joinChannel === "vendor" ? "vendor" : "public"
    });
    await appendQueueEvent(client, createdTicket, "ticket_created", {
      toStatus: createdTicket.status,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        joinChannel: createdTicket.joinChannel
      }
    });

    return createdTicket;
  });

  pushNotificationService.notifyCustomerQueueUpdate({ tenant, ticket, action: "joined" }).catch((error) => {
    console.warn("[push-customer-queue-joined-skipped]", error.message);
  });
  await maybeNotifyUpcomingTickets(tenant, { location: resolvedLocation });
  await maybeAutoPauseQueueDay(tenant, { location: resolvedLocation });
  const snapshot = await publishSnapshot(tenant, {
    lookupCode: ticket.lookupCode,
    location: resolvedLocation
  });

  if (joinChannel !== "vendor" && tenant.notificationSettings?.queueJoin !== false) {
    pushNotificationService.notifyVendorQueueJoin({ tenant, ticket }).catch((error) => {
      console.warn("[web-push-queue-join-skipped]", error.message);
    });
  }
  await notificationService.notifyJourneyLifecycle({ ticket, tenant, slot: "joined", action: "joined" });

  return { ticket, snapshot };
}

async function createTicketForTenantInTransaction(client, {
  tenant,
  location,
  userId,
  customerName,
  customerEmail,
  customerPhone,
  notifyByEmail,
  notifyBySms,
  joinChannel,
  notes,
  servicePriorityBand,
  otpChainId,
  allowanceReservationKey
}) {
  const resolvedLocation = location || (await resolveLocation(tenant));
  let queueDay = null;
  let dateKey;
  let sequence;
  if (resolvedLocation.queueLifecycleMode === "enforced") {
    queueDay = await assertQueueIntakeOpen(tenant, resolvedLocation, { client });
    dateKey = String(queueDay.businessDate).replaceAll("-", "");
    sequence = await queueDayRepository.allocateSequence(queueDay._id, { client });
    if (sequence == null) {
      const error = new Error("Queue intake changed. Refresh and try again.");
      error.statusCode = 409;
      error.code = "QUEUE_STATE_CHANGED";
      throw error;
    }
  } else {
    dateKey = getDateKey(new Date(), resolvedLocation.timezone);
    sequence = await reserveNextSequence(client, tenant._id, resolvedLocation._id, dateKey);
  }

  const ticket = await createTicketRecord(client, {
    tenantId: tenant._id,
    locationId: resolvedLocation._id,
    userId,
    ticketNumber: formatTicketNumber(tenant.queuePrefix, sequence),
    sequence,
    dateKey,
    customerName,
    customerEmail,
    customerPhone,
    notifyByEmail: Boolean(notifyByEmail && customerEmail),
    notifyBySms: Boolean(notifyBySms && customerPhone),
    joinChannel: joinChannel || "online",
    notes,
    servicePriorityBand,
    originalQueueDayId: queueDay?._id,
    currentQueueDayId: queueDay?._id
  });
  const ticketAllowanceInput = {
    tenantId: tenant._id,
    resourceKey: "queueTickets",
    operationKey: `queue-ticket:${ticket._id}:created`,
    subjectType: "queue_ticket",
    subjectId: ticket._id,
    reason: "Queue Ticket created"
  };
  if (allowanceReservationKey) {
    await allowanceService.commitReservation(
      { ...ticketAllowanceInput, reservationKey: allowanceReservationKey },
      { client }
    );
  } else {
    await allowanceService.consumeAllowance({ ...ticketAllowanceInput, units: 1 }, { client });
  }

  const otpRows = otpChainId
    ? (await client.query(
      `SELECT id, resend_ordinal, delivery_channel FROM queue_join_otps
       WHERE chain_id = $1 ORDER BY resend_ordinal`, [otpChainId]
    )).rows
    : [];
  const emailEligible = Boolean(ticket.notifyByEmail && ticket.customerEmail)
    || otpRows.some((otp) => otp.delivery_channel === "email");
  if (emailEligible) {
    const journeyAdmission = await allowanceService.consumeAllowance({
      tenantId: tenant._id,
      resourceKey: "queueEmailJourneys",
      units: 1,
      operationKey: `queue-email-journey:${ticket._id}:created`,
      subjectType: "queue_ticket",
      subjectId: ticket._id,
      reason: "Queue Email Journey created",
      hard: false
    }, { client });
    if (!journeyAdmission.bypassed) {
      const journeyMode = journeyAdmission.consumed ? "metered" : "journey_exhausted";
      await client.query(`UPDATE tickets SET email_journey_mode = $2 WHERE id = $1`, [Number(ticket._id), journeyMode]);
      const journeyResult = await client.query(
        `INSERT INTO queue_email_journeys (tenant_id, ticket_id, mode, otp_chain_id, email_opted_out_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ticket_id) DO UPDATE SET mode = EXCLUDED.mode, otp_chain_id = COALESCE(queue_email_journeys.otp_chain_id, EXCLUDED.otp_chain_id)
         RETURNING id`,
        [Number(tenant._id), Number(ticket._id), journeyMode, otpChainId || null, ticket.notifyByEmail ? null : new Date()]
      );
      if (journeyMode === "metered") {
        await client.query(
          `INSERT INTO queue_email_slots (journey_id, slot_key)
           SELECT $1, slot_key FROM unnest($2::text[]) AS slot_key
           ON CONFLICT (journey_id, slot_key) DO NOTHING`,
          [journeyResult.rows[0].id, ["otp_1","otp_2","otp_3","otp_4","joined","near_turn","called","exception","continuation","final"]]
        );
        for (const otp of otpRows.filter((row) => row.delivery_channel === "email")) {
          await client.query(
            `UPDATE queue_email_slots SET logical_message_key = $3, status = 'sent', sent_at = NOW()
             WHERE journey_id = $1 AND slot_key = $2 AND status = 'unused'`,
            [journeyResult.rows[0].id, `otp_${Number(otp.resend_ordinal) + 1}`, `queue-otp:${otp.id}`]
          );
        }
      }
    }
  }
  if (queueDay) {
    await client.query(
      `INSERT INTO queue_ticket_segments (
         ticket_id, queue_day_id, display_number, sequence, priority_band
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ticket_id, queue_day_id) DO NOTHING`,
      [
        Number(ticket._id),
        Number(queueDay._id),
        ticket.ticketNumber,
        ticket.sequence,
        servicePriorityBand || "normal"
      ]
    );
  }
  return ticket;
}

async function callNextTicket(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const activeQueueDay = await assertQueueDayOpen(tenant, location);
  const dateKey = options.queueDateKey
    || (activeQueueDay?.businessDate
      ? String(activeQueueDay.businessDate).replaceAll("-", "")
      : getDateKey(new Date(), location.timezone));
  const ticket = await db.withTransaction(async (client) => {
    const activeTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      dateKey
    });
    if (activeTicket) {
      const error = new Error("Serve or skip the current ticket before calling the next one.");
      error.statusCode = 400;
      throw error;
    }

    const nextWaitingTicket = (await ticketRepository.listWaitingTickets(tenant._id, {
      client,
      locationId: location?._id,
      dateKey,
      limit: 1
    }))[0];
    if (!nextWaitingTicket) {
      return null;
    }

    queueLifecycle.assertValidTransition(nextWaitingTicket.status, "called");
    const nextTicket = await ticketRepository.callNextWaitingTicket(tenant._id, {
      client,
      locationId: location?._id,
      serviceCounterId: options.serviceCounter?._id,
      dateKey
    });
    if (!nextTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });
    await appendQueueEvent(client, nextTicket, "ticket_called", {
      fromStatus: "waiting",
      toStatus: "called",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        serviceCounterId: options.serviceCounter?._id || null
      }
    });

    return nextTicket;
  });

  if (!ticket) {
    return null;
  }

  if (ticket.notifyByEmail || ticket.notifyBySms) {
    await notificationService.notifyCalled({ ticket, tenant });
  }

  await maybeAutoResumeQueueDay(tenant, { location, queueDateKey: dateKey });
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "called"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-called-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function updateCurrentTicketStatus(tenant, status, options = {}) {
  const location = await resolveLocation(tenant, options);
  queueLifecycle.assertSupportedCurrentTicketResolution(status);
  const activeQueueDay = await assertQueueDayOpen(tenant, location);
  const dateKey = options.queueDateKey
    || (activeQueueDay?.businessDate
      ? String(activeQueueDay.businessDate).replaceAll("-", "")
      : getDateKey(new Date(), location.timezone));
  const ticket = await db.withTransaction(async (client) => {
    const currentTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      dateKey
    });
    if (!currentTicket) {
      return null;
    }

    if (status === "served" && !currentTicket.customerConfirmedAt && currentTicket.joinChannel !== "vendor") {
      const error = new Error("Confirm the called ticket before serving this customer.");
      error.statusCode = 409;
      throw error;
    }

    queueLifecycle.assertValidTransition(currentTicket.status, status);
    const updatedTicket = await ticketRepository.updateCurrentCalledTicketStatus(tenant._id, status, {
      client,
      locationId: location?._id,
      dateKey,
      rejoinDeadlineAt: status === "skipped" ? getRecoveryDeadline() : null
    });
    if (!updatedTicket) {
      return null;
    }

    if (["served", "cancelled"].includes(status)) {
      await bookingRepository.updateBookingByQueueTicketId(
        updatedTicket._id,
        {
          status: status === "served" ? "completed" : "canceled",
          fulfillmentOutcomeReason: status === "served"
            ? "ticket_served"
            : "ticket_cancelled",
          refundEligible: false,
          fulfillmentResolvedAt: new Date()
        },
        { client }
      );
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });
    const eventTypeByStatus = {
      served: "ticket_served",
      skipped: "ticket_skipped",
      cancelled: "ticket_cancelled",
      unserved: "ticket_unserved"
    };
    await appendQueueEvent(client, updatedTicket, eventTypeByStatus[status], {
      fromStatus: currentTicket.status,
      toStatus: status,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {}
    });

    return updatedTicket;
  });

  if (!ticket) {
    return null;
  }

  if (status === "served" || status === "cancelled") {
    await maybeAutoResumeQueueDay(tenant, { location, queueDateKey: dateKey });
  }
  await notificationService.notifyJourneyLifecycle({
    ticket, tenant,
    slot: ["served", "cancelled"].includes(status) ? "final" : "exception",
    action: status
  });
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: status
  }).catch((error) => {
    console.warn("[web-push-customer-queue-status-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function confirmCurrentTicket(tenant, lookupCode, options = {}) {
  const location = await resolveLocation(tenant, options);
  const activeQueueDay = await assertQueueDayOpen(tenant, location);
  const dateKey = options.queueDateKey
    || (activeQueueDay?.businessDate
      ? String(activeQueueDay.businessDate).replaceAll("-", "")
      : getDateKey(new Date(), location.timezone));
  const normalizedLookupCode = String(lookupCode || "").toUpperCase();

  const ticket = await db.withTransaction(async (client) => {
    const currentTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      dateKey
    });
    if (!currentTicket) {
      return null;
    }

    if (String(currentTicket.lookupCode || "").toUpperCase() !== normalizedLookupCode) {
      const error = new Error("Scanned ticket does not match the current called ticket.");
      error.statusCode = 409;
      throw error;
    }

    if (currentTicket.customerConfirmedAt) {
      return currentTicket;
    }

    const confirmedTicket = await ticketRepository.confirmCurrentCalledTicket(
      tenant._id,
      currentTicket._id,
      {
        client,
        locationId: location?._id,
        dateKey
      }
    );
    if (!confirmedTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor_barcode_scan"
    });
    await appendQueueEvent(client, confirmedTicket, "ticket_confirmed", {
      fromStatus: "called",
      toStatus: "called",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: { confirmationMethod: "barcode" }
    });

    return confirmedTicket;
  });

  if (!ticket) {
    return null;
  }

  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "confirmed"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-confirmed-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function cancelTicket(tenant, lookupCode, options = {}) {
  const location = options.location || (await resolveLocation(tenant, options));
  const normalizedLookupCode = lookupCode.toUpperCase();
  const ticket = await db.withTransaction(async (client) => {
    const existingTicket = await ticketRepository.findTicketByTenantAndLookupCode(
      tenant._id,
      normalizedLookupCode,
      { client }
    );
    if (!existingTicket) {
      return null;
    }

    queueLifecycle.assertValidTransition(existingTicket.status, "cancelled");
    const cancelledTicket = await ticketRepository.cancelWaitingTicket(
      tenant._id,
      normalizedLookupCode,
      { client }
    );
    if (!cancelledTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "public"
    });
    await appendQueueEvent(client, cancelledTicket, "ticket_cancelled", {
      fromStatus: existingTicket.status,
      toStatus: "cancelled",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        lookupCode: cancelledTicket.lookupCode,
        reason: existingTicket.status === "pending_carry_over"
          ? "carry_over_declined"
          : "customer_cancelled"
      }
    });

    return cancelledTicket;
  });

  if (!ticket) {
    return null;
  }

  await maybeAutoResumeQueueDay(tenant, { location });
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "cancelled"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-cancel-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function closeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to close the queue.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode === "enforced") {
    await queueDayLifecycleService.closeQueueDay(tenant, location, options);
    return publishSnapshot(tenant, { location });
  }

  const queueDateKey = options.queueDateKey || getDateKey(new Date(), location.timezone);
  const nextQueueDateKey = options.nextQueueDateKey || getDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    location.timezone
  );
  let unservedTicketsForPush = [];
  let carriedTicketsForPush = [];
  await db.withTransaction(async (client) => {
    const existingClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (existingClosure) {
      const error = new Error("This queue day is already closed.");
      error.statusCode = 409;
      throw error;
    }

    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activePause) {
      await queueDayPauseRepository.resumePause(activePause._id, options.actorUserId || null, { client });
    }

    const affectedTickets = await ticketRepository.listTicketsForQueueClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey
    });
    const calledTickets = affectedTickets.filter((ticket) => ticket.status === "called");
    const waitingTickets = affectedTickets.filter((ticket) => ticket.status === "waiting");
    const calledTicketIds = calledTickets.map((ticket) => ticket._id);
    const waitingTicketIds = waitingTickets.map((ticket) => ticket._id);
    const updatedTickets = await ticketRepository.markTicketsUnservedForClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey,
      ticketIds: calledTicketIds
    });
    const carriedTickets = await ticketRepository.carryOverWaitingTickets(tenant._id, {
      client,
      locationId: location._id,
      fromDateKey: queueDateKey,
      toDateKey: nextQueueDateKey,
      ticketIds: waitingTicketIds
    });
    unservedTicketsForPush = updatedTickets;
    carriedTicketsForPush = carriedTickets;
    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    for (const ticket of updatedTickets) {
      const originalTicket = calledTickets.find(
        (candidate) => String(candidate._id) === String(ticket._id)
      );
      await appendQueueEvent(client, ticket, "ticket_unserved", {
        fromStatus: originalTicket?.status || null,
        toStatus: "unserved",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_closed"
        }
      });
    }

    for (const ticket of carriedTickets) {
      const originalTicket = waitingTickets.find(
        (candidate) => String(candidate._id) === String(ticket._id)
      );
      await appendQueueEvent(client, ticket, "ticket_carried_over", {
        fromStatus: originalTicket?.status || "waiting",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          fromQueueDateKey: queueDateKey,
          toQueueDateKey: nextQueueDateKey,
          carryOverCount: ticket.carryOverCount
        }
      });
    }

    await queueDayClosureRepository.createClosure(
      {
        tenantId: tenant._id,
        locationId: location._id,
        queueDateKey,
        nextQueueDateKey,
        closureReason: options.reason || "",
        affectedTicketIds: [...calledTicketIds, ...waitingTicketIds],
        waitingCarriedCount: carriedTickets.length,
        calledUnservedCount: updatedTickets.length,
        closedByUserId: options.actorUserId || null
      },
      { client }
    );

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_closed",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        closureReason: options.reason || "",
        affectedTicketIds: [...calledTicketIds, ...waitingTicketIds],
        waitingCarriedCount: carriedTickets.length,
        calledUnservedCount: updatedTickets.length,
        nextQueueDateKey
      }
    });
  });

  for (const ticket of unservedTicketsForPush) {
    await notificationService.notifyJourneyLifecycle({ ticket, tenant, slot: "exception", action: "unserved" });
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "unserved"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-unserved-skipped]", error.message);
    });
  }

  for (const ticket of carriedTicketsForPush) {
    await notificationService.notifyJourneyLifecycle({ ticket, tenant, slot: "continuation", action: "carried over" });
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "carried_over"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-carried-over-skipped]", error.message);
    });
  }

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "closed"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-closed-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location });
}

async function reopenQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to reopen the queue.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode === "enforced") {
    await queueDayLifecycleService.reopenQueueDay(tenant, location, options);
    return publishSnapshot(tenant, { location });
  }

  const queueDateKey = options.queueDateKey || getDateKey(new Date(), location.timezone);
  let reopenedTicketsForPush = [];
  await db.withTransaction(async (client) => {
    const activeClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (!activeClosure) {
      const error = new Error("There is no closed queue day to reopen.");
      error.statusCode = 404;
      throw error;
    }

    const reopenedUnservedTickets = await ticketRepository.reopenTicketsFromClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey,
      ticketIds: activeClosure.affectedTicketIds
    });
    const restoredCarriedTickets = await ticketRepository.restoreCarriedOverTicketsFromClosure(
      tenant._id,
      {
        client,
        locationId: location._id,
        fromDateKey: activeClosure.nextQueueDateKey,
        toDateKey: queueDateKey,
        ticketIds: activeClosure.affectedTicketIds
      }
    );
    reopenedTicketsForPush = [...reopenedUnservedTickets, ...restoredCarriedTickets];
    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    for (const ticket of reopenedUnservedTickets) {
      await appendQueueEvent(client, ticket, "ticket_requeued", {
        fromStatus: "unserved",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_reopened"
        }
      });
    }

    for (const ticket of restoredCarriedTickets) {
      await appendQueueEvent(client, ticket, "ticket_requeued", {
        fromStatus: "waiting",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_reopened",
          fromQueueDateKey: activeClosure.nextQueueDateKey,
          toQueueDateKey: queueDateKey,
          restoredFromCarryOver: true
        }
      });
    }

    await queueDayClosureRepository.reopenClosure(activeClosure._id, options.actorUserId || null, {
      client
    });

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_reopened",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        affectedTicketIds: activeClosure.affectedTicketIds,
        restoredCarriedTicketIds: restoredCarriedTickets.map((ticket) => ticket._id)
      }
    });
  });

  await maybeNotifyUpcomingTickets(tenant, { location });
  for (const ticket of reopenedTicketsForPush) {
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "requeued"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-reopened-skipped]", error.message);
    });
  }
  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "reopened"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-reopened-skipped]", error.message);
  });
  return publishSnapshot(tenant, { location });
}

async function pauseQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to pause queue intake.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode === "enforced") {
    await queueDayLifecycleService.setQueueIntake(tenant, location, "paused", options);
    return publishSnapshot(tenant, { location });
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  await db.withTransaction(async (client) => {
    const activeClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activeClosure) {
      const error = new Error("This queue day is already closed.");
      error.statusCode = 409;
      throw error;
    }

    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activePause) {
      const error = new Error("This queue is already paused.");
      error.statusCode = 409;
      throw error;
    }

    const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey
    });

    const pause = await queueDayPauseRepository.createPause(
      {
        tenantId: tenant._id,
        locationId: location._id,
        queueDateKey,
        pauseReason: options.reason || "Paused from vendor dashboard",
        pauseMode: options.pauseMode || "manual",
        pausedByUserId: options.actorUserId || null
      },
      { client }
    );

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_paused",
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "vendor",
      metadata: {
        pauseMode: pause.pauseMode,
        pauseReason: pause.pauseReason,
        waitingCount: waitingTickets.length,
        autoPauseThreshold: tenant.autoPauseThreshold || null
      }
    });
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "paused"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-paused-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location, queueDateKey });
}

async function resumeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to resume queue intake.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode === "enforced") {
    await queueDayLifecycleService.setQueueIntake(tenant, location, "accepting", options);
    return publishSnapshot(tenant, { location });
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  await db.withTransaction(async (client) => {
    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (!activePause) {
      const error = new Error("This queue is not paused.");
      error.statusCode = 404;
      throw error;
    }

    await queueDayPauseRepository.resumePause(activePause._id, options.actorUserId || null, {
      client
    });

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_resumed",
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "vendor",
      metadata: {
        pauseMode: activePause.pauseMode,
        pauseReason: activePause.pauseReason
      }
    });
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "resumed"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-resumed-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location, queueDateKey });
}

async function restoreSkippedTicket(tenant, ticketId, options = {}) {
  const location = await resolveLocation(tenant, options);
  const activeQueueDay = await assertQueueIntakeOpen(tenant, location, {
    queueDateKey: options.queueDateKey
  });
  const dateKey = options.queueDateKey
    || (activeQueueDay?.businessDate
      ? String(activeQueueDay.businessDate).replaceAll("-", "")
      : getDateKey(new Date(), location.timezone));

  const ticket = await db.withTransaction(async (client) => {
    await assertQueueIntakeOpen(tenant, location, { client, queueDateKey: dateKey });
    await assertRestoreCapacityAvailable(tenant, location, { client, queueDateKey: dateKey });

    const targetTicket = await ticketRepository.findTicketById(ticketId, { client });

    if (!targetTicket || String(targetTicket.tenantId) !== String(tenant._id)) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (
      options.lookupCode &&
      String(targetTicket.lookupCode || "").toUpperCase() !==
        String(options.lookupCode || "").toUpperCase()
    ) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (targetTicket.locationId && String(targetTicket.locationId) !== String(location._id)) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (targetTicket.status !== "skipped") {
      const error = new Error("Only skipped tickets can be restored.");
      error.statusCode = 409;
      throw error;
    }

    if (!targetTicket.skippedAt) {
      const error = new Error("This skipped ticket is missing recovery metadata.");
      error.statusCode = 409;
      throw error;
    }

    const recoveryDeadline = targetTicket.rejoinDeadlineAt
      ? new Date(targetTicket.rejoinDeadlineAt)
      : null;
    const servicePriorityBand =
      recoveryDeadline && recoveryDeadline.getTime() > Date.now() ? "recovery" : "normal";

    queueLifecycle.assertValidTransition(targetTicket.status, "waiting");
    const restoredTicket = await ticketRepository.restoreSkippedTicket(tenant._id, ticketId, {
      client,
      locationId: location._id,
      servicePriorityBand
    });

    if (!restoredTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    await appendQueueEvent(client, restoredTicket, "ticket_requeued", {
      fromStatus: "skipped",
      toStatus: "waiting",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        reason: servicePriorityBand === "recovery" ? "missed_ticket_recovery" : "missed_ticket_rejoin_expired",
        servicePriorityBand,
        queueDateKey: dateKey
      }
    });

    return restoredTicket;
  });

  if (!ticket) {
    return null;
  }

  await maybeNotifyUpcomingTickets(tenant, { location });
  await maybeAutoPauseQueueDay(tenant, { location, queueDateKey: dateKey });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "requeued"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-requeued-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function openQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to open the queue.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode !== "enforced") {
    const error = new Error("Manual Queue Day opening is not enabled for this location yet.");
    error.statusCode = 409;
    error.code = "QUEUE_LIFECYCLE_NOT_ENFORCED";
    throw error;
  }
  await queueDayLifecycleService.openQueueDay(tenant, location, options);
  return publishSnapshot(tenant, { location });
}

async function extendQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to extend the queue.");
    error.statusCode = 400;
    throw error;
  }
  if (location.queueLifecycleMode !== "enforced") {
    const error = new Error("Queue Day extensions are not enabled for this location yet.");
    error.statusCode = 409;
    error.code = "QUEUE_LIFECYCLE_NOT_ENFORCED";
    throw error;
  }
  await queueDayLifecycleService.extendQueueDay(tenant, location, options);
  return publishSnapshot(tenant, { location });
}

module.exports = {
  resolveLocation,
  createTicket,
  createTicketForTenantInTransaction,
  assertQueueIntakeOpen,
  getQueueSnapshot,
  callNextTicket,
  confirmCurrentTicket,
  updateCurrentTicketStatus,
  cancelTicket,
  closeQueueDay,
  openQueueDay,
  extendQueueDay,
  reopenQueueDay,
  pauseQueueDay,
  resumeQueueDay,
  restoreSkippedTicket,
  publishSnapshot,
  maybeNotifyUpcomingTickets,
  maybeAutoPauseQueueDay
};
