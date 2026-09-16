const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapProfile(row) {
  if (!row) return null;
  return {
    id: String(row.profile_id || row.id),
    projectId: String(row.developer_project_id),
    environment: row.environment,
    slug: row.slug,
    displayName: row.display_name,
    directoryStatus: row.directory_status,
    directoryContent: row.directory_content || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQueue(row) {
  if (!row) return null;
  return {
    id: String(row.queue_id || row.id),
    profileId: String(row.developer_api_profile_id),
    slug: row.queue_slug || row.slug,
    displayName: row.queue_display_name || row.display_name,
    sessionState: row.session_state,
    intakeEnabled: Boolean(row.intake_enabled),
    joiningEnabled: Boolean(row.joining_enabled),
    priorityRatio: Number(row.priority_ratio),
    resourceVersion: Number(row.resource_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: String(row.ticket_id || row.id),
    projectId: String(row.developer_project_id),
    environment: row.environment,
    profileId: String(row.developer_api_profile_id),
    queueId: String(row.developer_api_queue_id),
    counterId: row.developer_api_queue_counter_id ? String(row.developer_api_queue_counter_id) : null,
    ticketNumber: row.ticket_number,
    sequence: Number(row.sequence),
    displayLabel: row.display_label || null,
    externalReference: row.external_reference || null,
    recipientEmail: row.recipient_email || null,
    status: row.status,
    statusReason: row.status_reason || null,
    calledAt: row.called_at,
    servedAt: row.served_at,
    skippedAt: row.skipped_at,
    cancelledAt: row.cancelled_at,
    unservedAt: row.unserved_at,
    terminalAt: row.terminal_at,
    resourceVersion: Number(row.resource_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const PROFILE_COLUMNS = `
  id AS profile_id, developer_project_id, environment, slug, display_name,
  directory_status, directory_content, created_at, updated_at
`;

const QUEUE_COLUMNS = `
  id AS queue_id, developer_api_profile_id, slug AS queue_slug,
  display_name AS queue_display_name, session_state, intake_enabled,
  joining_enabled, priority_ratio, resource_version, created_at, updated_at
`;

const TICKET_COLUMNS = `
  id AS ticket_id, developer_project_id, environment, developer_api_profile_id,
  developer_api_queue_id, developer_api_queue_counter_id, ticket_number,
  sequence, display_label, external_reference, recipient_email, status,
  status_reason, called_at, served_at, skipped_at, cancelled_at, unserved_at,
  terminal_at, resource_version, created_at, updated_at
`;

async function findProfile(projectId, environment, profileSlug, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${PROFILE_COLUMNS}
     FROM developer_api_profiles
     WHERE developer_project_id = $1 AND environment = $2 AND slug = $3
     LIMIT 1`,
    [projectId, environment, profileSlug]
  );
  return mapProfile(result.rows[0]);
}

async function listProfiles(projectId, environment, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${PROFILE_COLUMNS}
     FROM developer_api_profiles
     WHERE developer_project_id = $1 AND environment = $2
     ORDER BY created_at ASC, id ASC`,
    [projectId, environment]
  );
  return result.rows.map(mapProfile);
}

async function createProfile(input, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO developer_api_profiles
       (developer_project_id, environment, slug, display_name, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PROFILE_COLUMNS}`,
    [input.projectId, input.environment, input.slug, input.displayName, Number(input.userId)]
  );
  return mapProfile(result.rows[0]);
}

async function updateProfile(profileId, input, options = {}) {
  const queryClient = clientFor(options);
  const sets = [];
  const values = [profileId];
  if (input.displayName !== undefined) {
    values.push(input.displayName);
    sets.push(`display_name = $${values.length}`);
  }
  if (input.directoryContent !== undefined) {
    values.push(JSON.stringify(input.directoryContent));
    sets.push(`directory_content = $${values.length}::jsonb`);
  }
  if (input.directoryStatus !== undefined) {
    values.push(input.directoryStatus);
    sets.push(`directory_status = $${values.length}`);
  }
  if (!sets.length) return findProfileById(profileId, { client: queryClient });
  sets.push("updated_at = NOW()");
  const result = await queryClient.query(
    `UPDATE developer_api_profiles SET ${sets.join(", ")} WHERE id = $1 RETURNING ${PROFILE_COLUMNS}`,
    values
  );
  return mapProfile(result.rows[0]);
}

async function findProfileById(profileId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${PROFILE_COLUMNS} FROM developer_api_profiles WHERE id = $1 LIMIT 1`,
    [profileId]
  );
  return mapProfile(result.rows[0]);
}

async function findQueue(profileId, queueSlug, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const result = await clientFor(options).query(
    `SELECT ${QUEUE_COLUMNS}
     FROM developer_api_queues
     WHERE developer_api_profile_id = $1 AND slug = $2${lock}`,
    [profileId, queueSlug]
  );
  return mapQueue(result.rows[0]);
}

async function findFirstQueue(profileId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${QUEUE_COLUMNS}
     FROM developer_api_queues
     WHERE developer_api_profile_id = $1
     ORDER BY created_at ASC, id ASC
     LIMIT 1${options.forUpdate ? " FOR UPDATE" : ""}`,
    [profileId]
  );
  return mapQueue(result.rows[0]);
}

async function listQueues(profileId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${QUEUE_COLUMNS}
     FROM developer_api_queues
     WHERE developer_api_profile_id = $1
     ORDER BY created_at ASC, id ASC`,
    [profileId]
  );
  return result.rows.map(mapQueue);
}

async function createQueue(input, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO developer_api_queues
       (developer_api_profile_id, slug, display_name, session_state, intake_enabled)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${QUEUE_COLUMNS}`,
    [input.profileId, input.slug, input.displayName, input.sessionState || "closed", Boolean(input.intakeEnabled)]
  );
  return mapQueue(result.rows[0]);
}

async function updateQueue(queueId, input, options = {}) {
  const queryClient = clientFor(options);
  const sets = [];
  const values = [queueId];
  if (input.displayName !== undefined) {
    values.push(input.displayName);
    sets.push(`display_name = $${values.length}`);
  }
  if (input.sessionState !== undefined) {
    values.push(input.sessionState);
    sets.push(`session_state = $${values.length}`);
  }
  if (input.intakeEnabled !== undefined) {
    values.push(Boolean(input.intakeEnabled));
    sets.push(`intake_enabled = $${values.length}`);
  }
  if (!sets.length) return findQueueById(queueId, { client: queryClient });
  sets.push("resource_version = resource_version + 1", "updated_at = NOW()");
  let versionWhere = "WHERE id = $1";
  if (input.resourceVersion !== undefined) {
    values.push(Number(input.resourceVersion));
    versionWhere = `WHERE id = $1 AND resource_version = $${values.length}`;
  }
  const result = await queryClient.query(
    `UPDATE developer_api_queues SET ${sets.join(", ")} ${versionWhere} RETURNING ${QUEUE_COLUMNS}`,
    values
  );
  return mapQueue(result.rows[0]);
}

async function findQueueById(queueId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT ${QUEUE_COLUMNS} FROM developer_api_queues WHERE id = $1 LIMIT 1`,
    [queueId]
  );
  return mapQueue(result.rows[0]);
}

async function queueSnapshot(queueId, options = {}) {
  const queryClient = clientFor(options);
  const queueResult = await queryClient.query(
    `SELECT ${QUEUE_COLUMNS}
     FROM developer_api_queues
     WHERE id = $1
     LIMIT 1`,
    [queueId]
  );
  const queue = mapQueue(queueResult.rows[0]);
  if (!queue) return null;

  const tickets = await queryClient.query(
    `SELECT ${TICKET_COLUMNS}
     FROM developer_api_tickets
     WHERE developer_api_queue_id = $1 AND status IN ('waiting', 'called', 'skipped')
     ORDER BY sequence ASC`,
    [queueId]
  );
  const mappedTickets = tickets.rows.map(mapTicket);
  const current = mappedTickets.find((ticket) => ticket.status === "called") || null;
  const waiting = mappedTickets.filter((ticket) => ticket.status === "waiting");
  return {
    queue,
    stats: { waitingCount: waiting.length, calledCount: current ? 1 : 0 },
    current,
    nextUp: waiting.slice(0, 5),
    overflow: waiting.slice(5)
  };
}

async function getUsage(projectId, environment, options = {}) {
  const queryClient = clientFor(options);
  const [summaryResult, dailyResult, recentResult] = await Promise.all([
    queryClient.query(
      `SELECT COUNT(*)::INTEGER AS issued_tickets,
          COUNT(*) FILTER (WHERE status IN ('waiting', 'called'))::INTEGER AS active_tickets,
          COUNT(*) FILTER (WHERE terminal_at IS NOT NULL)::INTEGER AS completed_tickets
       FROM developer_api_tickets
       WHERE developer_project_id = $1 AND environment = $2`,
      [projectId, environment]
    ),
    queryClient.query(
      `SELECT (created_at AT TIME ZONE 'UTC')::DATE AS usage_date,
          COUNT(*)::INTEGER AS issued_tickets
       FROM developer_api_tickets
       WHERE developer_project_id = $1 AND environment = $2
       GROUP BY usage_date
       ORDER BY usage_date DESC
       LIMIT 30`,
      [projectId, environment]
    ),
    queryClient.query(
      `SELECT ${TICKET_COLUMNS}
       FROM developer_api_tickets
       WHERE developer_project_id = $1 AND environment = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [projectId, environment]
    )
  ]);
  const summary = summaryResult.rows[0] || {};
  return {
    summary: {
      issuedTickets: Number(summary.issued_tickets || 0),
      activeTickets: Number(summary.active_tickets || 0),
      completedTickets: Number(summary.completed_tickets || 0)
    },
    daily: dailyResult.rows.map((row) => ({ date: row.usage_date, issuedTickets: Number(row.issued_tickets || 0) })),
    recentTickets: recentResult.rows.map(mapTicket)
  };
}

async function findTicket(projectId, environment, queueId, ticketId, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const result = await clientFor(options).query(
    `SELECT ${TICKET_COLUMNS}
     FROM developer_api_tickets
     WHERE id = $1 AND developer_project_id = $2
       AND environment = $3 AND developer_api_queue_id = $4${lock}`,
    [ticketId, projectId, environment, queueId]
  );
  return mapTicket(result.rows[0]);
}

async function listTicketEvents(projectId, environment, queueId, ticketId, limit, afterId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT id, developer_api_ticket_id, developer_api_queue_id, event_type,
        from_status, to_status, resource_version, source, created_at
     FROM developer_api_ticket_events
     WHERE developer_project_id = $1 AND environment = $2
       AND developer_api_queue_id = $3 AND developer_api_ticket_id = $4
       AND ($5::BIGINT IS NULL OR id > $5::BIGINT)
     ORDER BY id ASC
     LIMIT $6`,
    [projectId, environment, queueId, ticketId, afterId ? Number(afterId) : null, Number(limit) + 1]
  );
  const rows = result.rows;
  const hasMore = rows.length > Number(limit);
  if (hasMore) rows.length = Number(limit);
  return {
    events: rows.map((row) => ({
      id: String(row.id),
      ticketId: String(row.developer_api_ticket_id),
      queueId: String(row.developer_api_queue_id),
      type: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      resourceVersion: Number(row.resource_version),
      source: row.source,
      occurredAt: row.created_at
    })),
    nextCursor: hasMore ? String(rows[rows.length - 1].id) : null
  };
}

async function consumeSandboxAllowance(projectId, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO developer_sandbox_daily_allowances
       (developer_project_id, allowance_date, issued_tickets)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (developer_project_id, allowance_date)
     DO UPDATE SET issued_tickets = developer_sandbox_daily_allowances.issued_tickets + 1,
       updated_at = NOW()
     WHERE developer_sandbox_daily_allowances.issued_tickets < 100
     RETURNING issued_tickets`,
    [projectId]
  );
  return result.rows[0] ? Number(result.rows[0].issued_tickets) : null;
}

async function appendTicketEvent(input, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO developer_api_ticket_events
       (developer_project_id, environment, developer_api_profile_id,
        developer_api_queue_id, developer_api_ticket_id, event_type,
        from_status, to_status, resource_version, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, created_at`,
    [
      input.projectId, input.environment, input.profileId, input.queueId,
      input.ticketId, input.type, input.fromStatus || null, input.toStatus || null,
      input.resourceVersion, input.source || "developer_api"
    ]
  );
  return { id: String(result.rows[0].id), occurredAt: result.rows[0].created_at };
}

async function issueTicket(input, options = {}) {
  const queryClient = clientFor(options);
  const queue = await findQueue(input.profileId, input.queueSlug, { client: queryClient, forUpdate: true });
  if (!queue || queue.id !== String(input.queueId)) return null;
  if (queue.sessionState !== "open" || !queue.intakeEnabled) {
    const error = new Error("Queue intake is not open.");
    error.statusCode = 409;
    error.code = "QUEUE_NOT_ACCEPTING";
    throw error;
  }
  if (input.environment === "sandbox" && !await consumeSandboxAllowance(input.projectId, { client: queryClient })) {
    const error = new Error("Sandbox daily ticket allowance is exhausted.");
    error.statusCode = 429;
    error.code = "SANDBOX_ALLOWANCE_EXHAUSTED";
    throw error;
  }
  const nextSequence = await queryClient.query(
    `SELECT COALESCE(MAX(sequence), 0)::BIGINT + 1 AS next_sequence
     FROM developer_api_tickets WHERE developer_api_queue_id = $1`,
    [queue.id]
  );
  const sequence = Number(nextSequence.rows[0].next_sequence);
  const ticketNumber = `${queue.slug.toUpperCase().slice(0, 8)}-${String(sequence).padStart(4, "0")}`;
  const inserted = await queryClient.query(
    `INSERT INTO developer_api_tickets
       (developer_project_id, environment, developer_api_profile_id,
        developer_api_queue_id, ticket_number, sequence, display_label,
        external_reference, recipient_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${TICKET_COLUMNS}`,
    [
      input.projectId, input.environment, input.profileId, queue.id,
      ticketNumber, sequence, input.displayLabel || null,
      input.externalReference || null, input.recipientEmail || null
    ]
  );
  const ticket = mapTicket(inserted.rows[0]);
  ticket.event = await appendTicketEvent({
    projectId: ticket.projectId,
    environment: ticket.environment,
    profileId: ticket.profileId,
    queueId: ticket.queueId,
    ticketId: ticket.id,
    type: "ticket.issued",
    toStatus: ticket.status,
    resourceVersion: ticket.resourceVersion
  }, { client: queryClient });
  return ticket;
}

async function callNextTicket(input, options = {}) {
  const queryClient = clientFor(options);
  const queue = await findQueue(input.profileId, input.queueSlug, { client: queryClient, forUpdate: true });
  if (!queue || queue.id !== String(input.queueId)) return null;
  const active = await queryClient.query(
    `SELECT id FROM developer_api_tickets
     WHERE developer_api_queue_id = $1 AND status = 'called'
     LIMIT 1 FOR UPDATE`,
    [queue.id]
  );
  if (active.rows[0]) {
    const error = new Error("Resolve the currently called ticket before calling another.");
    error.statusCode = 409;
    error.code = "CURRENT_TICKET_ACTIVE";
    throw error;
  }
  const next = await queryClient.query(
    `SELECT ${TICKET_COLUMNS} FROM developer_api_tickets
     WHERE developer_api_queue_id = $1 AND status = 'waiting'
     ORDER BY sequence ASC LIMIT 1 FOR UPDATE`,
    [queue.id]
  );
  const waiting = mapTicket(next.rows[0]);
  if (!waiting) return null;
  return transitionTicket({ ...input, ticketId: waiting.id, fromStatus: "waiting", toStatus: "called" }, { client: queryClient });
}

async function transitionTicket(input, options = {}) {
  const queryClient = clientFor(options);
  const ticket = await findTicket(input.projectId, input.environment, input.queueId, input.ticketId, { client: queryClient, forUpdate: true });
  if (!ticket) return null;
  if (input.fromStatus && ticket.status !== input.fromStatus) {
    const error = new Error("Ticket cannot transition from its current status.");
    error.statusCode = 409;
    error.code = "INVALID_TICKET_STATE";
    throw error;
  }
  const terminal = ["served", "cancelled", "unserved", "expired"].includes(input.toStatus);
  const timeColumn = {
    called: "called_at", served: "served_at", skipped: "skipped_at", cancelled: "cancelled_at", unserved: "unserved_at"
  }[input.toStatus];
  const result = await queryClient.query(
    `UPDATE developer_api_tickets
     SET status = $2, status_reason = $3, resource_version = resource_version + 1,
       ${timeColumn ? `${timeColumn} = NOW(),` : ""}
       terminal_at = CASE WHEN $4 THEN NOW() ELSE terminal_at END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${TICKET_COLUMNS}`,
    [ticket.id, input.toStatus, input.statusReason || null, terminal]
  );
  const updated = mapTicket(result.rows[0]);
  updated.event = await appendTicketEvent({
    projectId: updated.projectId,
    environment: updated.environment,
    profileId: updated.profileId,
    queueId: updated.queueId,
    ticketId: updated.id,
    type: input.eventType || `ticket.${input.toStatus === "called" ? "called" : input.toStatus === "skipped" ? "skipped" : input.toStatus}`,
    fromStatus: ticket.status,
    toStatus: updated.status,
    resourceVersion: updated.resourceVersion
  }, { client: queryClient });
  return updated;
}

module.exports = {
  createProfile,
  createQueue,
  callNextTicket,
  consumeSandboxAllowance,
  findFirstQueue,
  findProfile,
  findQueue,
  findQueueById,
  findTicket,
  getUsage,
  issueTicket,
  listProfiles,
  listTicketEvents,
  listQueues,
  mapProfile,
  mapQueue,
  mapTicket,
  queueSnapshot,
  transitionTicket,
  updateProfile,
  updateQueue
};
