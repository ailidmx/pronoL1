import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const standaloneRoot = path.resolve(".next/standalone");
const packageJsonPath = path.join(standaloneRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

// SCSS tokens are consumed at build time and live outside the App Hosting app
// root. All other production dependencies must be installed inside the bundle:
// Next's file tracer misses dynamic imports used by styled-jsx and Firebase.
delete packageJson.dependencies["@prono-l1/design-tokens"];
delete packageJson.devDependencies;
delete packageJson.scripts;

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

execFileSync(
  "npm",
  [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-package-lock",
    "--workspaces=false",
  ],
  { cwd: standaloneRoot, stdio: "inherit" },
);
