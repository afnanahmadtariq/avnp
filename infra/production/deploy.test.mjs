import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const deployScript = resolve("infra/production/deploy.sh");

const executable = async (path, contents) => {
  await writeFile(path, contents);
  await chmod(path, 0o700);
};

const exists = async (path) => {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const createFixture = async (
  t,
  {
    availableKilobytes = 2_097_152,
    imageList = "",
    previousImage,
    pullFailures = 0,
    upFailures = 0,
  } = {},
) => {
  const root = await mkdtemp(join(tmpdir(), "relay-deploy-test-"));
  const bin = join(root, "bin");
  const deployPath = join(root, "deploy");
  const dockerRoot = join(root, "docker");
  const dockerLog = join(root, "docker.log");
  const pullCount = join(root, "pull-count");
  const upCount = join(root, "up-count");

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  await mkdir(bin);
  await mkdir(deployPath);
  await mkdir(dockerRoot);
  await writeFile(join(deployPath, ".env"), "NODE_ENV=production\n");
  await writeFile(join(deployPath, "compose.yaml"), "name: relay-test\n");
  await writeFile(join(deployPath, "Caddyfile"), "localhost\n");

  if (previousImage) {
    await writeFile(
      join(deployPath, ".release.env"),
      `RELAY_IMAGE=${previousImage}\nRELAY_ENV_FILE=.env\n`,
    );
  }

  await executable(
    join(bin, "docker"),
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$MOCK_DOCKER_LOG"

if test "\${1:-}" = info; then
  printf '%s\n' "$MOCK_DOCKER_ROOT"
  exit 0
fi

if test "\${1:-}" = system && test "\${2:-}" = df; then
  printf '%s\n' 'TYPE TOTAL ACTIVE SIZE RECLAIMABLE'
  exit 0
fi

if test "\${1:-}" = image && test "\${2:-}" = ls; then
  printf '%s\n' "\${MOCK_IMAGE_LIST:-}"
  exit 0
fi

if test "\${1:-}" = image; then
  exit 0
fi

case " $* " in
  *" pull --quiet "*)
    count=0
    test ! -s "$MOCK_PULL_COUNT" || count=$(cat "$MOCK_PULL_COUNT")
    count=$((count + 1))
    printf '%s\n' "$count" > "$MOCK_PULL_COUNT"
    test "$count" -gt "$MOCK_PULL_FAILURES"
    ;;
  *" up --pull never "*)
    count=0
    test ! -s "$MOCK_UP_COUNT" || count=$(cat "$MOCK_UP_COUNT")
    count=$((count + 1))
    printf '%s\n' "$count" > "$MOCK_UP_COUNT"
    test "$count" -gt "$MOCK_UP_FAILURES"
    ;;
esac
`,
  );

  await executable(
    join(bin, "df"),
    `#!/bin/sh
set -eu
if test "\${1:-}" = -Pk; then
  printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
  printf 'mock 4194304 1 %s 1%% /mock\n' "$MOCK_AVAILABLE_KB"
else
  printf '%s\n' 'Filesystem Size Used Avail Use% Mounted on'
  printf '%s\n' 'mock 4G 1G 3G 25% /mock'
fi
`,
  );

  await executable(
    join(bin, "timeout"),
    `#!/bin/sh
set -eu
shift
exec "$@"
`,
  );

  await executable(
    join(bin, "sleep"),
    `#!/bin/sh
exit 0
`,
  );

  const environment = {
    ...process.env,
    MOCK_AVAILABLE_KB: String(availableKilobytes),
    MOCK_DOCKER_LOG: dockerLog,
    MOCK_DOCKER_ROOT: dockerRoot,
    MOCK_IMAGE_LIST: imageList,
    MOCK_PULL_COUNT: pullCount,
    MOCK_PULL_FAILURES: String(pullFailures),
    MOCK_UP_COUNT: upCount,
    MOCK_UP_FAILURES: String(upFailures),
    PATH: `${bin}:${process.env.PATH}`,
    RELAY_IMAGE: "ghcr.io/example/relay-runtime:new-sha",
    RELAY_IMAGE_SOURCE: "https://github.com/example/relay",
    RELAY_PULL_BACKOFF_SECONDS: "1",
    VM_DEPLOY_PATH: deployPath,
  };

  const run = async () =>
    execFileAsync("sh", [deployScript], {
      env: environment,
      timeout: 10_000,
    });

  const dockerCommands = async () =>
    (await readFile(dockerLog, "utf8")).trim().split("\n");

  return { deployPath, dockerCommands, pullCount, run, upCount };
};

test("promotes a healthy release and preserves the prior release", async (t) => {
  const previousImage = "ghcr.io/example/relay-runtime:previous-sha";
  const fixture = await createFixture(t, {
    imageList: `${previousImage}\nghcr.io/example/relay-runtime:stale-sha`,
    previousImage,
  });

  await fixture.run();

  assert.equal(
    await readFile(join(fixture.deployPath, ".release.env"), "utf8"),
    "RELAY_IMAGE=ghcr.io/example/relay-runtime:new-sha\nRELAY_ENV_FILE=.env\n",
  );
  assert.equal(
    await readFile(join(fixture.deployPath, ".release.env.previous"), "utf8"),
    `RELAY_IMAGE=${previousImage}\nRELAY_ENV_FILE=.env\n`,
  );
  assert.equal(
    await exists(join(fixture.deployPath, ".release.env.next")),
    false,
  );

  const commands = await fixture.dockerCommands();
  assert.ok(commands.some((command) => command.includes("pull --quiet")));
  assert.ok(commands.some((command) => command.includes("up --pull never")));
  assert.ok(
    commands.some(
      (command) =>
        command === "image rm ghcr.io/example/relay-runtime:stale-sha",
    ),
  );
  assert.ok(
    !commands.some((command) => command === `image rm ${previousImage}`),
  );
});

test("retries transient image pull failures", async (t) => {
  const fixture = await createFixture(t, { pullFailures: 2 });

  await fixture.run();

  assert.equal(await readFile(fixture.pullCount, "utf8"), "3\n");
  assert.equal(await readFile(fixture.upCount, "utf8"), "1\n");
});

test("leaves the running release untouched after permanent pull failure", async (t) => {
  const previousImage = "ghcr.io/example/relay-runtime:previous-sha";
  const fixture = await createFixture(t, { previousImage, pullFailures: 5 });

  await assert.rejects(fixture.run(), (error) => error.code === 1);

  assert.equal(
    await readFile(join(fixture.deployPath, ".release.env"), "utf8"),
    `RELAY_IMAGE=${previousImage}\nRELAY_ENV_FILE=.env\n`,
  );
  assert.equal(
    await exists(join(fixture.deployPath, ".release.env.next")),
    false,
  );
  assert.equal(await exists(fixture.upCount), false);
  assert.equal(await readFile(fixture.pullCount, "utf8"), "3\n");
});

test("fails before pulling when Docker storage is below the safety floor", async (t) => {
  const fixture = await createFixture(t, { availableKilobytes: 524_288 });

  await assert.rejects(fixture.run(), (error) => error.code === 1);

  assert.equal(await exists(fixture.pullCount), false);
  assert.equal(
    await exists(join(fixture.deployPath, ".release.env.next")),
    false,
  );
});

test("restores the previous release after health checks fail", async (t) => {
  const previousImage = "ghcr.io/example/relay-runtime:previous-sha";
  const fixture = await createFixture(t, { previousImage, upFailures: 1 });

  await assert.rejects(fixture.run(), (error) => error.code === 1);

  assert.equal(await readFile(fixture.upCount, "utf8"), "2\n");
  assert.equal(
    await readFile(join(fixture.deployPath, ".release.env"), "utf8"),
    `RELAY_IMAGE=${previousImage}\nRELAY_ENV_FILE=.env\n`,
  );
  assert.equal(
    await exists(join(fixture.deployPath, ".release.env.next")),
    false,
  );
});
