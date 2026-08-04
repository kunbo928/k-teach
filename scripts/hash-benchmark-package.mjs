import path from "node:path";

import { verifyBenchmarkPackage } from "../dist/live-benchmark.js";

const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const root = option("--root");
const name = option("--name");
const version = option("--version");
if (!root || !name || !version) throw new Error("Pass --root, --name, and --version.");
process.stdout.write(`${JSON.stringify(await verifyBenchmarkPackage(path.resolve(root), { name, version }))}\n`);
