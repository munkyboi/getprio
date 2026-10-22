const { createHash } = require('node:crypto');
function id(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^[1-9]\d{0,18}$/.test(text) && BigInt(text) <= 9223372036854775807n ? text : null;
}
function integer(value, minimum = 1, maximum = 100) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}
function time(value) {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function choice(value, values) { return values.includes(value) ? value : 'unknown'; }
function capturedUnits(item) {
  const resource = item?.resource || {}, quantity = integer(item?.quantity,1,100) || 1;
  const total = integer(resource.totalUnits,1,100);
  const required = integer(resource.unitsRequired,1,100);
  return total || (required ? required * quantity : null);
}
function resourcePoolRef(resource, reference) {
  return resource?.poolRef || reference('pool', resource?.poolId);
}
function resourceUnits(resource) {
  return integer(resource?.units,1,100) || integer(resource?.totalUnits,1,100) || integer(resource?.unitsRequired,1,100);
}
function resourceIsKnown(resource, reference) {
  return resource?.known === true || Boolean(resourcePoolRef(resource, reference) && resourceUnits(resource));
}
function observedDemandState(row,held) {
  if (held) return 'held_allocation';
  if (row.service_started_at && !row.service_ended_at) return 'timing_only_in_progress';
  return 'queue_work';
}
function capturedBindingDiffers(binding,item,resource) {
  if (!binding || !item) return false;
  return Boolean((id(resource?.requirementRevision) && id(resource.requirementRevision) !== binding.requirement_revision)
    || (time(item.scheduledStartAt) && time(item.scheduledStartAt) !== time(binding.starts_at))
    || (time(item.scheduledEndAt) && time(item.scheduledEndAt) !== time(binding.ends_at)));
}
function conversionDiffers(row,binding) {
  if (!binding) return true;
  return binding.state !== 'converted' || binding.pool_id !== row.pool_id || binding.units !== row.units
    || binding.pool_revision !== row.pool_revision || row.reservation_end_matches === false || row.reservation_start_valid === false;
}
function bindingSource(binding) {
  if (id(binding?.booking_id) && id(binding?.booking_item_id) && binding?.ticket_id == null) return 'booking';
  if (id(binding?.ticket_id) && binding?.booking_id == null && binding?.booking_item_id == null) return 'ticket';
  return 'unknown';
}
function ticketDurationMatches(binding, item) {
  // Queue writers derive Date ends from the millisecond start. Keep that
  // precision contract explicit while comparing PostgreSQL microseconds.
  if (!integer(item?.durationMinutes,5,480) || typeof binding?.duration_us !== 'string'
    || !/^-?\d{1,20}$/.test(binding.duration_us)) return null;
  return BigInt(binding.duration_us) === BigInt(item.durationMinutes) * 60000000n;
}
function classifyBooking(expired,active,supported,mapping,bindings) {
  if (expired) return 'expired_pending';
  if (!active) return 'not_eligible';
  if (!supported) return 'unsupported_composition';
  if (!mapping) return 'unmapped';
  if (!bindings.length) return 'unadmitted_demand';
  return bindings[0].state;
}
function compareCapacityEvents(a,b) {
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  return a[1]-b[1];
}
function buildResourceInventoryReport({ reportVersion, scope, window, observedAt, observedAtUs, ledger, counts, data, exceeded, bounds }) {
  const reference = (kind, value) => id(value) ? `${kind}:${scope.tenantId}:${scope.locationId}:${id(value)}` : null;
  const result = { reportVersion, scope, window, observedAt, completedAt: null,
    timestampDisplayPrecision: 'milliseconds', capacityComparisonPrecision: 'microseconds',
    readiness: 'not_ready', snapshot: null, authoritativeInventoryComplete: false,
    scanStatus: exceeded.length ? 'row_limit_exceeded' : 'complete', countsStatus: 'exact', counts,
    limits: bounds, exceededCollections: exceeded,
    revisionEvidence: { ledgerRevision: id(ledger?.revision), writerCoverageComplete: ledger?.writer_coverage_complete === true,
      configurationRevision: null, planRevisionsAvailable: false, dispatchOrderAttested: false },
    inventory: null, findings: { status: 'not_evaluated', counts: null, examples: [] },
    blockers: ['authoritative_inventory_not_attested','configuration_watermark_unproven','plan_revision_unavailable'],
    forecastSupport: 'not_assessed', historicalRepairPerformed: false, customerEstimateChanged: false,
    historicalEvidence: { trafficProvenance: BigInt(counts.historicalTickets) ? 'unverified' : 'absent',
      servedWithoutExplicitStart: counts.servedWithoutExplicitStart, startedWithoutCapturedPlan: counts.startedWithoutCapturedPlan } };
  if (!ledger) result.blockers.push('ledger_scope_missing');
  if (ledger?.writer_coverage_complete !== true) result.blockers.push('writer_coverage_incomplete');
  if (exceeded.length) { result.blockers.push('inventory_row_limit_exceeded'); return result; }
  const findingCounts = new Map(), seen = new Set(), examples = [];
  function finding(code, recordType, ref, classification = 'integrity_difference', amount = 1n) {
    const identity = `${code}:${recordType}:${ref}`;
    if (ref && seen.has(identity)) return;
    seen.add(identity);
    const key = `${code}:${recordType}:${classification}`;
    const previous = findingCounts.get(key);
    findingCounts.set(key, { code, recordType, classification, count: (BigInt(previous?.count || '0') + amount).toString() });
    if (ref && examples.length < 32) examples.push({ code, recordType, ref, classification });
  }
  const poolById = new Map(data.pools.map(row => [row.id, row]));
  const mappingByService = new Map(data.requirements.map(row => [row.service_id, row]));
  const workById = new Map(data.work.map(row => [row.id, row]));
  const allocationByWork = new Map(data.allocations.map(row => [row.ticket_id, row]));
  const allocationByBinding = new Map(data.allocations.filter(row => row.reservation_id).map(row => [row.reservation_id, row]));
  const bindingById = new Map(data.bindings.map(row => [row.id, row]));
  const liveBindingsByItem = groupLiveBindings();
  const now = Date.parse(observedAt), from = Date.parse(window.from), to = Date.parse(window.to);
  const overlaps = row => {
    if (typeof row.overlaps_window === 'boolean') return row.overlaps_window;
    const start = time(row.starts_at), end = time(row.ends_at);
    return start && end ? Date.parse(start) < to && Date.parse(end) > from : null;
  };
  const inventory = {
    pools: data.pools.map(row => ({ poolRef: reference('pool',row.id), capacity: integer(row.capacity), revision: id(row.revision), trackingEnabled: row.tracking_enabled === true })),
    requirements: data.requirements.map(row => ({ serviceRef: reference('service',row.service_id), poolRef: reference('pool',row.pool_id), units: integer(row.units_required), revision: id(row.revision) })),
    queueDays: data.queueDays.map(row => ({ queueDayRef: reference('day',row.id), businessDate: /^\d{4}-\d\d-\d\d$/.test(row.business_date) ? row.business_date : null,
      state: choice(row.state,['open','closed','unopened']), intakeMode: row.intake_mode === null ? null : choice(row.intake_mode,['accepting','paused']),
      dispatchPaused: null, version: id(row.version), deadlineVersion: id(row.deadline_version), lastReconciledAt: time(row.last_reconciled_at), reconciliationErrorPresent: row.reconciliation_error === true })),
    segments: data.segments.map(row => ({ segmentRef: reference('segment',row.id), workRef: reference('ticket',row.ticket_id), queueDayRef: reference('day',row.queue_day_id),
      sequence: integer(row.sequence,1,2147483647), priorityBand: choice(row.priority_band,['normal','recovery','carry_over','checked_in_booking']), activatedAt: time(row.activated_at), legacyInferred: row.legacy_inferred === true })),
    work: [], allocations: [], historicalConversions: [], protectedBindings: [], linkedBindings: [], bookingItems: []
  };
  if (!data.pools.length || data.pools.some(row => row.tracking_enabled !== true)) result.blockers.push('tracking_disabled');
  function groupLiveBindings() {
    const liveBindingsByItem = new Map();
    for (const binding of data.bindings) {
      if (!['protected','converted'].includes(binding.state) || !id(binding.booking_item_id)) continue;
      const group = liveBindingsByItem.get(binding.booking_item_id) || [];
      group.push(binding);
      liveBindingsByItem.set(binding.booking_item_id,group);
    }
    return liveBindingsByItem;
  }
  function inspectWorkPlan(row,plan,workRef) {
    if (!plan?.items.length) { finding('missing_captured_plan','work',workRef,'forecast_support_gap'); return; }
    if (Number(plan.contractVersion) !== 4 && plan.items.length !== 1) {
      finding('unsupported_composition','work',workRef,'forecast_support_gap');
      return;
    }
    const rawItems = Array.isArray(plan.rawItems) ? plan.rawItems : [row.items[0]];
    plan.items.forEach((item,index) => {
      const raw = rawItems[index], current = mappingByService.get(id(raw?.serviceId));
      if (!item.resource.known || !item.resource.poolRef || !item.resource.units || !item.durationMinutes)
        finding('unknown_executable_demand','work',workRef,'forecast_support_gap');
      if (item.resource.known && mappingIsStale(raw,current)) finding('stale_plan_mapping','work',workRef,'forecast_support_gap');
    });
  }
  function mappingIsStale(raw,current) {
    if (!current) return true;
    const units = capturedUnits(raw);
    return current.pool_id !== id(raw.resource.poolId) || current.revision !== id(raw.resource.requirementRevision)
      || current.units_required * (integer(raw.quantity,1,100) || 1) !== units
      || poolById.get(current.pool_id)?.revision !== id(raw.resource.poolRevision);
  }
  function inspectWork(row) {
    const workRef = reference('ticket',row.id), held = allocationByWork.get(row.id);
    const items = Array.isArray(row.items) ? row.items.map(item => ({ serviceRef: reference('service',item?.serviceId),
      quantity: integer(item?.quantity,1,100) || 1,
      bookingItemRef: reference('booking_item',item?.bookingItemId), durationMinutes: integer(item?.durationMinutes,5,480),
      scheduledStartAt: time(item?.scheduledStartAt), scheduledEndAt: time(item?.scheduledEndAt),
      resource: { known: item?.resource?.known === true || Boolean(id(item?.resource?.poolId) && capturedUnits(item)), poolRef: reference('pool',item?.resource?.poolId),
        units: capturedUnits(item), poolRevision: id(item?.resource?.poolRevision), requirementRevision: id(item?.resource?.requirementRevision) } })) : [];
    const plan = row.plan_source ? { source: choice(row.plan_source,['booking','staff_selection']),
      contractVersion: id(row.plan_contract_version), executionMode: choice(row.execution_mode,['parallel','sequential']),
      capturedAt: time(row.plan_captured_at), revision: null, items, rawItems: row.items } : null;
    if (plan) plan.contentFingerprint = createHash('sha256').update(JSON.stringify({ source: plan.source, executionMode: plan.executionMode, items })).digest('hex');
    inventory.work.push({ workRef, queueStatus: choice(row.status,['waiting','called','pending_carry_over','served','cancelled','unserved','skipped','expired']),
      channel: choice(row.join_channel,['vendor','online','qr']), developerLinked: row.developer_linked === true, customerConfirmed: row.customer_confirmed === true,
      observedDemandState: observedDemandState(row,held),
      serviceStartedAt: time(row.service_started_at), serviceEndedAt: time(row.service_ended_at),
      orderEvidence: { priorityBand: choice(row.service_priority_band,['normal','recovery','carry_over','checked_in_booking']),
        carryOverCount: integer(row.carry_over_count,0,2147483647), createdAt: time(row.created_at), currentQueueDayRef: reference('day',row.current_queue_day_id), originalQueueDayRef: reference('day',row.original_queue_day_id) }, plan });
    inspectWorkPlan(row,plan,workRef);
    if (plan) delete plan.rawItems;
    if (plan?.capturedAt === null) finding('captured_plan_time_unknown','work',workRef,'evidence_gap');
    if (!held && row.service_started_at && !row.service_ended_at) finding('timing_without_allocation','work',workRef,'forecast_support_gap');
    if (row.developer_linked || !['vendor','online','qr'].includes(row.join_channel)) finding('unsupported_channel_provenance','work',workRef,'evidence_gap');
    if (row.status === 'pending_carry_over') finding('carry_over_dispatch_not_attested','work',workRef,'evidence_gap');
  }
  function inspectCapturedResource(row,work,capturedResource,recordType,allocationRef) {
    if (work?.plan_source && (!resourceIsKnown(capturedResource,reference) || !resourcePoolRef(capturedResource,reference) || !resourceUnits(capturedResource)
      || !id(capturedResource.poolRevision) || !id(capturedResource.requirementRevision)))
      finding('captured_resource_evidence_unknown',recordType,allocationRef,'evidence_gap');
    if (work?.plan_source && !['booking','staff_selection'].includes(work.plan_source))
      finding('captured_plan_source_unknown',recordType,allocationRef,'evidence_gap');
    if (resourceIsKnown(capturedResource,reference) && (resourcePoolRef(capturedResource,reference) !== reference('pool',row.pool_id) || resourceUnits(capturedResource) !== row.units
      || (id(capturedResource.poolRevision) && id(capturedResource.poolRevision) !== row.pool_revision)))
      finding('allocation_captured_demand_mismatch',recordType,allocationRef);
  }
  function capturedItemForBinding(capturedItems,binding,row) {
    const candidates = capturedItems.filter(item => {
      const resource = item?.resource || {};
      return resourceIsKnown(resource,reference)
        && (resource.poolRef || reference('pool',resource.poolId)) === reference('pool',row?.pool_id)
        && resourceUnits(resource) === integer(row?.units);
    });
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length && capturedItems.length === 1) return capturedItems[0];
    const exact = candidates.filter(item => (!id(row?.pool_revision) || id(item.resource.poolRevision) === id(row.pool_revision))
      && (!id(binding?.requirement_revision) || id(item.resource.requirementRevision) === id(binding.requirement_revision)));
    return exact.length === 1 ? exact[0] : null;
  }
  function inspectBookingLineage(row,work,binding,capturedItems,capturedResource,recordType,allocationRef) {
    const capturedItemIds = capturedItems.map(item => id(item?.bookingItemId)).filter(Boolean);
    if (!row.reservation_id || !binding || bindingSource(binding) !== 'booking' || (capturedItemIds.length && !capturedItemIds.includes(binding.booking_item_id))
        || (work.booking_id && binding.booking_id !== work.booking_id))
      finding('allocation_booking_conversion_lineage_mismatch',recordType,allocationRef);
    if (!capturedItemIds.length || !work.booking_id)
      finding('captured_booking_lineage_unknown',recordType,allocationRef,'evidence_gap');
    const capturedItem = capturedItemForBinding(capturedItems,binding,row);
    if (!time(capturedItem?.scheduledStartAt) || !time(capturedItem?.scheduledEndAt))
      finding('captured_booking_interval_unknown',recordType,allocationRef,'evidence_gap');
    if (capturedBindingDiffers(binding,capturedItem,capturedResource)) finding('conversion_captured_binding_mismatch',recordType,allocationRef);
  }
  function reconcileConversion(row,work,binding,recordType,allocationRef) {
    const capturedItems = Array.isArray(work?.items) ? work.items : [];
    const capturedItem = capturedItemForBinding(capturedItems,binding,row);
    const capturedResource = capturedItem?.resource || null;
    inspectCapturedResource(row,work,capturedResource,recordType,allocationRef);
    if (row.reservation_id && conversionDiffers(row,binding)) finding('allocation_conversion_mismatch',recordType,allocationRef);
    if (row.reservation_id && bindingSource(binding) === 'unknown') finding('reservation_source_lineage_unknown',recordType,allocationRef);
    if (work?.plan_source === 'booking') inspectBookingLineage(row,work,binding,capturedItems,capturedResource,recordType,allocationRef);
    if (bindingSource(binding) === 'ticket') {
      if (binding.ticket_id !== row.ticket_id || work?.plan_source !== 'staff_selection' || work?.booking_id
        || !capturedItem || capturedItem?.bookingItemId)
        finding('allocation_ticket_conversion_lineage_mismatch',recordType,allocationRef);
      if (row.ticket_reservation_start_matches !== true) finding('ticket_conversion_interval_mismatch',recordType,allocationRef);
      if (!integer(capturedItem?.durationMinutes,5,480)) finding('captured_ticket_duration_unknown',recordType,allocationRef,'evidence_gap');
      const durationMatches = ticketDurationMatches(binding,capturedItem);
      if (durationMatches === null) finding('ticket_conversion_duration_unknown',recordType,allocationRef,'evidence_gap');
      else if (!durationMatches) finding('ticket_conversion_duration_mismatch',recordType,allocationRef);
      if (!id(capturedResource?.requirementRevision) || id(capturedResource.requirementRevision) !== binding.requirement_revision)
        finding('conversion_captured_binding_mismatch',recordType,allocationRef);
    }
    if (work?.plan_source === 'staff_selection' && row.reservation_id && bindingSource(binding) === 'booking')
      finding('staff_allocation_with_booking_conversion',recordType,allocationRef);
  }
  function inspectHeldWork(row,work,allocationRef) {
    if (!work) { finding('allocation_without_scoped_work','allocation',allocationRef); return; }
    if (!time(work.service_started_at) || row.ticket_start_matches === false) finding('allocation_ticket_start_mismatch','allocation',allocationRef);
    if (work?.service_ended_at) finding('ended_ticket_with_unreleased_allocation','allocation',allocationRef);
    if (work.status !== 'called') finding('held_allocation_ticket_not_called','allocation',allocationRef);
    if (['online','qr'].includes(work.join_channel) && work.customer_confirmed !== true)
      finding('held_allocation_confirmation_missing','allocation',allocationRef);
  }
  function inspectHeldAllocation(row) {
    const allocationRef = reference('allocation',row.id), work = workById.get(row.ticket_id), binding = bindingById.get(row.reservation_id);
    inventory.allocations.push({ allocationRef, sessionRef: allocationRef, workRef: reference('ticket',row.ticket_id), poolRef: reference('pool',row.pool_id),
      frozenPoolRevision: id(row.pool_revision), units: integer(row.units), startedAt: time(row.started_at), expectedEndAt: time(row.expected_end_at),
      reservationRef: reference('reservation',row.reservation_id), occupancyState: 'unreleased' });
    const previous = heldUnits.has(row.pool_id) ? heldUnits.get(row.pool_id) : 0;
    heldUnits.set(row.pool_id,previous === null || integer(row.units) === null ? null : previous + row.units);
    if (integer(row.units) === null) finding('allocation_units_unknown','allocation',allocationRef,'evidence_gap');
    inspectHeldWork(row,work,allocationRef);
    reconcileConversion(row,work,binding,'allocation',allocationRef);
    if (!poolById.has(row.pool_id)) finding('allocation_pool_missing','allocation',allocationRef);
    if (!time(row.expected_end_at)) finding('allocation_expected_end_unknown','allocation',allocationRef,'forecast_support_gap');
    else if (Date.parse(time(row.expected_end_at)) <= now) finding('allocation_expected_end_overdue','allocation',allocationRef,'forecast_support_gap');
  }
  function inspectHistoricalConversion(row) {
    const allocationRef = reference('allocation',row.id);
    const work = row.work_id ? { items:row.plan_items,plan_source:row.plan_source,booking_id:row.plan_booking_id,
      contractVersion:id(row.plan_contract_version) } : null;
    const binding = { state:choice(row.binding_state,['protected','converted','cancelled']),pool_id:row.binding_pool_id,pool_revision:row.binding_pool_revision,units:row.binding_units,
      booking_id:row.binding_booking_id,booking_item_id:row.binding_item_id,ticket_id:row.binding_ticket_id,
      requirement_revision:row.requirement_revision,starts_at:row.starts_at,ends_at:row.ends_at,duration_us:row.binding_duration_us };
    inventory.historicalConversions.push({ allocationRef,workRef:reference('ticket',row.ticket_id),
      reservationRef:reference('reservation',row.reservation_id),poolRef:reference('pool',row.pool_id),
      frozenPoolRevision:id(row.pool_revision),units:integer(row.units),startedAt:time(row.started_at),
      expectedEndAt:time(row.expected_end_at),releasedAt:time(row.released_at),occupancyState:'released',bindingState:binding.state });
    reconcileConversion(row,work,binding,'historical_allocation',allocationRef);
    if (!work || !Array.isArray(work.items) || !work.items.length || !work.plan_source)
      finding('historical_conversion_plan_unknown','historical_allocation',allocationRef,'evidence_gap');
    if (!time(row.service_started_at)) finding('historical_conversion_service_start_unknown','historical_allocation',allocationRef,'evidence_gap');
    else if (row.ticket_start_matches === false) finding('allocation_ticket_start_mismatch','historical_allocation',allocationRef);
    if (bindingSource(binding) !== 'ticket') {
      if (row.booking_interval_matches !== true) finding('converted_booking_interval_mismatch','historical_allocation',allocationRef);
      if (row.booking_status === 'pending') finding('pending_booking_with_conversion','historical_allocation',allocationRef);
    }
  }
  function inspectBinding(row) {
    const entry = { reservationRef: reference('reservation',row.id), source: bindingSource(row), workRef: reference('ticket',row.ticket_id),
      bookingItemRef: reference('booking_item',row.booking_item_id), poolRef: reference('pool',row.pool_id),
      frozenPoolRevision: id(row.pool_revision), frozenRequirementRevision: id(row.requirement_revision), units: integer(row.units), startsAt: time(row.starts_at), endsAt: time(row.ends_at),
      state: choice(row.state,['protected','converted','cancelled']), overlapsWindow: overlaps(row), linkedSessionRef: reference('allocation',allocationByBinding.get(row.id)?.id) };
    if (row.state === 'protected' && entry.overlapsWindow !== false) inventory.protectedBindings.push(entry);
    else inventory.linkedBindings.push(entry);
    if (row.state === 'protected' && allocationByBinding.has(row.id)) finding('protected_binding_already_allocated','binding',entry.reservationRef);
    if (bindingSource(row) === 'unknown') finding('reservation_source_lineage_unknown','binding',entry.reservationRef);
    if (row.state === 'protected' && bindingSource(row) === 'ticket') {
      const work = workById.get(row.ticket_id), item = capturedItemForBinding(work?.items || [],row,row);
      if (!work) finding('ticket_binding_work_missing','binding',entry.reservationRef);
      else if (work.status !== 'called' || work.service_started_at || work.service_ended_at)
        finding('ticket_binding_lifecycle_mismatch','binding',entry.reservationRef);
      else if (work.plan_source !== 'staff_selection' || work.booking_id || item?.bookingItemId || !integer(item?.durationMinutes,5,480))
        finding('ticket_binding_plan_unknown','binding',entry.reservationRef,'evidence_gap');
      if (!resourceIsKnown(item?.resource,reference) || resourcePoolRef(item.resource,reference) !== reference('pool',row.pool_id) || resourceUnits(item.resource) !== row.units
        || id(item.resource.poolRevision) !== row.pool_revision || id(item.resource.requirementRevision) !== row.requirement_revision)
        finding('ticket_binding_captured_demand_mismatch','binding',entry.reservationRef);
      if (!entry.startsAt || !entry.endsAt || Date.parse(entry.endsAt) <= Date.parse(entry.startsAt))
        finding('ticket_binding_interval_invalid','binding',entry.reservationRef);
      const durationMatches = ticketDurationMatches(row,item);
      if (durationMatches === null) finding('ticket_binding_duration_unknown','binding',entry.reservationRef,'evidence_gap');
      else if (!durationMatches) finding('ticket_binding_duration_mismatch','binding',entry.reservationRef);
    }
  }
  function inspectBookingEligibility(expired,active,supported,mapping,bindings,bookingItemRef) {
    if (expired) finding('expired_pending_booking','booking_item',bookingItemRef,'evidence_gap');
    if (active && !supported) finding('unsupported_booking_composition','booking_item',bookingItemRef,'forecast_support_gap');
    if (active && !mapping) finding('unmapped_booking_demand','booking_item',bookingItemRef,'forecast_support_gap');
    if (active && supported && mapping && !bindings.length) finding('eligible_booking_without_binding','booking_item',bookingItemRef,'potential_unadmitted_demand');
    if (bindings.length > 1) finding('multiple_live_booking_bindings','booking_item',bookingItemRef);
  }
  function inspectConvertedBinding(row,binding) {
    if (binding.booking_interval_matches !== true)
      finding('converted_booking_interval_mismatch','binding',reference('reservation',binding.id));
    if (row.booking_status === 'pending') finding('pending_booking_with_conversion','binding',reference('reservation',binding.id));
  }
  function inspectProtectedBinding(binding,active,mapping) {
    const bindingRef = reference('reservation',binding.id);
    if (!active || binding.booking_interval_matches !== true) finding('protected_booking_interval_or_eligibility_mismatch','binding',bindingRef);
    if (!mapping || mapping.pool_id !== binding.pool_id || mapping.units_required !== binding.units)
      finding('protected_binding_current_demand_difference','binding',bindingRef,'forecast_support_gap');
    if (mapping && (mapping.revision !== binding.requirement_revision || poolById.get(binding.pool_id)?.revision !== binding.pool_revision))
      finding('protected_binding_frozen_revision_stale','binding',bindingRef,'evidence_gap');
  }
  function inspectBooking(row) {
    const bookingItemRef = reference('booking_item',row.id), mapping = mappingByService.get(row.service_id);
    const bindings = liveBindingsByItem.get(row.id) || [];
    const start = time(row.scheduled_start_at), end = time(row.scheduled_end_at);
    const expired = row.pending_expired === true;
    const active = ['pending','confirmed','rescheduled'].includes(row.booking_status) && !expired && row.interval_not_elapsed === true;
    const duration = row.duration_minutes === null ? null : Number(row.duration_minutes);
    const supported = row.item_count === '1' && row.booking_quantity === 1 && integer(duration,5,480) !== null;
    const classification = classifyBooking(expired,active,supported,mapping,bindings);
    inventory.bookingItems.push({ bookingItemRef, serviceRef: reference('service',row.service_id), startsAt:start, endsAt:end,
      bookingEarliestCallAt: time(row.booking_scheduled_start_at), sourceItemCount: row.item_count, quantity: integer(row.booking_quantity,1,24),
      classification, currentMappingRef: reference('pool',mapping?.pool_id), currentTrackingEnabled: poolById.get(mapping?.pool_id)?.tracking_enabled === true,
      bindingRefs: bindings.map(binding => reference('reservation',binding.id)) });
    inspectBookingEligibility(expired,active,supported,mapping,bindings,bookingItemRef);
    bindings.filter(item => item.state === 'converted').forEach(binding => inspectConvertedBinding(row,binding));
    bindings.filter(item => item.state === 'protected').forEach(binding => inspectProtectedBinding(binding,active,mapping));
  }
  function capacityEvents(row,lower,upper) {
    const events = [];
    for (const binding of data.bindings.filter(item => item.state === 'protected' && item.pool_id === row.id && overlaps(item) !== false)) {
      const start = binding.starts_at_us ? BigInt(binding.starts_at_us) : BigInt(Date.parse(time(binding.starts_at)))*1000n;
      const end = binding.ends_at_us ? BigInt(binding.ends_at_us) : BigInt(Date.parse(time(binding.ends_at)))*1000n;
      let clippedStart = start, clippedEnd = end;
      if (clippedStart < lower) clippedStart = lower;
      if (clippedEnd > upper) clippedEnd = upper;
      events.push([clippedStart,binding.units], [clippedEnd,-binding.units]);
    }
    return events;
  }
  function inspectCapacityEvents(events,row,used,observation) {
    events.sort(compareCapacityEvents);
    let reserved = 0;
    for (const [at,delta] of events) {
      reserved += delta;
      if (reserved > row.capacity) finding('protected_units_exceed_capacity','pool',reference('pool',row.id));
      if (at >= observation && used > 0 && reserved > 0 && used+reserved > row.capacity)
        finding('potential_held_and_protected_capacity_conflict','pool',reference('pool',row.id),'evidence_gap');
    }
  }
  function inspectCapacity(row) {
    const used = heldUnits.has(row.id) ? heldUnits.get(row.id) : 0;
    const protectedForPool = inventory.protectedBindings.filter(item => item.poolRef === reference('pool',row.id));
    if (used === null || !integer(row.capacity) || protectedForPool.some(item => item.units === null || !item.startsAt || !item.endsAt)) {
      finding('capacity_check_unavailable','pool',reference('pool',row.id),'evidence_gap');
      return;
    }
    if (used > row.capacity) finding('observed_held_units_exceed_capacity','pool',reference('pool',row.id));
    const events = capacityEvents(row,BigInt(from)*1000n,BigInt(to)*1000n);
    const observation = observedAtUs ? BigInt(observedAtUs) : BigInt(now)*1000n;
    events.push([observation,0]);
    inspectCapacityEvents(events,row,used,observation);
  }
  function inspectHistoricalCounts() {
    for (const [countKey,code,type] of [['servedWithoutExplicitStart','historical_service_start_unknown','historical_ticket'],
      ['startedWithoutCapturedPlan','historical_plan_provenance_missing','historical_ticket'],
      ['convertedWithoutAllocation','historical_conversion_without_allocation','binding'],
      ['bookingParentsWithoutItems','booking_item_provenance_missing','booking']]) {
      if (BigInt(counts[countKey])) finding(code,type,null,type==='binding' ? 'integrity_difference' : 'evidence_gap',BigInt(counts[countKey]));
    }
  }
  const heldUnits = new Map();
  data.work.forEach(inspectWork);
  data.allocations.forEach(inspectHeldAllocation);
  data.historicalConversions.forEach(inspectHistoricalConversion);
  data.bindings.forEach(inspectBinding);
  data.bookingItems.forEach(inspectBooking);
  data.pools.forEach(inspectCapacity);
  inspectHistoricalCounts();
  for (const row of data.segments.filter(item=>item.legacy_inferred)) finding('legacy_arrival_inferred','segment',reference('segment',row.id),'evidence_gap');
  for (const row of data.queueDays.filter(item=>item.reconciliation_error)) finding('queue_reconciliation_error_present','queue_day',reference('day',row.id));
  result.inventory = inventory;
  result.findings = { status:'exact_for_scanned_sources', counts:[...findingCounts.values()], examples,
    examplesComplete: findingCounts.size === 0 || [...findingCounts.values()].reduce((sum,item)=>sum+BigInt(item.count),0n) === BigInt(examples.length) };
  if (findingCounts.size) result.blockers.push('reconciliation_or_evidence_gaps');
  return result;
}
module.exports = { buildResourceInventoryReport };
