require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  StaffManagement,
  staffControls,
} = require("../src/vendor/StaffManagement.tsx");
const member = {
  id: "staff",
  name: "Pat",
  email: "pat@example.invalid",
  phone: null,
  role: "staff",
  isActive: false,
  assignedCounterIds: ["other-branch"],
};

test("staff access preserves owner, self and admin restrictions", () => {
  assert.deepEqual(staffControls(member, "owner", true, false), {
    role: true,
    status: true,
    remove: true,
  });
  assert.deepEqual(staffControls(member, "admin", false, true), {
    role: false,
    status: true,
    remove: false,
  });
  assert.deepEqual(
    staffControls({ ...member, role: "owner" }, "admin", false, true),
    { role: false, status: false, remove: false },
  );
  assert.deepEqual(staffControls(member, "staff", true, false), {
    role: false,
    status: false,
    remove: false,
  });
  assert.deepEqual(staffControls(member, "other", false, false), {
    role: false,
    status: false,
    remove: false,
  });
});

test("cross-location counter assignments remain visible as unavailable rather than unassigned", () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffManagement, {
      members: [member],
      actorId: "owner",
      owner: true,
      admin: false,
      counters: [],
      countersAvailable: true,
      onRole() {},
      onStatus() {},
      onRemove() {},
    }),
  );
  assert.match(html, /Counter outside this location or unavailable/);
  assert.doesNotMatch(html, /No counters assigned/);
  assert.match(html, /Enable access for Pat/);
});

test("failed existing-account add keeps the draft and releases pending state for retry", async () => {
  const fs = require("node:fs"),
    path = require("node:path"),
    ts = require("typescript"),
    vm = require("node:vm");
  const source = fs.readFileSync(
    path.join(__dirname, "../src/pages/VendorDashboardPage.tsx"),
    "utf8",
  );
  const start = source.indexOf("  async function handleAddStaff("),
    end = source.indexOf("  async function handleUpdateStaffRole", start);
  const form = {};
  const calls = [];
  const context = {
    busyAction: "",
    staffQuery: { isPending: false, isError: false },
    staff: [member],
    staffSeatLimit: 3,
    staffForm: { email: "missing@example.invalid", role: "staff" },
    token: "fixture",
    selectedTenantSlug: "vendor",
    vendorDashboardOperations: {
      addStaff: async () => {
        throw Error("Existing account not found");
      },
    },
    setError: (value) => calls.push(["error", value]),
    setBusyAction: (value) => calls.push(["busy", value]),
    getErrorMessage: (error) => error.message,
    reloadStaff() {
      throw Error("Must not refresh after failure");
    },
    reloadBookings() {},
    unsavedForm: {
      current: {
        clear() {
          throw Error("Must retain failed draft");
        },
      },
    },
    setStaffDialogOpen() {
      throw Error("Must retain dialog");
    },
    setStaffForm() {
      throw Error("Must retain values");
    },
    showSuccessNotification() {
      throw Error("Must not report success");
    },
  };
  const fn = vm.runInNewContext(
    ts.transpileModule(source.slice(start, end) + "\nhandleAddStaff;", {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  await fn({ preventDefault() {}, currentTarget: form });
  assert.deepEqual(calls, [
    ["error", ""],
    ["busy", "staff-save"],
    ["error", "Existing account not found"],
    ["busy", ""],
  ]);
  context.staffSeatLimit = 1;
  calls.length = 0;
  await fn({ preventDefault() {}, currentTarget: form });
  assert.equal(calls.length, 0);
});
