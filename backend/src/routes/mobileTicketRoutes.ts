/* eslint-disable @typescript-eslint/no-require-imports */
import fs from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve(__dirname, "../mobile/ticketRoutes.js"),
  path.resolve(__dirname, "../../mobile/ticketRoutes.js")
];
const routePath = candidates.find((candidate) => fs.existsSync(candidate));

if (!routePath) throw new Error("Mobile ticket routes module is unavailable.");

const router = require(routePath);
export default router;
