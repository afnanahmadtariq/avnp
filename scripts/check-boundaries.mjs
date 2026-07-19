import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();
const workspaceGroups = ["apps", "packages"];
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".mjs",
  ".mts",
  ".ts",
  ".vue",
]);
const ignoredDirectories = new Set([
  ".nuxt",
  ".output",
  ".turbo",
  "coverage",
  "dist",
  "generated",
  "node_modules",
]);
const serverOnlyPackages = new Set([
  "@relay/database",
  "@relay/integrations",
  "@relay/queue",
  "@relay/runtime-config",
]);
const issues = [];

function extension(file) {
  const index = file.lastIndexOf(".");
  return index < 0 ? "" : file.slice(index);
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (sourceExtensions.has(extension(entry.name))) files.push(path);
  }
  return files;
}

const workspaces = [];
for (const group of workspaceGroups) {
  const groupDirectory = join(repositoryRoot, group);
  for (const entry of await readdir(groupDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(groupDirectory, entry.name);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    workspaces.push({ directory, group, manifest });
  }
}

const byName = new Map();
for (const workspace of workspaces) {
  const name = workspace.manifest.name;
  if (typeof name !== "string" || !name.startsWith("@relay/")) {
    issues.push(
      `${relative(repositoryRoot, workspace.directory)} has an invalid package name.`,
    );
    continue;
  }
  if (byName.has(name)) issues.push(`Duplicate workspace name: ${name}.`);
  byName.set(name, workspace);
  if (workspace.manifest.private !== true) {
    issues.push(`${name} must remain private.`);
  }
  if (workspace.manifest.license !== "UNLICENSED") {
    issues.push(`${name} must use the UNLICENSED private-project marker.`);
  }
}

for (const workspace of workspaces) {
  const { directory, group, manifest } = workspace;
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };

  for (const [dependency, version] of Object.entries(dependencies)) {
    if (!dependency.startsWith("@relay/")) continue;
    const target = byName.get(dependency);
    if (!target) {
      issues.push(`${manifest.name} declares unknown workspace ${dependency}.`);
      continue;
    }
    if (version !== "workspace:*" && dependency !== manifest.name) {
      issues.push(
        `${manifest.name} must pin ${dependency} through workspace:*.`,
      );
    }
    if (group === "packages" && target.group === "apps") {
      issues.push(
        `${manifest.name} cannot depend on application ${dependency}.`,
      );
    }
    if (manifest.name === "@relay/web" && serverOnlyPackages.has(dependency)) {
      issues.push(
        `@relay/web cannot depend on server-only package ${dependency}.`,
      );
    }
  }

  for (const file of await sourceFiles(directory)) {
    const body = await readFile(file, "utf8");
    if (body.includes("@avnp/")) {
      issues.push(
        `${relative(repositoryRoot, file)} still imports the retired AVNP scope.`,
      );
    }
    if (group === "packages" && /(?:^|["'`])(?:\.\.\/)+apps\//m.test(body)) {
      issues.push(
        `${relative(repositoryRoot, file)} crosses from a package into apps/.`,
      );
    }

    const relayImport = /["'](@relay\/[a-z0-9-]+)(?:\/[^"']*)?["']/gi;
    for (const match of body.matchAll(relayImport)) {
      const importedName = match[1];
      if (importedName === manifest.name) continue;
      if (!byName.has(importedName)) {
        issues.push(
          `${relative(repositoryRoot, file)} imports unknown ${importedName}.`,
        );
      } else if (!(importedName in dependencies)) {
        issues.push(
          `${relative(repositoryRoot, file)} imports undeclared workspace ${importedName}.`,
        );
      }
      if (
        manifest.name === "@relay/web" &&
        serverOnlyPackages.has(importedName)
      ) {
        issues.push(
          `${relative(repositoryRoot, file)} imports server-only ${importedName}.`,
        );
      }
    }
  }
}

if (issues.length > 0) {
  console.error(
    `Relay dependency-boundary validation failed:\n- ${issues.join("\n- ")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${workspaces.length} private Relay workspace boundaries.`,
  );
}
