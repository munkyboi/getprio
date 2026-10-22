#!/usr/bin/env node
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { readBoundedJson } from "./wait-time-dataset-contract.mjs";
import { evaluateResourceServiceStarts } from "./resource-shadow-evaluation.mjs";

function optionsFrom(args) {
  const keys = new Map([["--dataset", "dataset"], ["--output", "output"]]);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    const value = args[index + 1];
    if (!key || Object.hasOwn(options, key) || !value || value.startsWith("--")) throw new Error("Use --dataset and --output exactly once each.");
    options[key] = value;
  }
  if (!options.dataset || !options.output) throw new Error("A private dataset and new output file are required.");
  return options;
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const { bytes } = await readBoundedJson(options.dataset, 8 * 1024 * 1024);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  const report = { datasetSha256: createHash("sha256").update(bytes).digest("hex"), ...evaluateResourceServiceStarts(value) };
  await writeFile(options.output, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, reportVersion: report.reportVersion,
    inputObservations: report.inputObservations, distinctWork: report.distinctWork, groups: report.groups.length,
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false }, null, 2));
}

run().catch(() => {
  console.error("Resource service-start evaluation failed. Check dataset format, bounds and new output path.");
  process.exitCode = 1;
});
