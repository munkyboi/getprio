const test = require("node:test");
const assert = require("node:assert/strict");

const { handleCreateLocation, handleUpdateLocation } = require("../src/routes/vendorLocationHandlers");

test("vendor location creation forwards authenticated actor and server tenant", async () => {
  const tenant={_id:'9007199254740993'};const body={name:'Branch',tenantId:'other',actorUserId:'spoof'};
  const res={statusCode:null,body:null,status(value){this.statusCode=value;return this;},json(value){this.body=value;}};
  await handleCreateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant'},body},res,
    getAuthorizedTenant:async()=>tenant,assertTenantPermission:(_user,id,permission)=>{assert.equal(id,tenant._id);assert.equal(permission,'tenant.location.manage');},
    locationCreationService:{createVendorLocation:async(selected,payload,options)=>{assert.equal(selected,tenant);assert.equal(payload,body);assert.deepEqual(options,{actorUserId:'actor'});return {_id:'branch'};}},
    formatLocation:async(location,selected)=>{assert.equal(selected,tenant);return {id:location._id};}});
  assert.equal(res.statusCode,201);assert.deepEqual(res.body,{location:{id:'branch'}});
});

test("vendor location creation preserves domain quota rejection", async () => {
  await assert.rejects(handleCreateLocation({req:{user:{_id:'actor'},params:{tenantSlug:'tenant'},body:{}},res:{},getAuthorizedTenant:async()=>({_id:'1'}),assertTenantPermission:()=>{},
    locationCreationService:{createVendorLocation:async()=>{throw Object.assign(new Error('Active location limit exceeded'),{statusCode:403});}}}),{statusCode:403});
});

test("vendor location handlers create and update locations through injected services", async () => {
  const createdLocations = [];
  const updatedLocations = [];
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    }
  };

  const storeLocationRepository = {
    listLocationsByTenantId: async () => [],
    createLocation: async (location) => {
      createdLocations.push(location);
      return { _id: 2 };
    },
    createDefaultHours: async () => {},
    updateLocation: async (_locationId, changes) => {
      updatedLocations.push(changes);
      return { _id: 2, isActive: true };
    }
  };

  await handleCreateLocation({
    req: { user: { _id: "actor" }, params: { tenantSlug: "tenant" }, query: {}, body: { name: "Branch" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
    storeLocationRepository,
    locationCreationService: { createVendorLocation: async (tenant, body, options) => {
      assert.equal(tenant._id, 1);assert.equal(options.actorUserId,"actor");createdLocations.push(body);return {_id:2};
    } },
    normalizeLocationPayload: (body) => body,
    formatLocation: async () => ({ id: "2" })
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.location, { id: "2" });
  assert.equal(createdLocations[0].name, "Branch");

  const updateResponse = {
    statusCode: null,
    body: null,
    json(payload) {
      this.body = payload;
    }
  };

  await handleUpdateLocation({
    req: { user: {}, params: { tenantSlug: "tenant", locationSlug: "main" }, query: {}, body: { isActive: true } },
    res: updateResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
    storeLocationRepository,
    normalizeLocationPayload: (body) => body,
    formatLocation: async () => ({ id: "2" }),
    getLocationForTenant: async () => ({ _id: 2, slug: "main", isActive: false })
  });

  assert.deepEqual(updateResponse.body.location, { id: "2" });
  assert.equal(Object.prototype.hasOwnProperty.call(updatedLocations[0], "slug"), false);
});

test("vendor location handler rejects changing an established slug", async () => {
  await assert.rejects(
    () =>
      handleUpdateLocation({
        req: {
          user: {},
          params: { tenantSlug: "tenant", locationSlug: "main" },
          query: {},
          body: { name: "Main Branch", slug: "renamed" }
        },
        res: {},
        getAuthorizedTenant: async () => ({ _id: 1 }),
        assertTenantPermission: () => {},
        billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
        storeLocationRepository: { updateLocation: async () => ({}) },
        normalizeLocationPayload: (body) => body,
        formatLocation: async () => ({}),
        getLocationForTenant: async () => ({ _id: 2, slug: "main", isActive: true })
      }),
    (error) => error.statusCode === 400 && error.message === "Location slug cannot be changed after creation."
  );
});
