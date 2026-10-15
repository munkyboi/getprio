import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { readBoundedJson } from "./wait-time-dataset-contract.mjs";
import { evaluateResourceRefreshes } from "./resource-shadow-refresh-evaluation.mjs";

async function run() {
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!["--dataset", "--output"].includes(key) || !value || Object.hasOwn(options, key)) throw new Error("Invalid arguments.");
    options[key] = value;
  }
  if (!options["--dataset"] || !options["--output"]) throw new Error("Private input and new output required.");
  const { bytes } = await readBoundedJson(options["--dataset"], 8 * 1024 * 1024);
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  const report = { datasetSha256: createHash("sha256").update(bytes).digest("hex"), ...evaluateResourceRefreshes(data) };
  await writeFile(options["--output"], JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options["--output"], reportVersion: report.reportVersion,
    inputAttempts: report.inputAttempts, distinctWork: report.distinctWork, groups: report.groups.length,
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false }, null, 2));
}
run().catch(() => { console.error("Private resource refresh evaluation failed. Check format, bounds and new output path."); process.exitCode = 1; });
