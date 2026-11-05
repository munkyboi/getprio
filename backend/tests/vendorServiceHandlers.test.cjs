const test = require("node:test");
const assert = require("node:assert/strict");

const { handleListServices, handleCreateService, handleUpdateService, handleDeleteService } = require("../src/routes/vendorServiceHandlers");

test("vendor service creation forwards authenticated actor and tenant and retains response", async () => {
  const tenant = { _id: "9007199254740993" };
  const body = { name: "Consultation", durationMinutes: 45, actorUserId: "spoof", tenantId: "neighbor" };
  const response = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await handleCreateService({
    req: { user: { _id: "actor" }, params: { tenantSlug: "tenant" }, body }, res: response,
    getAuthorizedTenant: async () => tenant,
    assertTenantPermission: (_user, id, permission) => { assert.equal(id, tenant._id); assert.equal(permission, "tenant.service.manage"); },
    serviceDeactivationService: { createVendorService: async (selected, payload, options) => {
      assert.equal(selected, tenant); assert.equal(payload, body); assert.deepEqual(options, { actorUserId: "actor" });
      return { service: { _id: "8", name: "Consultation", slug: "consultation", durationMinutes: 45, isActive: true }, locationServices: [{ serviceId: "8", locationId: "11" }] };
    } }
  });
  assert.equal(response.statusCode, 201); assert.equal(response.body.service.name, "Consultation");
  assert.deepEqual(response.body.locationServices, [{ serviceId: "8", locationId: "11" }]);
});

test("vendor service creation stops at denied route access or domain admission", async () => {
  let called = false;
  const request = { req: { user: { _id: "actor" }, params: { tenantSlug: "tenant" }, body: {} }, res: {},
    getAuthorizedTenant: async () => ({ _id: "1" }),
    assertTenantPermission: () => { throw Object.assign(new Error("Denied"), { statusCode: 403 }); },
    serviceDeactivationService: { createVendorService: async () => { called = true; throw Object.assign(new Error("Admission denied"), { statusCode: 403 }); } } };
  await assert.rejects(handleCreateService(request), { statusCode: 403 }); assert.equal(called, false);
  await assert.rejects(handleCreateService({ ...request, assertTenantPermission: () => {} }), { statusCode: 403 }); assert.equal(called, true);
});

test("vendor service handler deactivates services through the authenticated domain boundary", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleDeleteService({
    req: { user: { _id: "actor-1" }, params: { tenantSlug: "tenant", serviceSlug: "consultation" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    serviceDeactivationService: {
      deactivateVendorService: async (tenant, slug, options) => {
        assert.equal(tenant._id, 1); assert.equal(slug, "consultation");
        assert.deepEqual(options, { actorUserId: "actor-1" });
        return { _id: 8, slug: "consultation", isActive: false };
      }
    }
  });
  assert.equal(response.body.service.isActive, false);
});

test("service PATCH forwards authenticated scope and retains service and mapping response contracts", async () => {
  const response={json(payload){this.body=payload;}};
  const body={name:"Updated",isActive:false,actorUserId:"spoofed",tenantId:"foreign"};
  await handleUpdateService({req:{user:{_id:"actor-1"},params:{tenantSlug:"tenant",serviceSlug:"consultation"},body},res:response,
    getAuthorizedTenant:async ()=>({_id:"1"}),assertTenantPermission:()=>{},
    serviceDeactivationService:{updateVendorService:async (tenant,slug,payload,options)=>{
      assert.equal(tenant._id,"1");assert.equal(slug,"consultation");assert.equal(payload,body);assert.deepEqual(options,{actorUserId:"actor-1"});
      return {service:{_id:"8",slug,name:payload.name,isActive:false},locationServices:[{locationId:"10",serviceId:"8",capacity:2}]};
    }}});
  assert.equal(response.body.service.isActive,false);assert.equal(response.body.service.name,"Updated");assert.equal(response.body.locationServices[0].capacity,2);
});
