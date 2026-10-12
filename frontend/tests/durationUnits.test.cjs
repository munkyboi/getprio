require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {durationUnitBounds,clampDurationUnits,sharedDurationUnitBounds} = require("../src/utils/durationUnits.ts");
const service = (min=1,max=24) => ({allowBookingQuantity:true,durationMinutes:30,bookingQuantityMin:min,bookingQuantityMax:max});
test("duration unit selectors default and clamp per service, including fixed quantities",()=>{
  assert.deepEqual(durationUnitBounds({allowBookingQuantity:true}),{min:1,max:24});
  assert.deepEqual(durationUnitBounds({...service(2,4),allowBookingQuantity:false}),{min:1,max:1});
  assert.equal(clampDurationUnits(1,durationUnitBounds(service(2,4))),2);
  assert.equal(clampDurationUnits(9,durationUnitBounds(service(2,4))),4);
  assert.equal(clampDurationUnits(1,durationUnitBounds(service(3,3))),3);
});
test("parallel unit synchronization uses the shared range and leaves disjoint services independent",()=>{
  assert.deepEqual(sharedDurationUnitBounds([service(2,6),service(3,4)],"parallel"),{min:3,max:4});
  assert.equal(sharedDurationUnitBounds([service(2,3),service(4,6)],"parallel"),null);
  assert.equal(sharedDurationUnitBounds([service(2,6),service(3,4)],"sequential"),null);
  assert.equal(sharedDurationUnitBounds([service(2,6),{...service(3,4),durationMinutes:60}],"parallel"),null);
});
