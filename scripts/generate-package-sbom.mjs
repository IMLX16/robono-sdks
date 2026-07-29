import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const packageDirectory = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(packageDirectory, "package.json"), "utf8"),
);

if (
  typeof packageJson.name !== "string" ||
  !packageJson.name.startsWith("@robono/")
) {
  throw new Error("Run this script from a Robono SDK package directory.");
}

const generated = execFileSync(
  "npm",
  [
    "sbom",
    "--package-lock-only",
    "--omit=dev",
    "--sbom-format",
    "spdx",
  ],
  {
    cwd: packageDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const sbom = JSON.parse(generated);
const existingPath = join(packageDirectory, "SBOM.spdx.json");

// `npm sbom` uses the current time. Preserve the creation time while a package
// version is unchanged so that `npm pack` and CI do not dirty a clean checkout.
if (existsSync(existingPath)) {
  const existing = JSON.parse(readFileSync(existingPath, "utf8"));
  const existingVersion = existing.packages?.find(
    (entry) => entry.name === packageJson.name,
  )?.versionInfo;
  if (
    existingVersion === packageJson.version &&
    typeof existing.creationInfo?.created === "string"
  ) {
    sbom.creationInfo.created = existing.creationInfo.created;
  }
}

writeFileSync(
  existingPath,
  `${JSON.stringify(sbom, null, 2)}\n`,
  "utf8",
);

console.log(`Generated SPDX SBOM for ${packageJson.name}@${packageJson.version}.`);
