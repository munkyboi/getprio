const test = require('node:test');
const assert = require('node:assert/strict');
const { currentStageHoursItems } = require('../src/services/queueStageService');
const { durationMinutes, assertFits } = require('../src/services/queueServiceHoursService');

test('contract 2 checks only the longest parallel line of the current stage', () => {
  const line = (lineId, stageId, durationMinutes, quantity = 1) => ({lineId, stageId, durationMinutes, quantity, serviceId: lineId, executionMode: 'parallel'});
  const plan = {contract_version: 2, items: [line('a','one',30,3), line('b','one',45), line('c','two',180)]};
  const items = currentStageHoursItems(plan, 'one');
  assert.equal(durationMinutes(items, {mode:'linear'}), 45);
  const window = {status:'open',observedAt:'2026-01-01T10:00:00Z',closesAt:'2026-01-01T10:44:00Z'};
  assert.throws(() => assertFits(window, durationMinutes(items, {mode:'linear'})), {code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
  assert.equal(plan.items[0].selectionId, undefined);
});

test('malformed contract 2 lines fail closed and selection contracts remain unchanged', () => {
  const line = {lineId:'a',stageId:'one',serviceId:'s',durationMinutes:30,quantity:1,executionMode:'parallel'};
  for (const invalid of [{...line,quantity:0},{...line,executionMode:'serial'},{...line,lineId:''},{...line,durationMinutes:0}]) {
    assert.throws(() => durationMinutes(currentStageHoursItems({contract_version:2,items:[invalid]},'one'),{mode:'linear'}));
  }
  assert.throws(() => durationMinutes(currentStageHoursItems({contract_version:2,items:[line]},'missing'),{mode:'linear'}));
  const selection = {selectionId:'x',stageId:'one',selectionKind:'resource'};
  assert.equal(currentStageHoursItems({contract_version:4,items:[selection]},'one')[0], selection);
});
