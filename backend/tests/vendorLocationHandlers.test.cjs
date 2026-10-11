const test = require("node:test");
const assert = require("node:assert/strict");

const { handleCreateLocation, handleUpdateLocation } = require("../src/routes/vendorLocationHandlers");

test("vendor location creation forwards authenticated actor and server tenant", async () => {
  const tenant={_id:'9007199254740993'};const body={name:'Branch',tenantId:'other',actorUserId:'spoof'};
  const res={statusCode:null,body:null,status(value){this.statusCode=value;return this;},json(value){this.body=value;}};
  await handleCreateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant'},body},res,
    getAuthorizedTenant:async()=>tenant,assertTenantPermission:(_user,id,permission)=>{assert.equal(id,tenant._id);assert.equal(permission,'tenant.location.manage');},
    locationCatalogService:{createVendorLocation:async(selected,payload,options)=>{assert.equal(selected,tenant);assert.equal(payload,body);assert.deepEqual(options,{actorUserId:'actor'});return {_id:'branch'};}},
    formatLocation:async(location,selected)=>{assert.equal(selected,tenant);return {id:location._id};}});
  assert.equal(res.statusCode,201);assert.deepEqual(res.body,{location:{id:'branch'}});
});

test("vendor location creation preserves domain quota rejection", async () => {
  await assert.rejects(handleCreateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant'},body:{}},res:{},getAuthorizedTenant:async()=>({_id:'1'}),assertTenantPermission:()=>{},
    locationCatalogService:{createVendorLocation:async()=>{throw Object.assign(new Error('Active location limit exceeded'),{statusCode:403});}}}),{statusCode:403});
});

test("vendor location update forwards server tenant slug and actor and formats committed result", async () => {
  const tenant={_id:'9007199254740993'};const body={isActive:true,tenantId:'other',actorUserId:'spoof'};
  const res={body:null,json(value){this.body=value;}};
  await handleUpdateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant',locationSlug:'main'},body},res,
    getAuthorizedTenant:async()=>tenant,assertTenantPermission:(_user,id,permission)=>{assert.equal(id,tenant._id);assert.equal(permission,'tenant.location.manage');},
    locationCatalogService:{updateVendorLocation:async(selected,slug,payload,options)=>{assert.equal(selected,tenant);assert.equal(slug,'main');assert.equal(payload,body);assert.deepEqual(options,{actorUserId:'actor'});return {_id:'branch'};}},
    formatLocation:async(location,selected)=>{assert.equal(selected,tenant);return {id:location._id};}});
  assert.deepEqual(res.body,{location:{id:'branch'}});
});

test("vendor location update preserves domain error without responding", async () => {
  for(const statusCode of [400,403,404,409]) {
    await assert.rejects(handleUpdateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant',locationSlug:'main'},body:{}},res:{json:()=>assert.fail('error must not respond')},
      getAuthorizedTenant:async()=>({_id:'1'}),assertTenantPermission:()=>{},
      locationCatalogService:{updateVendorLocation:async()=>{throw Object.assign(new Error('Rejected'),{statusCode});}}}),{statusCode});
  }
});
