require("tsx/cjs");
const test=require("node:test");
const assert=require("node:assert/strict");
const {collectionPage}=require("../src/vendor/collectionState.ts");
const rows=Array.from({length:24},(_,i)=>({id:i,name:`Court ${i+1}`,active:i%2===0}));
const searchText=r=>r.name,statusOf=r=>r.active?"active":"inactive";
test("catalog filtering preserves source records and counts before paging",()=>{
 const page=collectionPage(rows," court ","active",2,searchText,statusOf);
 assert.equal(page.total,12);assert.equal(page.pages,2);assert.equal(page.start,11);assert.equal(page.end,12);
 assert.deepEqual(page.items.map(r=>r.id),[20,22]);assert.equal(page.items[0],rows[20]);assert.equal(rows.length,24);
});
test("refresh and narrowed matches clamp stale pages and keep empty distinct",()=>{
 const filtered=collectionPage(rows,"Court 24","",99,searchText,statusOf);
 assert.equal(filtered.page,1);assert.deepEqual(filtered.items,[rows[23]]);
 const empty=collectionPage(rows,"missing","",2,searchText,statusOf);
 assert.equal(empty.total,0);assert.equal(empty.start,0);assert.equal(empty.end,0);assert.equal(empty.page,1);
 assert.equal(collectionPage(rows.slice(0,3),"","",3,searchText,statusOf).page,1);
});
