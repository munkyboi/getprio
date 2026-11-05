const serviceHours = require("../services/queueServiceHoursService");
const { randomUUID } = require("node:crypto");

function fail(code, message) {
  throw Object.assign(new Error(message), { code, statusCode: 409 });
}

// Callers own the transaction. Pool locks serialize named and anonymous demand,
// including demand originating outside this queue-plan implementation.
async function load(client, scope, ticketId) {
  const p = (
    await client.query(
      `SELECT p.*,p.revision::text,t.status,t.join_channel,
    t.customer_confirmed_at,t.service_counter_id::text,a.state AS stage_state,
    a.started_at AS stage_started_at,a.station_snapshot,clock_timestamp() AS observed_at
    FROM ticket_service_plans p JOIN tickets t ON(t.id,t.tenant_id,t.location_id)=(p.ticket_id,p.tenant_id,p.location_id)
    JOIN queue_stage_attempts a ON a.id=p.stage_attempt_id
    WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3 AND p.contract_version IN(3,4)
    FOR UPDATE OF p,t,a`,
      [...scope, ticketId],
    )
  ).rows[0];
  if (!p) fail("INVALID_STATE", "A named-resource plan is required.");
  const children = (
    await client.query(
      `SELECT c.*,c.revision::text,d.snapshot FROM queue_child_attempts c
    JOIN queue_selection_definitions d ON(d.ticket_id,d.plan_revision,d.selection_id)=(c.ticket_id,c.plan_revision,c.selection_id)
    WHERE c.tenant_id=$1 AND c.location_id=$2 AND c.ticket_id=$3 AND c.plan_revision=$4
    AND c.stage_attempt_id=$5 AND c.is_current ORDER BY c.pool_id,c.selection_id FOR UPDATE OF c`,
      [...scope, ticketId, p.revision, p.stage_attempt_id],
    )
  ).rows;
  const pools = new Map();
  for (const poolId of [
    ...new Set(children.map((c) => String(c.pool_id))),
  ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))) {
    const pool = (
      await client.query(
        `SELECT *,id::text FROM location_resource_pools
      WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE`,
        [...scope, poolId],
      )
    ).rows[0];
    pools.set(poolId, pool);
  }
  return { p, children, pools };
}

async function validateDemand(client, scope, state, children) {
  for (const child of children) {
    const frozen = child.snapshot,
      pool = state.pools.get(String(child.pool_id));
    if (pool?.archived_at) fail("RESOURCE_POOL_ARCHIVED", "This resource pool is archived. Cancel unstarted protection and amend to active resources before calling or starting. Already-started work can still complete or be interrupted.");
    const requirement = (
      await client.query(
        `SELECT * FROM service_resource_requirements
      WHERE tenant_id=$1 AND location_id=$2 AND service_id=$3 FOR SHARE`,
        [...scope, frozen.serviceId],
      )
    ).rows[0];
    if (
      !pool?.tracking_enabled ||
      !requirement ||
      String(requirement.pool_id) !== String(child.pool_id) ||
      pool.revision !== frozen.resource.poolRevision ||
      requirement.revision !== frozen.resource.requirementRevision ||
      requirement.units_required !== frozen.resource.unitsRequired ||
      child.units !== frozen.resource.totalUnits
    )
      fail(
        "STALE_REVISION",
        "Resource configuration changed. Review the selection before calling.",
      );
    if (child.resource_member_id) {
      const member = (
        await client.query(
          `SELECT * FROM resource_pool_members WHERE id=$1 AND tenant_id=$2
        AND location_id=$3 AND pool_id=$4 FOR SHARE`,
          [child.resource_member_id, ...scope, child.pool_id],
        )
      ).rows[0];
      if (member?.archived_at) fail("RESOURCE_MEMBER_ARCHIVED","This named resource is archived. Amend to a non-archived enabled resource before calling or starting work.");
      if (
        !member?.is_active ||
        String(member.revision) !== String(frozen.resourceMemberRevision)
      )
        fail(
          "STALE_REVISION",
          "The selected resource changed. Review the selection before calling.",
        );
    }
  }
}

async function capacity(client, scope, state, child, excludedGroup = null) {
  function unavailable(message) {
    const parent = state.children.find(
      (c) => c.selection_id === child.parent_executed_selection_id,
    );
    throw Object.assign(new Error(message), {
      code: "RESOURCE_CAPACITY_UNAVAILABLE",
      statusCode: 409,
      capacityWait: {
        selectionId: child.selection_id,
        selectionKind: child.selection_kind,
        parentResourceSelectionId: child.parent_executed_selection_id || null,
        serviceName: child.snapshot.serviceName,
        resourceMemberName: child.snapshot.resourceMemberName || null,
        parentResourceName: parent?.snapshot.resourceMemberName || null,
      },
    });
  }
  const start = state.p.observed_at,
    end = new Date(start.getTime() + child.duration_minutes * 60000);
  const active = (
    await client.query(
      `SELECT units,resource_member_id FROM resource_allocations
    WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL`,
      [...scope, child.pool_id],
    )
  ).rows;
  const held = (
    await client.query(
      `SELECT units,resource_member_id,starts_at,ends_at FROM resource_ledger_reservations
    WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected' AND starts_at<$5 AND ends_at>$4
    AND ($6::uuid IS NULL OR group_id IS DISTINCT FROM $6)`,
      [...scope, child.pool_id, start, end, excludedGroup],
    )
  ).rows;
  // Anonymous occupancy cannot prove that a particular physical resource is free.
  if (
    child.resource_member_id &&
    [...active, ...held].some(
      (r) =>
        !r.resource_member_id ||
        r.resource_member_id === child.resource_member_id,
    )
  )
    unavailable(
      "The selected resource is unavailable or its occupancy cannot be determined.",
    );
  const changes = [[start.getTime(), child.units]];
  for (const hold of held)
    changes.push(
      [Math.max(start.getTime(), hold.starts_at.getTime()), hold.units],
      [Math.min(end.getTime(), hold.ends_at.getTime()), -hold.units],
    );
  changes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = active.reduce((sum, r) => sum + r.units, 0);
  for (const [, units] of changes) {
    used += units;
    if (used > state.pools.get(String(child.pool_id)).capacity)
      unavailable("Required resource or extra capacity is unavailable.");
  }
  return end;
}

async function reserve(client, scope, ticketId) {
  return reserveState(
    client,
    scope,
    ticketId,
    await load(client, scope, ticketId),
  );
}
async function reserveState(client, scope, ticketId, state, retry = false) {
  const { p, children } = state;
  // Bind final hours admission to the exact server timestamp recorded below.
  await serviceHours.assertLedgerPlanFits(client,scope,p,children,{retry});
  if (
    p.status !== "called" ||
    (!retry && p.stage_started_at) ||
    !children.length
  )
    fail("INVALID_STATE", "An unstarted called stage is required.");
  if (
    p.station_snapshot &&
    !p.station_snapshot.serviceCounterIds.includes(p.service_counter_id)
  )
    fail(
      "INVALID_STATE",
      "The called counter is not a permitted station lane.",
    );
  const old = (
    await client.query(
      `SELECT * FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2
    AND ticket_id=$3 AND stage_attempt_id=$4 AND execution_model='nested' AND state='protected' FOR UPDATE`,
      [...scope, ticketId, p.stage_attempt_id],
    )
  ).rows;
  if (old.length) {
    if (
      old.length !== 1 ||
      old[0].expires_at <= p.observed_at ||
      String(old[0].plan_revision) !== p.revision ||
      children.some((c) => c.state !== "protected")
    )
      fail("RESERVATION_EXPIRED", "Reload and call this stage again.");
    return { reservationGroupId: old[0].id };
  }
  if (children.some((c) => c.state !== "waiting"))
    fail("INVALID_STATE", "Every selected child must be waiting.");
  await validateDemand(client, scope, state, children);
  const id = randomUUID(),
    expiresAt = new Date(p.observed_at.getTime() + 300000);
  const attempt = (
    await client.query(
      `SELECT count(*)::int+1 AS n FROM queue_reservation_groups
    WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND stage_attempt_id=$4`,
      [...scope, ticketId, p.stage_attempt_id],
    )
  ).rows[0].n;
  await client.query(
    `INSERT INTO queue_reservation_groups(id,tenant_id,location_id,ticket_id,plan_revision,
    stage_attempt_id,state,expected_members,expires_at,attempt,execution_model) VALUES($1,$2,$3,$4,$5,$6,'protected','[]',$7,$8,'nested')`,
    [
      id,
      ...scope,
      ticketId,
      p.revision,
      p.stage_attempt_id,
      expiresAt,
      attempt,
    ],
  );
  const members = [];
  for (const child of children) {
    const end = await capacity(client, scope, state, child);
    const row = (
      await client.query(
        `INSERT INTO resource_ledger_reservations(tenant_id,location_id,ticket_id,pool_id,
      pool_revision,requirement_revision,units,starts_at,ends_at,group_id,line_id,resource_member_id,
      child_attempt_id,child_plan_revision,child_stage_attempt_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id::text`,
        [
          ...scope,
          ticketId,
          child.pool_id,
          child.snapshot.resource.poolRevision,
          child.snapshot.resource.requirementRevision,
          child.units,
          p.observed_at,
          end,
          id,
          child.selection_id,
          child.resource_member_id,
          child.id,
          p.revision,
          p.stage_attempt_id,
        ],
      )
    ).rows[0];
    members.push({
      lineId: child.selection_id,
      childAttemptId: child.id,
      reservationId: row.id,
    });
    await client.query(
      "UPDATE queue_child_attempts SET state='protected',revision=revision+1 WHERE id=$1",
      [child.id],
    );
  }
  await client.query(
    "UPDATE queue_reservation_groups SET expected_members=$2::jsonb WHERE id=$1",
    [id, JSON.stringify(members)],
  );
  if (!retry)
    await client.query(
      "UPDATE queue_stage_attempts SET state='called',revision=revision+1 WHERE id=$1",
      [p.stage_attempt_id],
    );
  return { reservationGroupId: id };
}

async function allocate(client, scope, ticketId, reservationGroupId) {
  return allocateState(
    client,
    scope,
    ticketId,
    reservationGroupId,
    await load(client, scope, ticketId),
  );
}
async function allocateState(
  client,
  scope,
  ticketId,
  reservationGroupId,
  state,
  retry = false,
) {
  const { p, children } = state;
  // Bind final hours admission to the exact server timestamp recorded below.
  await serviceHours.assertLedgerPlanFits(client,scope,p,children,{retry});
  if (
    p.status !== "called" ||
    (!retry && p.stage_started_at) ||
    (p.join_channel !== "vendor" && !p.customer_confirmed_at)
  )
    fail("INVALID_STATE", "A confirmed, unstarted called stage is required.");
  const group = (
    await client.query(
      `SELECT * FROM queue_reservation_groups WHERE id=$1 AND tenant_id=$2 AND location_id=$3
    AND ticket_id=$4 AND stage_attempt_id=$5 AND execution_model='nested' FOR UPDATE`,
      [reservationGroupId, ...scope, ticketId, p.stage_attempt_id],
    )
  ).rows[0];
  if (
    !group ||
    group.state !== "protected" ||
    group.expires_at <= p.observed_at ||
    String(group.plan_revision) !== p.revision
  )
    fail(
      "RESERVATION_EXPIRED",
      "The recorded protection expired or changed. Call again before Start.",
    );
  await validateDemand(client, scope, state, children);
  const reservations = (
    await client.query(
      `SELECT *,id::text FROM resource_ledger_reservations WHERE group_id=$1
    AND tenant_id=$2 AND location_id=$3 FOR UPDATE`,
      [group.id, ...scope],
    )
  ).rows;
  if (
    !children.length ||
    children.length !== reservations.length ||
    group.expected_members.length !== children.length ||
    children.some(
      (c) =>
        c.state !== "protected" ||
        !reservations.some(
          (r) =>
            r.child_attempt_id === c.id &&
            r.state === "protected" &&
            group.expected_members.some(
              (m) => m.childAttemptId === c.id && m.reservationId === r.id,
            ),
        ),
    )
  )
    fail(
      "STALE_REVISION",
      "The recorded reservation members are incomplete or changed.",
    );
  const id = randomUUID(),
    members = [];
  await client.query(
    `INSERT INTO queue_allocation_groups(id,tenant_id,location_id,ticket_id,reservation_group_id,
    stage_attempt_id,expected_members,started_at) VALUES($1,$2,$3,$4,$5,$6,'[]',$7)`,
    [id, ...scope, ticketId, group.id, p.stage_attempt_id, p.observed_at],
  );
  for (const child of children) {
    const end = await capacity(client, scope, state, child, group.id),
      binding = reservations.find((r) => r.child_attempt_id === child.id);
    const row = (
      await client.query(
        `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,
      units,reservation_id,started_at,expected_end_at,group_id,line_id,resource_member_id,child_attempt_id,
      child_plan_revision,child_stage_attempt_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id::text`,
        [
          ...scope,
          ticketId,
          child.pool_id,
          child.snapshot.resource.poolRevision,
          child.units,
          binding.id,
          p.observed_at,
          end,
          id,
          child.selection_id,
          child.resource_member_id,
          child.id,
          p.revision,
          p.stage_attempt_id,
        ],
      )
    ).rows[0];
    await client.query(
      "UPDATE resource_ledger_reservations SET state='converted',starts_at=$2,ends_at=$3 WHERE id=$1",
      [binding.id, p.observed_at, end],
    );
    await client.query(
      "UPDATE queue_child_attempts SET state='in_service',started_at=$2,revision=revision+1 WHERE id=$1",
      [child.id, p.observed_at],
    );
    members.push({
      lineId: child.selection_id,
      childAttemptId: child.id,
      reservationId: binding.id,
      allocationId: row.id,
    });
  }
  await client.query(
    "UPDATE queue_allocation_groups SET expected_members=$2::jsonb WHERE id=$1",
    [id, JSON.stringify(members)],
  );
  await client.query(
    "UPDATE queue_reservation_groups SET state='converted' WHERE id=$1",
    [group.id],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='in_service',started_at=COALESCE(started_at,$2),revision=revision+1 WHERE id=$1",
    [p.stage_attempt_id, p.observed_at],
  );
  return {
    allocationGroupId: id,
    allocationId: members[0].allocationId,
    startedAt: p.observed_at,
  };
}

async function releaseChild(client, scope, ticketId, body) {
  const state = await load(client, scope, ticketId),
    { p, children } = state;
  const child = children.find((c) => c.id === body.childAttemptId);
  if (!child || child.revision !== body.expectedChildRevision)
    fail(
      "STALE_REVISION",
      "The selected child changed. Reload before continuing.",
    );
  if (!["completed", "terminated"].includes(body.outcome))
    fail("INVALID_STATE", "An explicit child outcome is required.");
  if (child.state !== "in_service")
    fail("INVALID_STATE", "Only an active child can be resolved.");
  if (
    body.outcome === "terminated" &&
    (typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 500)
  )
    fail("INVALID_STATE", "An interruption reason is required.");
  const extras = children.filter(
    (c) => c.parent_child_attempt_id === child.id && c.state === "in_service",
  );
  const requested = body.interruptedExtras || [];
  if (body.outcome === "completed") {
    if (requested.length)
      fail("INVALID_STATE", "Completion cannot implicitly interrupt extras.");
    if (
      child.selection_kind === "resource" &&
      children.some(
        (c) =>
          c.parent_executed_selection_id === child.selection_id &&
          c.state !== "completed",
      )
    )
      fail(
        "REQUIRED_EXTRAS_UNFINISHED",
        "Complete the required extras before completing their resource.",
      );
  } else if (
    requested.length !== extras.length ||
    new Set(requested.map((c) => c.childAttemptId)).size !== requested.length ||
    extras.some(
      (c) =>
        !requested.some(
          (r) =>
            r.childAttemptId === c.id && r.expectedChildRevision === c.revision,
        ),
    )
  )
    fail(
      "REQUIRED_EXTRAS_UNFINISHED",
      "Explicitly include every unfinished extra with its current revision.",
    );
  const group = (
    await client.query(
      `SELECT g.* FROM queue_allocation_groups g JOIN queue_reservation_groups r ON r.id=g.reservation_group_id
    WHERE g.id=$1 AND g.tenant_id=$2 AND g.location_id=$3 AND g.ticket_id=$4 AND g.stage_attempt_id=$5
    AND r.execution_model='nested' FOR UPDATE OF g`,
      [body.allocationGroupId, ...scope, ticketId, p.stage_attempt_id],
    )
  ).rows[0];
  if (!group || group.released_at)
    fail("INVALID_STATE", "A current recorded allocation group is required.");
  const allocations = (
    await client.query(
      `SELECT *,id::text FROM resource_allocations WHERE group_id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE`,
      [group.id, ...scope],
    )
  ).rows;
  if (
    allocations.length !== group.expected_members.length ||
    allocations.some(
      (a) =>
        !group.expected_members.some(
          (m) =>
            m.allocationId === a.id && m.childAttemptId === a.child_attempt_id,
        ),
    )
  )
    fail(
      "INVALID_STATE",
      "Recorded allocation group membership is incomplete.",
    );
  for (const target of [...extras, child]) {
    const allocation = allocations.find(
      (a) => a.child_attempt_id === target.id,
    );
    if (!allocation || allocation.released_at)
      fail(
        "INVALID_STATE",
        "The recorded child allocation is no longer active.",
      );
    await client.query(
      `UPDATE resource_allocations SET released_at=$2,outcome=$3,reason=$4 WHERE id=$1`,
      [allocation.id, p.observed_at, body.outcome, body.reason?.trim() || null],
    );
    await client.query(
      `UPDATE queue_child_attempts SET state=$2,ended_at=$3,revision=revision+1 WHERE id=$1`,
      [
        target.id,
        body.outcome === "completed" ? "completed" : "interrupted",
        p.observed_at,
      ],
    );
  }
  const counts = (
    await client.query(
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE released_at IS NOT NULL)::int AS resolved,
    count(*) FILTER(WHERE outcome='completed')::int AS completed,count(*) FILTER(WHERE outcome='terminated')::int AS interrupted
    FROM resource_allocations WHERE group_id=$1`,
      [group.id],
    )
  ).rows[0];
  const finished = counts.total === counts.resolved;
  const resolution = finished
    ? counts.completed === counts.total
      ? "completed"
      : counts.interrupted === counts.total
        ? "interrupted"
        : "mixed"
    : "partial";
  await client.query(
    `UPDATE queue_allocation_groups SET resolution_state=$2,resolution_summary=$3::jsonb,
    released_at=CASE WHEN $4 THEN $5::timestamptz ELSE NULL END,outcome=CASE WHEN $4 THEN $6::text ELSE NULL END WHERE id=$1`,
    [
      group.id,
      resolution,
      JSON.stringify(counts),
      finished,
      p.observed_at,
      resolution === "completed" ? "completed" : "terminated",
    ],
  );
  const remaining = (
    await client.query(
      `SELECT state,count(*)::int AS n FROM queue_child_attempts WHERE tenant_id=$1 AND location_id=$2
    AND ticket_id=$3 AND plan_revision=$4 AND stage_attempt_id=$5 AND is_current GROUP BY state`,
      [...scope, ticketId, p.revision, p.stage_attempt_id],
    )
  ).rows;
  const stageCompleted =
    remaining.length === 1 && remaining[0].state === "completed";
  if (stageCompleted)
    await client.query(
      "UPDATE queue_stage_attempts SET state='completed',ended_at=$2,revision=revision+1 WHERE id=$1",
      [p.stage_attempt_id, p.observed_at],
    );
  return {
    allocationGroupId: group.id,
    allocationId: allocations.find((a) => a.child_attempt_id === child.id).id,
    resolutionState: resolution,
    stageCompleted,
    endedAt: p.observed_at,
  };
}

/**
 * Resolve every active child in the current allocation as one server-side
 * command. Extras are completed before their parent resources so the normal
 * required-extra invariant remains enforced. The surrounding transaction
 * makes the request atomic: a stale or unfinished child rolls the whole
 * operation back instead of leaving a partially completed request.
 */
async function completeAll(client, scope, ticketId, body) {
  const initial = await load(client, scope, ticketId);
  const active = initial.children.filter(
    (child) =>
      child.is_current &&
      child.plan_revision === initial.p.revision &&
      child.stage_attempt_id === initial.p.stage_attempt_id &&
      child.state === "in_service",
  );
  if (!active.length)
    fail("INVALID_STATE", "No active resources are available to complete.");

  const unresolved = initial.children.filter(
    (child) =>
      child.is_current &&
      child.plan_revision === initial.p.revision &&
      child.stage_attempt_id === initial.p.stage_attempt_id &&
      !["completed", "in_service"].includes(child.state),
  );
  if (unresolved.length)
    fail(
      "REQUIRED_EXTRAS_UNFINISHED",
      "Every current resource and required extra must be active or completed before completing the request.",
    );

  let result = null;
  // Children are deliberately ordered leaf-first. This permits each normal
  // releaseChild call to preserve the required-extra rule for parent resources.
  const ordered = [
    ...active.filter((child) => child.selection_kind === "extra"),
    ...active.filter((child) => child.selection_kind === "resource"),
  ];
  for (const target of ordered) {
    const current = await load(client, scope, ticketId);
    const child = current.children.find((candidate) => candidate.id === target.id);
    if (!child || child.state === "completed") continue;
    if (child.state !== "in_service")
      fail("STALE_REVISION", "A resource changed while completing this request.");
    result = await releaseChild(client, scope, ticketId, {
      ...body,
      childAttemptId: child.id,
      expectedChildRevision: child.revision,
      allocationGroupId: body.allocationGroupId,
      outcome: "completed",
    });
  }
  return result;
}

async function retryResource(client, scope, ticketId, body) {
  const state = await load(client, scope, ticketId),
    { p, children } = state;
  const resource = children.find(
    (c) => c.id === body.childAttemptId && c.selection_kind === "resource",
  );
  if (!resource || resource.revision !== body.expectedChildRevision)
    fail(
      "STALE_REVISION",
      "The interrupted resource changed. Reload before retrying.",
    );
  if (resource.state !== "interrupted")
    fail("INVALID_STATE", "Retry requires an explicitly interrupted resource.");
  const extras = children.filter(
      (c) => c.parent_executed_selection_id === resource.selection_id,
    ),
    unfinished = extras.filter((c) => c.state !== "completed");
  const expected = body.interruptedExtras || [];
  if (
    unfinished.some((c) => c.state !== "interrupted") ||
    expected.length !== unfinished.length ||
    new Set(expected.map((c) => c.childAttemptId)).size !== expected.length ||
    unfinished.some(
      (c) =>
        !expected.some(
          (e) =>
            e.childAttemptId === c.id && e.expectedChildRevision === c.revision,
        ),
    )
  )
    fail(
      "STALE_REVISION",
      "Review the exact interrupted extras before retrying this resource.",
    );
  if (
    (
      await client.query(
        `SELECT 1 FROM resource_allocations WHERE child_attempt_id=ANY($1::uuid[]) AND released_at IS NULL
    UNION ALL SELECT 1 FROM resource_ledger_reservations WHERE child_attempt_id=ANY($1::uuid[]) AND state='protected' LIMIT 1`,
        [[resource.id, ...extras.map((c) => c.id)]],
      )
    ).rows.length
  )
    fail(
      "INVALID_STATE",
      "Release every allocation in the interrupted resource tree before retrying.",
    );
  const newResourceId = randomUUID(),
    newIds = [];
  const completedProof = extras
    .filter((c) => c.state === "completed")
    .map((c) => c.id);
  for (const old of [resource, ...unfinished]) {
    await client.query(
      "UPDATE queue_child_attempts SET is_current=FALSE,revision=revision+1 WHERE id=$1",
      [old.id],
    );
    const id = old.id === resource.id ? newResourceId : randomUUID();
    newIds.push(id);
    await client.query(
      `INSERT INTO queue_child_attempts(id,ticket_id,plan_revision,selection_id,selection_kind,tenant_id,location_id,
      stage_id,stage_attempt_id,parent_child_attempt_id,parent_executed_selection_id,pool_id,units,duration_minutes,resource_member_id,
      attempt,state,satisfied_dependencies) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'waiting',$17::jsonb)`,
      [
        id,
        ticketId,
        p.revision,
        old.selection_id,
        old.selection_kind,
        ...scope,
        old.stage_id,
        p.stage_attempt_id,
        old.selection_kind === "extra" ? newResourceId : null,
        old.parent_executed_selection_id,
        old.pool_id,
        old.units,
        old.duration_minutes,
        old.resource_member_id,
        String(BigInt(old.attempt) + 1n),
        JSON.stringify(old.selection_kind === "resource" ? completedProof : []),
      ],
    );
  }
  // Reserve and Start the retry tree in this same transaction. Unrelated active
  // resources remain allocated; successful extras remain on their original attempt.
  const retryState = await load(client, scope, ticketId);
  retryState.children = retryState.children.filter((c) =>
    newIds.includes(c.id),
  );
  const reservation = await reserveState(
    client,
    scope,
    ticketId,
    retryState,
    true,
  );
  const refreshed = await load(client, scope, ticketId);
  refreshed.children = refreshed.children.filter((c) => newIds.includes(c.id));
  return allocateState(
    client,
    scope,
    ticketId,
    reservation.reservationGroupId,
    refreshed,
    true,
  );
}

async function cancelProtection(client, scope, reservationId, groupId) {
  const identity = (
    await client.query(
      "SELECT ticket_id::text FROM queue_reservation_groups WHERE id=$1 AND tenant_id=$2 AND location_id=$3",
      [groupId, ...scope],
    )
  ).rows[0];
  if (!identity)
    fail("INVALID_STATE", "The recorded protection group is missing.");
  const state = await load(client, scope, identity.ticket_id),
    { p, children } = state;
  const group = (
    await client.query(
      "SELECT * FROM queue_reservation_groups WHERE id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE",
      [groupId, ...scope],
    )
  ).rows[0];
  const members = (
    await client.query(
      "SELECT *,id::text FROM resource_ledger_reservations WHERE group_id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE",
      [groupId, ...scope],
    )
  ).rows;
  if (
    group.state === "cancelled" &&
    members.length &&
    members.every((m) => m.state === "cancelled")
  )
    return { reservationId };
  if (
    group.state !== "protected" ||
    String(group.plan_revision) !== p.revision ||
    group.stage_attempt_id !== p.stage_attempt_id ||
    p.stage_started_at ||
    members.length !== group.expected_members.length ||
    children.length !== members.length ||
    !members.some((m) => m.id === reservationId) ||
    members.some(
      (m) =>
        m.state !== "protected" ||
        !group.expected_members.some(
          (e) =>
            e.reservationId === m.id &&
            e.childAttemptId === m.child_attempt_id &&
            e.lineId === m.line_id,
        ),
    ) ||
    children.some(
      (c) =>
        c.state !== "protected" ||
        !members.some((m) => m.child_attempt_id === c.id),
    ) ||
    (
      await client.query(
        "SELECT 1 FROM queue_allocation_groups WHERE reservation_group_id=$1 LIMIT 1",
        [groupId],
      )
    ).rows.length ||
    (
      await client.query(
        "SELECT 1 FROM resource_allocations WHERE reservation_id=ANY($1::bigint[]) LIMIT 1",
        [members.map((m) => m.id)],
      )
    ).rows.length
  )
    fail(
      "INVALID_STATE",
      "Cancel requires the complete current unstarted protected promise.",
    );
  const oldState = {
    groupState: group.state,
    ticketStatus: p.status,
    stageState: p.stage_state,
    children: children.map((c) => ({
      childAttemptId: c.id,
      state: c.state,
      revision: c.revision,
    })),
    reservationMemberIds: members.map((m) => m.id),
  };
  await client.query(
    "UPDATE resource_ledger_reservations SET state='cancelled' WHERE group_id=$1",
    [groupId],
  );
  await client.query(
    "UPDATE queue_reservation_groups SET state='cancelled' WHERE id=$1",
    [groupId],
  );
  await client.query(
    "UPDATE queue_child_attempts SET state='waiting',revision=revision+1 WHERE id=ANY($1::uuid[])",
    [children.map((c) => c.id)],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='waiting',revision=revision+1 WHERE id=$1",
    [p.stage_attempt_id],
  );
  await client.query(
    "UPDATE tickets SET status='waiting',called_at=NULL,service_counter_id=NULL,updated_at=clock_timestamp() WHERE id=$1 AND status='called'",
    [identity.ticket_id],
  );
  await client.query(
    `UPDATE ticket_service_plans SET ticket_revision=ticket_revision+1,
    resource_wait=jsonb_build_object('code','RESERVATION_CANCELLED','message','Protection was cancelled. Call the ticket again.','planRevision',revision::text,'stageId',stage_id,'observedAt',clock_timestamp()) WHERE ticket_id=$1`,
    [identity.ticket_id],
  );
  // resource_ledger_commands stores this snapshot together with the command's
  // authenticated actor (or system actor), hash and replay receipt.
  return {
    reservationId,
    groupCancellation: {
      groupId,
      ticketId: identity.ticket_id,
      planRevision: p.revision,
      stageAttemptId: p.stage_attempt_id,
      oldState,
      newState: {
        groupState: "cancelled",
        ticketStatus: p.status === "called" ? "waiting" : p.status,
        stageState: "waiting",
        children: children.map((c) => ({
          childAttemptId: c.id,
          state: "waiting",
          revision: String(BigInt(c.revision) + 1n),
        })),
        reservationMemberIds: members.map((m) => m.id),
      },
    },
  };
}

module.exports = {
  reserve,
  allocate,
  releaseChild,
  completeAll,
  retryResource,
  retryCourt: retryResource,
  cancelProtection,
};
