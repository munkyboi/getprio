const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..");

test("developer host routes the read-only API reference", () => {
  const app = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");
  const reference = fs.readFileSync(path.join(frontendRoot, "src", "pages", "DeveloperReferencePage.tsx"), "utf8");
  const portal = fs.readFileSync(path.join(frontendRoot, "src", "pages", "DeveloperPortalPage.tsx"), "utf8");

  assert.match(app, /window\.location\.pathname === "\/reference"/);
  assert.match(app, /<DeveloperReferencePage \/>/);
  assert.match(reference, /https:\/\/api\.getprio\.online\/v1\/openapi\.json/);
  assert.match(reference, /Browser execution is disabled/);
  assert.match(portal, /href="\/reference"/);
});

test("developer host exposes the prototype workspace as an explicitly fictional preview", () => {
  const app = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");
  const prototype = fs.readFileSync(path.join(frontendRoot, "src", "pages", "prototypes", "DeveloperPortalPrototype.tsx"), "utf8");
  const prototypeStyles = fs.readFileSync(path.join(frontendRoot, "src", "pages", "prototypes", "DeveloperPortalPrototype.css"), "utf8");
  const portal = fs.readFileSync(path.join(frontendRoot, "src", "pages", "DeveloperPortalPage.tsx"), "utf8");

  assert.match(app, /window\.location\.pathname === "\/prototype"/);
  assert.match(app, /<DeveloperPortalPrototype \/>/);
  assert.match(prototype, /INTERACTIVE PROTOTYPE · FICTIONAL DATA · NO REAL ACCOUNTS OR PAYMENTS/);
  assert.match(prototypeStyles, /@import url\("\/fonts\/aleo\/aleo\.css"\)/);
  assert.match(prototypeStyles, /font-family:"Aleo",var\(--prio-heading-font\)/);
  assert.match(portal, /href="\/prototype"/);
  assert.doesNotMatch(prototype, /demoDeliveries|127 fictional deliveries|delivery-demo-/);
  assert.match(prototype, /No deliveries yet/);
});
