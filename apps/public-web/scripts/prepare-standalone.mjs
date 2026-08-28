import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimePackages = ["react", "react-dom", "scheduler", "styled-jsx"];

for (const packageName of runtimePackages) {
  const packageJson = require.resolve(`${packageName}/package.json`);
  const source = path.dirname(packageJson);
  const destination = path.resolve(
    ".next/standalone/node_modules",
    packageName,
  );

  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  console.log(`Copied ${packageName} into ${destination}`);
}
