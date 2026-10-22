#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { timestamp, validateDataset } from "./wait-time-dataset-contract.mjs";
import { generateSyntheticDataset } from "./wait-time-simulator.mjs";

function optionsFrom(args) {
  const options = { seed: "42", tickets: "120", start: "2026-01-01T00:00:00Z" };
  const seen = new Set();
  const keys = new Map([["--seed", "seed"], ["--tickets-per-scenario", "tickets"], ["--start", "start"], ["--output", "output"]]);
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    if (!key || seen.has(key) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Unknown, duplicate, or missing simulation option.");
    seen.add(key);
    options[key] = args[index + 1];
  }
  if (!options.output) throw new Error("Use --output <new-private-file>; optional --seed, --tickets-per-scenario, --start.");
  options.seed = Number(options.seed);
  options.tickets = Number(options.tickets);
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error("Seed must be an unsigned 32-bit integer.");
  if (!Number.isInteger(options.tickets) || options.tickets < 1 || options.tickets > 2000) throw new Error("Use 1 to 2000 tickets per scenario.");
  timestamp(options.start);
  return options;
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const dataset = generateSyntheticDataset({ seed: options.seed, ticketsPerScenario: options.tickets, start: options.start });
  validateDataset(dataset, null, "synthetic");
  const output = JSON.stringify(dataset, null, 2);
  if (Buffer.byteLength(output) > 64 * 1024 * 1024) throw new Error("Synthetic output exceeds the dataset input limit.");
  await writeFile(options.output, output, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, source: dataset.source, provenance: dataset.provenance,
    simulatorVersion: dataset.simulation.simulatorVersion, seed: options.seed, from: dataset.from, to: dataset.to,
    scenarios: dataset.simulation.scenarios.map(({ name, issuedTickets, calledTickets, censoredTickets }) =>
      ({ name, issuedTickets, calledTickets, censoredTickets })),
    customerEstimateChanged: false, rolloutApproved: false }, null, 2));
}

try {
  await run();
} catch (error) {
  console.error("Offline queue simulation failed:", error.message);
  process.exitCode = 1;
}
