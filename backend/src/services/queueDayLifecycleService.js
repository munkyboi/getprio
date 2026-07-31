const db = require("../config/db");
const queueDays = require("../repositories/queueDays");
const queueEvents = require("../repositories/queueEvents");
const outbox = require("../repositories/queueNotificationOutbox");
const storeLocations = require("../repositories/storeLocations");
const { formatTicketNumber } = require("./queueHelpers");
const {
  getWarningPhase,
  resolveEffectiveStoreInterval
} = require("./queueDayTime");

const CARRY_OVER_DAYS = 7;

function stateError(message, code, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function reconciliationUnavailable(error) {
  if (String(error?.code || "").startsWith("QUEUE_")) {
    return error;
  }
  const unavailable = stateError(
    "Queue state could not be reconciled safely. Please retry.",
    "QUEUE_RECONCILIATION_UNAVAILABLE",
    503
  );
  unavailable.cause = error;
  return unavailable;
}

function queueDateKey(queueDay) {
  return String(queueDay.businessDate).replace(/-/g, "");
}

function eventState(queueDay) {
  if (!queueDay) {
    return null;
  }
  return {
    state: queueDay.state,
    intakeMode: queueDay.intakeMode,
    currentClosesAt: queueDay.currentClosesAt,
    version: queueDay.version,
    deadlineVersion: queueDay.deadlineVersion
  };
}

async function recordLifecycleEvent(client, queueDay, eventType, options = {}) {
  return queueEvents.createLifecycleEvent({
    ticketId: options.ticketId,
    tenantId: queueDay.tenantId,
    locationId: queueDay.locationId,
    queueDayId: queueDay._id,
    queueDateKey: queueDateKey(queueDay),
    eventType,
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    actorUserId: options.actorUserId,
    actorRole: options.actorRole,
    source: options.source || "system",
    eventKey: options.eventKey,
    correlationKey: options.correlationKey,
    reasonCode: options.reasonCode,
    deadlineVersion: options.deadlineVersion ?? queueDay.deadlineVersion,
    previousState: options.previousState,
    nextState: options.nextState,
    staffNote: options.note,
    metadata: options.metadata
  }, { client });
}

async function enqueueStaffIntent(client, event, queueDay, templateName, options = {}) {
  if (!event) {
    return;
  }
  await outbox.enqueue({
    idempotencyKey: `${event.eventKey}:staff:web_push`,
    queueEventId: event._id,
    queueDayId: queueDay._id,
    tenantId: queueDay.tenantId,
    recipientKey: `tenant:${queueDay.tenantId}:location:${queueDay.locationId}:queue-operators`,
    channel: "web_push",
    templateName,
    payload: {
      queueDayId: queueDay._id,
      locationId: queueDay.locationId,
      businessDate: queueDay.businessDate,
      currentClosesAt: queueDay.currentClosesAt,
      deadlineVersion: queueDay.deadlineVersion,
      ...options.payload
    },
    aggregateVersion: queueDay.version,
    deadlineVersion: queueDay.deadlineVersion,
    expiresAt: options.expiresAt || null
  }, { client });
}

async function enqueueAdminEmailIntent(client, event, queueDay, templateName, options = {}) {
  if (!event) {
    return;
  }
  await outbox.enqueue({
    idempotencyKey: `${event.eventKey}:staff-admins:email`,
    queueEventId: event._id,
    queueDayId: queueDay._id,
    tenantId: queueDay.tenantId,
    recipientKey: `tenant:${queueDay.tenantId}:location:${queueDay.locationId}:queue-admins`,
    channel: "email",
    templateName,
    payload: {
      queueDayId: queueDay._id,
      locationId: queueDay.locationId,
      businessDate: queueDay.businessDate,
      currentClosesAt: queueDay.currentClosesAt,
      deadlineVersion: queueDay.deadlineVersion,
      ...options.payload
    },
    aggregateVersion: queueDay.version,
    deadlineVersion: queueDay.deadlineVersion
  }, { client });
}

async function recordReconciliationFailure(queueDayId, error) {
  return db.withTransaction(async (client) => {
    const queueDay = await queueDays.findById(queueDayId, { client, forUpdate: true });
    if (!queueDay || queueDay.state !== "open") {
      return null;
    }
    const event = await recordLifecycleEvent(
      client,
      queueDay,
      "queue_day_reconciliation_failed",
      {
        source: "scheduled_reconciliation",
        reasonCode: "reconciliation_error",
        eventKey: `queue-day:${queueDay._id}:reconciliation-failed:${queueDay.reconciliationAttemptCount}`,
        previousState: eventState(queueDay),
        nextState: eventState(queueDay),
        metadata: {
          attemptCount: queueDay.reconciliationAttemptCount,
          error: String(error?.message || error || "Reconciliation failed").slice(0, 500)
        }
      }
    );
    await enqueueStaffIntent(client, event, queueDay, "queue_reconciliation_failed");
    await enqueueAdminEmailIntent(client, event, queueDay, "queue_reconciliation_failed");
    return event;
  });
}

async function activatePendingCarryOvers(client, tenant, location, queueDay) {
  const pending = await client.query(
    `SELECT id
     FROM tickets
     WHERE tenant_id = $1
       AND location_id = $2
       AND status = 'pending_carry_over'
       AND carry_over_consumed = FALSE
       AND carry_over_expires_at > NOW()
     ORDER BY pending_carry_over_since, id
     FOR UPDATE`,
    [Number(tenant._id), Number(location._id)]
  );

  for (const row of pending.rows) {
    const sequence = await queueDays.allocateSequence(queueDay._id, { client });
    if (sequence == null) {
      throw stateError("Queue intake changed while carry-over tickets were activating.", "QUEUE_STATE_CHANGED");
    }
    const displayNumber = formatTicketNumber(tenant.queuePrefix || "P", sequence);
    await client.query(
      `UPDATE tickets
       SET status = 'waiting',
           status_reason = 'carry_over_activated',
           current_queue_day_id = $2,
           ticket_number = $3,
           sequence = $4,
           date_key = $5,
           queue_date_key = $5,
           carried_over_at = NOW(),
           carry_over_count = carry_over_count + 1,
           carry_over_consumed = TRUE,
           service_priority_band = 'carry_over',
           updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), Number(queueDay._id), displayNumber, sequence, queueDateKey(queueDay)]
    );
    await client.query(
      `INSERT INTO queue_ticket_segments (
         ticket_id, queue_day_id, display_number, sequence, priority_band
       )
       VALUES ($1, $2, $3, $4, 'carry_over')
       ON CONFLICT (ticket_id, queue_day_id) DO NOTHING`,
      [Number(row.id), Number(queueDay._id), displayNumber, sequence]
    );
    await recordLifecycleEvent(client, queueDay, "ticket_carry_over_activated", {
      ticketId: row.id,
      fromStatus: "pending_carry_over",
      toStatus: "waiting",
      source: "system",
      reasonCode: "carry_over_activated",
      eventKey: `ticket:${row.id}:queue-day:${queueDay._id}:carry-over-activated`
    });
  }
  return pending.rows.length;
}

async function openQueueDay(tenant, location, options = {}) {
  const now = options.now || new Date();
  const hours = await storeLocations.listHoursByLocationId(location._id);
  const interval = resolveEffectiveStoreInterval({
    now,
    timezone: location.timezone,
    hours
  });
  if (!interval) {
    throw stateError(
      "The queue can only be opened during this location's effective store hours.",
      "QUEUE_OUTSIDE_EFFECTIVE_HOURS"
    );
  }

  return db.withTransaction(async (client) => {
    const previousOpen = await queueDays.findLatestByLocation(
      tenant._id,
      location._id,
      { client, state: "open", forUpdate: true }
    );
    if (previousOpen && previousOpen.businessDate !== interval.businessDate) {
      if (new Date(previousOpen.currentClosesAt) > now) {
        throw stateError(
          "Another Queue Day is already open for this location.",
          "QUEUE_STATE_CHANGED"
        );
      }
      await closeLockedQueueDay(client, tenant, location, previousOpen, {
        source: "request_reconciliation",
        reason: "effective_hours_ended"
      });
    }
    if (previousOpen?.businessDate === interval.businessDate) {
      return {
        queueDay: previousOpen,
        activatedCarryOverCount: 0,
        idempotent: true
      };
    }
    const existing = await queueDays.lockOrCreate({
      tenantId: tenant._id,
      locationId: location._id,
      businessDate: interval.businessDate
    }, { client });
    if (existing.state === "open") {
      return { queueDay: existing, activatedCarryOverCount: 0, idempotent: true };
    }
    if (existing.state === "closed") {
      throw stateError("This Queue Day is closed.", "QUEUE_DAY_CLOSED");
    }

    const opened = await queueDays.transitionOpen(existing._id, {
      timezone: interval.timezone,
      effectiveOpensAt: interval.opensAt,
      effectiveClosesAt: interval.closesAt,
      actorUserId: options.actorUserId,
      expectedVersion: options.expectedVersion
    }, { client });
    if (!opened) {
      throw stateError("Queue Day state changed. Refresh and try again.", "QUEUE_STATE_CHANGED");
    }
    const event = await recordLifecycleEvent(client, opened, "queue_day_opened", {
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor",
      reasonCode: "manual_open",
      eventKey: `queue-day:${opened._id}:version:${opened.version}:opened`,
      previousState: eventState(existing),
      nextState: eventState(opened),
      note: options.note
    });
    await enqueueStaffIntent(client, event, opened, "queue_opened");
    const activatedCarryOverCount = await activatePendingCarryOvers(client, tenant, location, opened);
    return { queueDay: opened, activatedCarryOverCount, idempotent: false };
  });
}

async function getAuthoritativeQueueDay(tenantId, locationId, options = {}) {
  if (options.businessDate) {
    return queueDays.findByScope(tenantId, locationId, options.businessDate, options);
  }
  return queueDays.findLatestByLocation(tenantId, locationId, options);
}

async function getQueueDayForSnapshot(tenant, location, options = {}) {
  const now = options.now || new Date();
  const openQueueDay = await queueDays.findLatestByLocation(
    tenant._id,
    location._id,
    { state: "open" }
  );
  if (openQueueDay) {
    return {
      queueDay: openQueueDay,
      withinEffectiveHours: new Date(openQueueDay.currentClosesAt) > now,
      businessDate: openQueueDay.businessDate
    };
  }
  const hours = await storeLocations.listHoursByLocationId(location._id);
  const interval = resolveEffectiveStoreInterval({
    now,
    timezone: location.timezone,
    hours
  });
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: location.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const businessDate = interval?.businessDate || localDate;
  const queueDay = await queueDays.findByScope(
    tenant._id,
    location._id,
    businessDate
  );
  return {
    queueDay,
    withinEffectiveHours: Boolean(interval),
    businessDate
  };
}

async function recordShadowComparison(tenant, location, legacyQueueDay, options = {}) {
  const now = options.now || new Date();
  const queueDateKey = legacyQueueDay?.queueDateKey
    || new Intl.DateTimeFormat("en-CA", {
      timeZone: location.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now).replace(/-/g, "");
  const businessDate = `${queueDateKey.slice(0, 4)}-${queueDateKey.slice(4, 6)}-${queueDateKey.slice(6, 8)}`;
  const queueDay = await queueDays.findByScope(tenant._id, location._id, businessDate);
  const legacyState = legacyQueueDay?.isClosed ? "closed" : "open";
  const legacyIntakeMode = legacyQueueDay?.isPaused ? "paused" : "accepting";
  const shadowState = queueDay?.state || "unopened";
  const shadowIntakeMode = queueDay?.intakeMode || null;
  if (legacyState === shadowState && (
    shadowState !== "open" || legacyIntakeMode === shadowIntakeMode
  )) {
    return null;
  }
  return queueEvents.createLifecycleEvent({
    tenantId: tenant._id,
    locationId: location._id,
    queueDayId: queueDay?._id,
    queueDateKey,
    eventType: "queue_lifecycle_shadow_difference",
    source: "shadow",
    reasonCode: "legacy_authority_difference",
    eventKey: [
      "shadow",
      tenant._id,
      location._id,
      queueDateKey,
      queueDay?.version || 0,
      legacyState,
      legacyIntakeMode
    ].join(":"),
    previousState: {
      state: legacyState,
      intakeMode: legacyState === "open" ? legacyIntakeMode : null
    },
    nextState: eventState(queueDay)
  });
}

async function assertIntakeOpenWithClient(client, tenant, location, options = {}) {
    const queueDay = await getAuthoritativeQueueDay(tenant._id, location._id, {
      client,
      state: "open",
      forUpdate: true
    });
    if (!queueDay) {
      throw stateError("The queue has not been opened by staff.", "QUEUE_DAY_UNOPENED");
    }
    if (new Date(queueDay.currentClosesAt) <= (options.now || new Date())) {
      if (options.reconcileOverdue) {
        await closeLockedQueueDay(client, tenant, location, queueDay, {
          source: "request_reconciliation",
          reason: "effective_hours_ended"
        });
        return { overdue: true };
      }
      throw stateError("The Queue Day has closed.", "QUEUE_DAY_OVERDUE");
    }
    if (queueDay.intakeMode !== "accepting") {
      throw stateError("Queue intake is paused.", "QUEUE_INTAKE_PAUSED");
    }
    return queueDay;
}

async function assertIntakeOpen(tenant, location, options = {}) {
  if (options.client) {
    return assertIntakeOpenWithClient(options.client, tenant, location, options);
  }
  let result;
  try {
    result = await db.withTransaction((client) =>
      assertIntakeOpenWithClient(client, tenant, location, {
        ...options,
        reconcileOverdue: true
      })
    );
  } catch (error) {
    throw reconciliationUnavailable(error);
  }
  if (result?.overdue) {
    throw stateError("The Queue Day has closed.", "QUEUE_DAY_OVERDUE");
  }
  return result;
}

async function closeTicketOutcomes(client, queueDay) {
  const result = await client.query(
    `SELECT ticket.id, ticket.status, ticket.carry_over_consumed,
            ticket.notify_by_email, ticket.user_id,
            segment.priority_band
     FROM tickets AS ticket
     LEFT JOIN queue_ticket_segments AS segment
       ON segment.ticket_id = ticket.id
      AND segment.queue_day_id = $1
     WHERE ticket.current_queue_day_id = $1
       AND ticket.status IN ('waiting', 'called', 'skipped')
     ORDER BY ticket.id
     FOR UPDATE OF ticket`,
    [Number(queueDay._id)]
  );
  const counts = { pendingCarryOver: 0, expired: 0, unserved: 0, skipped: 0 };

  for (const ticket of result.rows) {
    let nextStatus = ticket.status;
    let reasonCode;
    let bookingStatus;
    let refundEligible = false;
    if (ticket.status === "called") {
      nextStatus = "unserved";
      reasonCode = "queue_closed_while_called";
      bookingStatus = "unfulfilled";
      refundEligible = true;
      counts.unserved += 1;
    } else if (ticket.status === "skipped") {
      reasonCode = "queue_closed_after_skip";
      bookingStatus = "missed";
      counts.skipped += 1;
    } else if (ticket.carry_over_consumed || ticket.priority_band === "carry_over") {
      nextStatus = "expired";
      reasonCode = "carry_over_day_closed";
      bookingStatus = "unfulfilled";
      refundEligible = true;
      counts.expired += 1;
    } else {
      nextStatus = "pending_carry_over";
      reasonCode = "queue_closed_carry_over_offered";
      counts.pendingCarryOver += 1;
    }

    await client.query(
      `UPDATE tickets
       SET status = $2,
           status_reason = $3,
           current_queue_day_id = NULL,
           pending_carry_over_since = CASE WHEN $2 = 'pending_carry_over' THEN NOW() ELSE pending_carry_over_since END,
           carry_over_expires_at = CASE
             WHEN $2 = 'pending_carry_over' THEN NOW() + ($4 * INTERVAL '1 day')
             ELSE carry_over_expires_at
           END,
           unserved_at = CASE WHEN $2 = 'unserved' THEN NOW() ELSE unserved_at END,
           terminal_at = CASE WHEN $2 IN ('unserved', 'expired') OR status = 'skipped' THEN NOW() ELSE terminal_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [Number(ticket.id), nextStatus, reasonCode, CARRY_OVER_DAYS]
    );
    await client.query(
      `UPDATE queue_ticket_segments
       SET ended_at = COALESCE(ended_at, NOW()),
           segment_outcome = $3,
           outcome_reason = $4
       WHERE ticket_id = $1 AND queue_day_id = $2`,
      [Number(ticket.id), Number(queueDay._id), nextStatus, reasonCode]
    );
    if (bookingStatus) {
      await client.query(
        `UPDATE bookings
         SET status = $2,
             fulfillment_outcome_reason = $3,
             refund_eligible = $4,
             fulfillment_resolved_at = NOW(),
             updated_at = NOW()
         WHERE queue_ticket_id = $1
           AND status NOT IN ('completed', 'canceled', 'reviewed', 'disputed')`,
        [Number(ticket.id), bookingStatus, reasonCode, refundEligible]
      );
    }
    const event = await recordLifecycleEvent(client, queueDay, `ticket_${nextStatus}`, {
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus: nextStatus,
      reasonCode,
      source: "system",
      eventKey: nextStatus === "pending_carry_over"
        ? `ticket:${ticket.id}:queue-day:${queueDay._id}:pending-carry-over`
        : `ticket:${ticket.id}:queue-day:${queueDay._id}:${nextStatus}`
    });
    if (event && nextStatus !== "skipped") {
      await outbox.enqueue({
        idempotencyKey: `${event.eventKey}:customer:web_push`,
        queueEventId: event._id,
        queueDayId: queueDay._id,
        ticketId: ticket.id,
        tenantId: queueDay.tenantId,
        recipientKey: ticket.user_id ? `user:${ticket.user_id}` : `ticket:${ticket.id}`,
        channel: "web_push",
        templateName: `ticket_${nextStatus}`,
        payload: { ticketId: String(ticket.id), reasonCode },
        aggregateVersion: queueDay.version,
        deadlineVersion: queueDay.deadlineVersion
      }, { client });
      if (ticket.notify_by_email) {
        await outbox.enqueue({
          idempotencyKey: `${event.eventKey}:customer:email`,
          queueEventId: event._id,
          queueDayId: queueDay._id,
          ticketId: ticket.id,
          tenantId: queueDay.tenantId,
          recipientKey: `ticket:${ticket.id}:email`,
          channel: "email",
          templateName: `ticket_${nextStatus}`,
          payload: { ticketId: String(ticket.id), reasonCode },
          aggregateVersion: queueDay.version,
          deadlineVersion: queueDay.deadlineVersion
        }, { client });
      }
    }
  }
  return counts;
}

async function closeLockedQueueDay(client, tenant, location, queueDay, options = {}) {
  if (queueDay.state === "closed") {
    return { queueDay, outcomes: null, idempotent: true };
  }
  const outcomes = await closeTicketOutcomes(client, queueDay);
  const closed = await queueDays.close(queueDay._id, {
    actorUserId: options.actorUserId,
    reason: options.reason || "effective_hours_ended",
    source: options.closeSource || options.source || "system",
    note: options.note,
    expectedVersion: options.expectedVersion
  }, { client });
  if (!closed) {
    throw stateError("Queue Day state changed. Refresh and try again.", "QUEUE_STATE_CHANGED");
  }
  await outbox.obsoleteWarningsForClosedQueueDay(closed._id, { client });
  const event = await recordLifecycleEvent(client, closed, "queue_day_closed", {
    actorUserId: options.actorUserId,
    actorRole: options.actorRole,
    source: options.source || "system",
    reasonCode: options.reason || "effective_hours_ended",
    eventKey: `queue-day:${closed._id}:version:${closed.version}:closed`,
    previousState: eventState(queueDay),
    nextState: eventState(closed),
    note: options.note,
    metadata: { outcomes }
  });
  await enqueueStaffIntent(client, event, closed, "queue_closed", { payload: { outcomes } });
  return { queueDay: closed, outcomes, idempotent: false };
}

async function closeQueueDay(tenant, location, options = {}) {
  return db.withTransaction(async (client) => {
    const queueDay = await queueDays.findLatestByLocation(tenant._id, location._id, {
      client,
      state: "open",
      forUpdate: true
    });
    if (!queueDay) {
      const latest = await queueDays.findLatestByLocation(tenant._id, location._id, {
        client,
        forUpdate: true
      });
      if (latest?.state === "closed") {
        return { queueDay: latest, outcomes: null, idempotent: true };
      }
      throw stateError("The queue has not been opened.", "QUEUE_DAY_UNOPENED");
    }
    return closeLockedQueueDay(client, tenant, location, queueDay, {
      ...options,
      source: options.source || "vendor",
      closeSource: "manual",
      reason: options.reason || "manual_close"
    });
  });
}

async function extendQueueDay(tenant, location, options = {}) {
  if (!String(options.reason || "").trim()) {
    throw stateError("A reason is required for a Queue Day extension.", "QUEUE_EXTENSION_REASON_REQUIRED", 400);
  }
  return db.withTransaction(async (client) => {
    const current = await queueDays.findLatestByLocation(tenant._id, location._id, {
      client,
      state: "open",
      forUpdate: true
    });
    if (!current) {
      throw stateError("There is no open Queue Day to extend.", "QUEUE_DAY_UNOPENED");
    }
    const extended = await queueDays.extendDeadline(current._id, {
      expectedVersion: options.expectedVersion
    }, { client });
    if (!extended) {
      throw stateError(
        "The Queue Day can only be extended during its 15-minute closing warning.",
        "QUEUE_STATE_CHANGED"
      );
    }
    await client.query(
      `INSERT INTO queue_day_extensions (
         queue_day_id, previous_closes_at, new_closes_at, deadline_version,
         actor_user_id, actor_role, reason_code, note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (queue_day_id, deadline_version) DO NOTHING`,
      [
        Number(extended._id),
        current.currentClosesAt,
        extended.currentClosesAt,
        extended.deadlineVersion,
        options.actorUserId ? Number(options.actorUserId) : null,
        options.actorRole || null,
        String(options.reason).trim(),
        options.note || null
      ]
    );
    await outbox.obsoleteStaleWarnings(extended._id, extended.deadlineVersion, { client });
    const event = await recordLifecycleEvent(client, extended, "queue_day_extended", {
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor",
      reasonCode: String(options.reason).trim(),
      eventKey: `queue-day:${extended._id}:deadline:${extended.deadlineVersion}:extended`,
      previousState: eventState(current),
      nextState: eventState(extended),
      note: options.note
    });
    await enqueueStaffIntent(client, event, extended, "queue_extended");
    return { queueDay: extended, idempotent: false };
  });
}

async function setQueueIntake(tenant, location, intakeMode, options = {}) {
  const result = await db.withTransaction(async (client) => {
    const current = await queueDays.findLatestByLocation(tenant._id, location._id, {
      client,
      state: "open",
      forUpdate: true
    });
    if (!current) {
      throw stateError("The queue has not been opened.", "QUEUE_DAY_UNOPENED");
    }
    if (new Date(current.currentClosesAt) <= new Date()) {
      await closeLockedQueueDay(client, tenant, location, current, {
        source: "request_reconciliation",
        reason: "effective_hours_ended"
      });
      return { overdue: true };
    }
    if (current.intakeMode === intakeMode) {
      return { queueDay: current, idempotent: true };
    }
    const updated = await queueDays.setIntakeMode(
      current._id,
      intakeMode,
      options.expectedVersion,
      { client }
    );
    if (!updated) {
      throw stateError("Queue Day state changed. Refresh and try again.", "QUEUE_STATE_CHANGED");
    }
    await recordLifecycleEvent(client, updated, intakeMode === "paused" ? "queue_day_paused" : "queue_day_resumed", {
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor",
      reasonCode: options.reason || (intakeMode === "paused" ? "manual_pause" : "manual_resume"),
      eventKey: `queue-day:${updated._id}:version:${updated.version}:${intakeMode}`,
      previousState: eventState(current),
      nextState: eventState(updated),
      note: options.note
    });
    return { queueDay: updated, idempotent: false };
  });
  if (result?.overdue) {
    throw stateError("The Queue Day has closed.", "QUEUE_DAY_OVERDUE");
  }
  return result;
}

async function reopenQueueDay(tenant, location, options = {}) {
  return db.withTransaction(async (client) => {
    const current = await queueDays.findLatestByLocation(tenant._id, location._id, {
      client,
      forUpdate: true
    });
    if (!current || current.state !== "closed") {
      throw stateError("There is no closed Queue Day to reopen.", "QUEUE_DAY_UNOPENED");
    }
    const reopened = await queueDays.reopen(current._id, {
      actorUserId: options.actorUserId,
      reason: options.reason || "manual_reopen",
      expectedVersion: options.expectedVersion
    }, { client });
    if (!reopened) {
      throw stateError(
        "Only an early manually closed Queue Day may be reopened during its effective hours.",
        "QUEUE_STATE_CHANGED"
      );
    }
    const event = await recordLifecycleEvent(client, reopened, "queue_day_reopened", {
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor",
      reasonCode: options.reason || "manual_reopen",
      eventKey: `queue-day:${reopened._id}:version:${reopened.version}:reopened`,
      previousState: eventState(current),
      nextState: eventState(reopened),
      note: options.note
    });
    await enqueueStaffIntent(client, event, reopened, "queue_reopened");
    return { queueDay: reopened, idempotent: false };
  });
}

async function expirePendingCarryOvers(limit = 100) {
  return db.withTransaction(async (client) => {
    const due = await client.query(
      `SELECT id, tenant_id, user_id, notify_by_email, carry_over_expires_at
       FROM tickets
       WHERE status = 'pending_carry_over'
         AND carry_over_expires_at <= NOW()
       ORDER BY carry_over_expires_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(Number(limit) || 100, 500))]
    );
    for (const ticket of due.rows) {
      await client.query(
        `UPDATE tickets
         SET status = 'expired', status_reason = 'carry_over_window_expired',
             terminal_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'pending_carry_over'`,
        [Number(ticket.id)]
      );
      await client.query(
        `UPDATE bookings
         SET status = 'unfulfilled',
             fulfillment_outcome_reason = 'carry_over_window_expired',
             refund_eligible = TRUE,
             fulfillment_resolved_at = NOW(),
             updated_at = NOW()
         WHERE queue_ticket_id = $1
           AND status NOT IN ('completed', 'canceled', 'reviewed', 'disputed')`,
        [Number(ticket.id)]
      );
      const event = await queueEvents.createLifecycleEvent({
        ticketId: ticket.id,
        tenantId: ticket.tenant_id,
        queueDateKey: "pending",
        eventType: "ticket_expired",
        fromStatus: "pending_carry_over",
        toStatus: "expired",
        source: "system",
        reasonCode: "carry_over_window_expired",
        eventKey: `ticket:${ticket.id}:pending-expiry:${new Date(ticket.carry_over_expires_at).toISOString()}`
      }, { client });
      if (event) {
        await outbox.enqueue({
          idempotencyKey: `${event.eventKey}:customer:web_push`,
          queueEventId: event._id,
          ticketId: ticket.id,
          tenantId: ticket.tenant_id,
          recipientKey: ticket.user_id ? `user:${ticket.user_id}` : `ticket:${ticket.id}`,
          channel: "web_push",
          templateName: "ticket_expired",
          payload: { ticketId: String(ticket.id), reasonCode: "carry_over_window_expired" }
        }, { client });
        if (ticket.notify_by_email) {
          await outbox.enqueue({
            idempotencyKey: `${event.eventKey}:customer:email`,
            queueEventId: event._id,
            ticketId: ticket.id,
            tenantId: ticket.tenant_id,
            recipientKey: `ticket:${ticket.id}:email`,
            channel: "email",
            templateName: "ticket_expired",
            payload: {
              ticketId: String(ticket.id),
              reasonCode: "carry_over_window_expired"
            }
          }, { client });
        }
      }
    }
    return due.rows.length;
  });
}

async function emitDueWarnings() {
  const candidates = await queueDays.listWarningCandidates(200);
  let emitted = 0;
  for (const candidate of candidates) {
    await db.withTransaction(async (client) => {
      const locked = await queueDays.findByScope(
        candidate.tenantId,
        candidate.locationId,
        candidate.businessDate,
        { client, forUpdate: true }
      );
      if (!locked || locked.state !== "open") {
        return;
      }
      const remainingMs = new Date(locked.currentClosesAt).getTime() - Date.now();
      const warningMinutes = remainingMs <= 5 * 60_000 ? 5 : 15;
      const eventKey = `queue-day:${locked._id}:deadline:${locked.deadlineVersion}:warning:${warningMinutes}m`;
      const event = await recordLifecycleEvent(client, locked, "queue_day_closing_warning", {
        source: "system",
        reasonCode: `closing_in_${warningMinutes}_minutes`,
        eventKey,
        deadlineVersion: locked.deadlineVersion,
        metadata: { warningMinutes }
      });
      if (event) {
        emitted += 1;
        await enqueueStaffIntent(
          client,
          event,
          locked,
          warningMinutes === 5 ? "queue_closing_5m" : "queue_closing_15m",
          { expiresAt: locked.currentClosesAt, payload: { warningMinutes } }
        );
      }
    });
  }
  return emitted;
}

async function reconcileDueQueueDays(limit = 50) {
  const candidateIds = await queueDays.listDueCandidateIds(limit);
  let reconciledCount = 0;
  for (const candidateId of candidateIds) {
    try {
      const didReconcile = await db.withTransaction(async (client) => {
        const queueDay = await queueDays.findById(candidateId, { client, forUpdate: true });
        if (
          !queueDay
          || queueDay.state !== "open"
          || new Date(queueDay.currentClosesAt) > new Date()
        ) {
          return false;
        }
        await closeLockedQueueDay(
          client,
          { _id: queueDay.tenantId },
          { _id: queueDay.locationId },
          queueDay,
          {
            source: "scheduled_reconciliation",
            reason: "effective_hours_ended"
          }
        );
        return true;
      });
      if (didReconcile) {
        reconciledCount += 1;
      }
    } catch (error) {
      await queueDays.recordReconciliationError(candidateId, error.message);
      await recordReconciliationFailure(candidateId, error);
    }
  }
  return reconciledCount;
}

async function reconcileQueueDayById(queueDayId) {
  return db.withTransaction(async (client) => {
    const queueDay = await queueDays.findById(queueDayId, { client, forUpdate: true });
    if (!queueDay) {
      throw stateError("Queue Day not found.", "QUEUE_DAY_NOT_FOUND", 404);
    }
    if (queueDay.state === "closed") {
      return { queueDay, outcomes: null, idempotent: true };
    }
    if (queueDay.state !== "open" || new Date(queueDay.currentClosesAt) > new Date()) {
      throw stateError("Queue Day is not due for reconciliation.", "QUEUE_STATE_CHANGED");
    }
    return closeLockedQueueDay(
      client,
      { _id: queueDay.tenantId },
      { _id: queueDay.locationId },
      queueDay,
      { source: "platform_reconciliation_retry", reason: "effective_hours_ended" }
    );
  });
}

function formatQueueDayStatus(queueDay, location, now = new Date(), options = {}) {
  const phase = getWarningPhase(queueDay, now);
  const state = queueDay?.state || (options.withinEffectiveHours === false ? "closed" : "unopened");
  const intakeMode = state === "open" ? queueDay.intakeMode : null;
  let availabilityReason = queueDay
    ? (state === "closed" ? "closed" : "not_opened")
    : (options.withinEffectiveHours === false ? "outside_store_hours" : "not_opened");
  if (state === "open") {
    availabilityReason = intakeMode === "paused"
      ? "paused"
      : phase === "warning"
        ? "closing_soon"
        : phase === "extended"
          ? "extended"
          : phase === "overdue"
            ? "reconciling"
            : "accepting";
  }
  const businessDate = queueDay?.businessDate || options.businessDate
    || new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone }).format(now);
  return {
    id: queueDay?._id || null,
    businessDate,
    state,
    availabilityReason,
    intakeMode,
    autoClosePhase: phase,
    timezone: queueDay?.timezone || location.timezone,
    effectiveOpensAt: queueDay?.effectiveOpensAt || null,
    effectiveClosesAt: queueDay?.effectiveClosesAt || null,
    currentClosesAt: queueDay?.currentClosesAt || null,
    warningStartsAt: queueDay?.currentClosesAt
      ? new Date(new Date(queueDay.currentClosesAt).getTime() - 15 * 60_000).toISOString()
      : null,
    finalWarningStartsAt: queueDay?.currentClosesAt
      ? new Date(new Date(queueDay.currentClosesAt).getTime() - 5 * 60_000).toISOString()
      : null,
    serverNow: now.toISOString(),
    version: queueDay?.version || null,
    deadlineVersion: queueDay?.deadlineVersion || null,
    closeReason: queueDay?.closeReason || null,
    reconciliationError: queueDay?.lastReconciliationError || null,
    reconciliationAttemptCount: queueDay?.reconciliationAttemptCount || 0,
    lastReconciledAt: queueDay?.lastReconciledAt || null,
    isClosed: state !== "open",
    isPaused: intakeMode === "paused",
    queueDateKey: businessDate.replace(/-/g, ""),
    closedAt: queueDay?.closedAt || null,
    reopenedAt: queueDay?.lastReopenedAt || null,
    closureReason: queueDay?.closeReason || null,
    pausedAt: null,
    resumedAt: null,
    pauseReason: null,
    pauseMode: null
  };
}

module.exports = {
  CARRY_OVER_DAYS,
  assertIntakeOpen,
  closeLockedQueueDay,
  closeQueueDay,
  emitDueWarnings,
  expirePendingCarryOvers,
  extendQueueDay,
  formatQueueDayStatus,
  getAuthoritativeQueueDay,
  getQueueDayForSnapshot,
  openQueueDay,
  recordShadowComparison,
  reconcileDueQueueDays,
  reconcileQueueDayById,
  reopenQueueDay,
  setQueueIntake
};
