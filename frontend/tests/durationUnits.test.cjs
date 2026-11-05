require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {durationUnitBounds,clampDurationUnits,sharedDurationUnitBounds,bundleDurationUnitBounds,quantityInputChanges} = require("../src/utils/durationUnits.ts");
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

test("customer quantity bounds respect the 24-hour ceiling without changing vendor settings",()=>{
  const twoHourService={...service(),durationMinutes:120};
  const bounds=durationUnitBounds(twoHourService);
  assert.deepEqual(bounds,{min:1,max:12});
  assert.equal(clampDurationUnits(13,bounds),12);
  assert.equal(bounds.max*twoHourService.durationMinutes,1440);
  assert.equal(twoHourService.bookingQuantityMax,24);
  assert.deepEqual(durationUnitBounds({...twoHourService,bookingQuantityMax:6}),{min:1,max:6});
  assert.deepEqual(durationUnitBounds({...twoHourService,bookingQuantityMax:undefined}),{min:1,max:12});
  assert.deepEqual(durationUnitBounds({...service(),durationMinutes:121}),{min:1,max:11});
  assert.deepEqual(durationUnitBounds({...service(),durationMinutes:1440}),{min:1,max:1});
  assert.deepEqual(durationUnitBounds({...service(3,3),durationMinutes:480}),{min:3,max:3});
});

test("parallel quantity intersections use each service's duration ceiling",()=>{
  const twoHourService=(min,max)=>({...service(min,max),durationMinutes:120});
  assert.deepEqual(sharedDurationUnitBounds([twoHourService(2,24),twoHourService(3,18)],"parallel"),{min:3,max:12});
  assert.deepEqual(sharedDurationUnitBounds([twoHourService(2,24),twoHourService(3,6)],"parallel"),{min:3,max:6});
  assert.equal(sharedDurationUnitBounds([twoHourService(2,3),twoHourService(4,24)],"parallel"),null);
});

test("disabling quantity input resets hidden inverted or invalid bounds",()=>{
  for(const [min,max] of [[10,5],[0,24],[2,25]]) {
    const value={bookingQuantityLabel:"Sessions",bookingQuantityMin:min,bookingQuantityMax:max};
    const disabled={...value,...quantityInputChanges(value,false)};
    assert.equal(disabled.allowBookingQuantity,false);
    assert.equal(disabled.bookingQuantityMin,1);
    assert.equal(disabled.bookingQuantityMax,24);
    const enabled={...disabled,...quantityInputChanges(disabled,true)};
    assert.equal(enabled.bookingQuantityLabel,"Sessions");
    assert.equal(enabled.bookingQuantityMin,1);
    assert.equal(enabled.bookingQuantityMax,24);
  }
});

test("shared quantities only affect selected services, preserving unselected catalog duration and price",()=>{
  const selected=[{...service(2,6),slug:"first"},{...service(3,4),slug:"second"}];
  const shared=sharedDurationUnitBounds(selected,"parallel");
  assert.deepEqual(shared,{min:3,max:4});
  for(const item of selected) {
    assert.deepEqual(bundleDurationUnitBounds(item,selected,shared),{min:3,max:4});
  }
  const unselected={...service(),slug:"single",allowBookingQuantity:false,priceCents:5000};
  const bounds=bundleDurationUnitBounds(unselected,selected,shared);
  assert.deepEqual(bounds,{min:1,max:1});
  const quantity=clampDurationUnits(3,bounds);
  assert.equal(quantity,1);
  assert.equal(unselected.durationMinutes*quantity,30);
  assert.equal(unselected.priceCents*quantity,5000);
  const optional={...service(1,8),slug:"optional"};
  assert.deepEqual(bundleDurationUnitBounds(optional,selected,shared),{min:1,max:8});
  assert.deepEqual(bundleDurationUnitBounds(selected[0],selected,null),{min:2,max:6});
});
