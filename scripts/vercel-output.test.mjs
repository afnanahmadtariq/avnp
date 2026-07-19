import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("Turbo caches the complete Vercel Build Output API artifact", async () => {
  const [turboConfig, vercelConfig] = await Promise.all([
    readJson("turbo.json"),
    readJson("apps/web/vercel.json"),
  ]);

  const outputDirectory = vercelConfig.outputDirectory?.replace(/\/+$/u, "");
  assert.equal(outputDirectory, ".vercel/output");
  assert.ok(
    turboConfig.tasks?.build?.outputs?.includes(`${outputDirectory}/**`),
    `turbo.json must cache ${outputDirectory}/** so Vercel cache hits restore the deployable artifact`,
  );
});
