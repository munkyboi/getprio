const test = require('node:test');
const assert = require('node:assert/strict');
const { servedTicketIntervals } = require('../src/vendor/reportState.ts');
test('recorded intervals sort actual served updates, keep simultaneous zero, and omit invalid or unserved records',()=>{
 const records=[{ticketNumber:'B',status:'served',updatedAt:'2026-10-14T00:01:30Z'},{ticketNumber:'A',status:'served',updatedAt:'2026-10-14T00:00:00Z'},{ticketNumber:'C',status:'served',updatedAt:'2026-10-14T00:01:30Z'},{ticketNumber:'bad',status:'served',updatedAt:'invalid'},{ticketNumber:'waiting',status:'waiting',updatedAt:'2026-10-14T00:00:30Z'}];
 assert.deepEqual(servedTicketIntervals(records),[{label:'B',minutes:1.5},{label:'C',minutes:0}]);
 assert.deepEqual(servedTicketIntervals(records,2),[{label:'C',minutes:0}]);
 assert.deepEqual(servedTicketIntervals(records.slice(0,1)),[]);
 assert.equal(records[0].ticketNumber,'B');
});
