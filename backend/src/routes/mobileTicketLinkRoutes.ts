/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const candidates = [
  path.resolve(__dirname, "../mobile/ticketLinkRoutes.js"),
  path.resolve(__dirname, "../../mobile/ticketLinkRoutes.js")
];
const routePath = candidates.find((candidate) => fs.existsSync(candidate));

if (!routePath) {
  throw new Error("Mobile ticket-link routes module is unavailable.");
}

const router = require(routePath);
export default router;
