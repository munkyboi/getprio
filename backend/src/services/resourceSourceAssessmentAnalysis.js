const ASSESSMENT_VERSION = 'resource-source-assessment-v1';
function ref(scope,kind,id) {
  return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id)<=9223372036854775807n
    ? `${kind}:${scope.tenantId}:${scope.locationId}:${id}` : null;
}
function decimal(value) { return typeof value === 'string' && /^-?\d+$/.test(value) ? value : null; }
function dateKey(value) { return typeof value === 'string' && /^\d{8}$/.test(value) ? value : null; }
function planSupport(plan, mappings, pools) {
  const reasons = [];
  if (!plan) return ['missing_captured_plan'];
  if (!plan.capturedAt) reasons.push('captured_plan_time_unknown');
  if (plan.source === 'unknown') reasons.push('captured_plan_source_unknown');
  if (!['parallel','sequential'].includes(plan.executionMode)) reasons.push('unsupported_execution_mode');
  if (plan.items.length !== 1) return [...reasons,'unsupported_composition'];
  const item = plan.items[0], resource = item.resource;
  if (!item.serviceRef || !item.durationMinutes || !resource.known || !resource.poolRef || !resource.units
    || !resource.poolRevision || !resource.requirementRevision) reasons.push('unknown_executable_demand');
  const mapping = mappings.get(item.serviceRef), pool = pools.get(resource.poolRef);
  if (!mapping || !pool || mapping.poolRef !== resource.poolRef || mapping.units !== resource.units
    || mapping.revision !== resource.requirementRevision || pool.revision !== resource.poolRevision) reasons.push('stale_plan_mapping');
  if (plan.source === 'booking' && !item.bookingItemRef) reasons.push('captured_booking_lineage_unknown');
  return reasons;
}
function groupBy(rows,key) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row[key]) || [];
    group.push(row); groups.set(row[key],group);
  }
  return groups;
}
function lineageReasons(row,segmentsByTicket) {
  if (!row.current_queue_day_id) return ['queue_day_lineage_unknown'];
  const active = segmentsByTicket.get(row.id) || [];
  if (active.length !== 1 || active[0].queue_day_id !== row.current_queue_day_id) return ['ambiguous_active_segment'];
  return active[0].legacy_inferred !== false ? ['legacy_segment_inferred_or_unknown'] : [];
}
function buildAssessment(report,data) {
  const d = data.dispatchScope[0], scope = report.scope;
  const mappings = new Map(data.requirements.map(row => [ref(scope,'service',row.service_id),{
    poolRef:ref(scope,'pool',row.pool_id),units:row.units_required,revision:row.revision
  }]));
  const pools = new Map(data.pools.map(row => [ref(scope,'pool',row.id),row]));
  const sanitized = new Map(report.inventory.work.map(work => [work.workRef,work]));
  const held = new Set(data.allocations.map(row => row.ticket_id));
  const segmentsByTicket = groupBy(data.segments,'ticket_id');
  const sessionsByWork = groupBy(report.inventory.allocations,'workRef');
  const businessGatePermitsCall = d.tenant_active === true && d.location_active === true && d.queue_open === true;
  const work = data.work.map(row => {
    const workRef = ref(scope,'ticket',row.id), source = sanitized.get(workRef);
    return { workRef, queueStatus:source.queueStatus, dateKey:dateKey(row.date_key),
      serviceCounterRef:ref(scope,'counter',row.service_counter_id),
      currentQueueDayRef:source.orderEvidence.currentQueueDayRef, originalQueueDayRef:source.orderEvidence.originalQueueDayRef,
      sqlCandidateAtObservation:row.sql_candidate === true,
      bookingNotReadyAtObservation:row.booking_call_not_ready === true,
      pendingCarryOver:row.status === 'pending_carry_over', calledUnresolved:row.status === 'called',
      recoveryDeadlineOpenAtObservation:row.status === 'skipped' ? row.recovery_available ?? null : false,
      timingOpen:Boolean(row.service_started_at && !row.service_ended_at), allocationHeld:held.has(row.id),
      orderEvidence:{ ...source.orderEvidence, createdAtMicroseconds:decimal(row.created_at_us),
        relativeGroup:decimal(row.order_group),tieCount:decimal(row.tie_count),authoritativeOrderKey:null,
        gaps:[...(decimal(row.tie_count) && BigInt(row.tie_count)>1n ? ['equal_dispatch_sort_values'] : []),...lineageReasons(row,segmentsByTicket)] },
      planEvidence:{ capturedPlan:source.plan,capturedBookingRef:ref(scope,'booking',row.booking_id), supportReasons:planSupport(source.plan,mappings,pools),
        monotonicRevision:null, sessionRefs:(sessionsByWork.get(workRef) || []).map(a => a.sessionRef) }
    };
  });
  const calledByCounter = groupBy(work.filter(item => item.calledUnresolved),'serviceCounterRef');
  const counters = new Map(data.counters.map(counter => [ref(scope,'counter',counter.id),counter]));
  for (const row of data.work.filter(item => item.status === 'called')) {
    const counterRef = ref(scope,'counter',row.service_counter_id);
    if (counterRef && !counters.has(counterRef)) counters.set(counterRef,{id:row.service_counter_id,is_active:null});
  }
  const lanes = [...counters.values(),{id:null,is_active:false}].map(counter => {
    const calledWorkRefs = (calledByCounter.get(ref(scope,'counter',counter.id)) || []).map(item => item.workRef);
    return { counterRef:ref(scope,'counter',counter.id), active:counter.is_active ?? null, calledWorkRefs,
      businessGatePermitsCall, vacancyObserved:calledWorkRefs.length === 0,
      actorAuthorization:'not_assessed',lockTimeSelection:'not_attested' };
  });
  return { dispatch:{ queueDateKey:dateKey(d.date_key),queueLifecycleMode:['legacy','shadow','enforced'].includes(d.queue_lifecycle_mode) ? d.queue_lifecycle_mode : 'unknown',
      queueOpenAtObservation:d.queue_open, tenantActive:d.tenant_active,locationActive:d.location_active,
      dateSource:d.queue_lifecycle_mode === 'enforced' ? 'latest_open_queue_day' : 'location_calendar_day',
      enforcedQueueDayRef:d.queue_lifecycle_mode === 'enforced' ? ref(scope,'day',d.open_day_id) : null,
      storedOpenQueueDayRef:ref(scope,'day',d.open_day_id),openQueueDayVersion:decimal(d.open_day_version),deadlineVersion:decimal(d.open_deadline_version),
      predicateClock:'database_transaction_observation',claimClock:'database_clock_at_mutation',
      candidateCount:work.filter(item => item.sqlCandidateAtObservation).length,
      globalOrder:'not_attested',totalOrder:'not_attested',lockTimeSelection:'not_attested',lanes },
    work, provenance:{ ledgerRevision:report.revisionEvidence.ledgerRevision,
      queueDayRevisions:report.inventory.queueDays,segmentEvidence:report.inventory.segments,
      configurationWatermark:null,planWatermarks:null,
      gaps:['configuration_watermark_unproven','plan_revision_unavailable',
        report.revisionEvidence.writerCoverageComplete ? 'writer_guarantees_unproven' : 'writer_coverage_incomplete'],
      requiredWriterEvidence:['configuration_revision_covering_pool_requirement_and_tracking_writers',
        'captured_plan_revision_covering_creation_replacement_and_cancellation',
        'queue_day_and_segment_revision_covering_admission_transition_and_reconciliation'] },
    authoritativeInventoryComplete:false, forecastHorizonComplete:false };
}
function buildSourceAssessmentResponse(report,data,observedAtUs = null) {
  return { assessmentVersion:ASSESSMENT_VERSION,scope:report.scope,window:report.window,
    observedAt:report.observedAt,observedAtMicroseconds:decimal(observedAtUs),completedAt:report.completedAt,scanStatus:report.scanStatus,
    readiness:'not_ready',snapshot:null,sourceAssessment:report.scanStatus === 'complete' ? buildAssessment(report,data) : null,
    reportEvidence:report };
}
module.exports = { ASSESSMENT_VERSION, buildSourceAssessmentResponse };
