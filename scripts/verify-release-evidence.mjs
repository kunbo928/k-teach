import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyReleaseEvidence } from "../dist/release-evidence.js";

const index = process.argv.indexOf("--evidence");
const evidencePath = index >= 0 ? process.argv[index + 1] : undefined;
if (!evidencePath) throw new Error("Pass --evidence <release-evidence.json>.");
const evidence = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
const result = verifyReleaseEvidence(evidence);
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.verified) process.exitCode = 1;
