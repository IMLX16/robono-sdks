import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "../..");
const packageNames = ["client", "server", "react-native", "web"];
const failures = [];

for (const directoryName of packageNames) {
  const packageDirectory = resolve(root, "packages", directoryName);
  const manifest = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDirectory,
    encoding: "utf8",
  });

  if (packed.status !== 0) {
    failures.push(
      `${manifest.name}: npm pack failed\n${packed.stderr || packed.stdout}`,
    );
    continue;
  }

  const jsonStart = packed.stdout.search(/\[\s*\{/);
  if (jsonStart < 0) {
    failures.push(`${manifest.name}: npm pack did not return a file manifest`);
    continue;
  }

  const [result] = JSON.parse(packed.stdout.slice(jsonStart));
  const files = new Set(result.files.map((file) => file.path));
  for (const required of [
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "SBOM.spdx.json",
    "dist/index.js",
    "dist/index.d.ts",
  ]) {
    if (!files.has(required)) {
      failures.push(`${manifest.name}: ${required} is missing from the package`);
    }
  }
  for (const file of files) {
    if (
      /(?:^|\/)(?:src|test|node_modules)(?:\/|$)/.test(file) ||
      /(?:^|\/)\.env(?:\.|$)/.test(file)
    ) {
      failures.push(`${manifest.name}: private development file ${file} is packaged`);
    }
  }

  const sbom = JSON.parse(
    readFileSync(resolve(packageDirectory, "SBOM.spdx.json"), "utf8"),
  );
  if (sbom.spdxVersion !== "SPDX-2.3") {
    failures.push(`${manifest.name}: packaged SBOM is not SPDX 2.3`);
  }

  console.log(
    `${manifest.name}@${manifest.version}: ${files.size} reviewed package files`,
  );
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("All Robono SDK package contents passed.");
