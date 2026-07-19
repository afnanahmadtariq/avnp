import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const HEALTH_PATH = "/api/v1/health";
const DENIED_CORS_ORIGIN = "https://cors-denied.invalid";
const REQUESTED_CORS_HEADERS = ["authorization", "content-type"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseHttpsOrigin(value, variableName) {
  invariant(
    typeof value === "string" && value.length > 0,
    `${variableName} is required.`,
  );

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid HTTPS origin.`);
  }

  invariant(url.protocol === "https:", `${variableName} must use HTTPS.`);
  invariant(
    url.username === "" && url.password === "",
    `${variableName} must not contain credentials.`,
  );
  invariant(
    url.pathname === "/" && url.search === "" && url.hash === "",
    `${variableName} must be an origin without a path, query, or fragment.`,
  );

  return url.origin;
}

export function validateExpectedVersion(value) {
  invariant(
    typeof value === "string" && /^[0-9a-f]{40}$/u.test(value),
    "RELAY_SMOKE_EXPECTED_VERSION must be a full lowercase Git commit SHA.",
  );
  return value;
}

function headerTokens(value) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
}

function sameTokens(actual, expected) {
  const actualTokens = headerTokens(actual);
  return (
    actualTokens.size === expected.length &&
    expected.every((token) => actualTokens.has(token))
  );
}

function assertSuccessfulResponse(response, label) {
  invariant(
    response.status >= 200 && response.status < 300,
    `${label} returned HTTP ${response.status}.`,
  );
}

function assertExactAllowedOrigin(response, webOrigin, label) {
  invariant(
    response.headers.get("access-control-allow-origin") === webOrigin,
    `${label} did not allow the exact web origin.`,
  );
  invariant(
    headerTokens(response.headers.get("vary")).has("origin"),
    `${label} must vary its response by Origin.`,
  );
}

async function safeFetch(fetchImpl, url, label, init = {}) {
  try {
    return await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "request error";
    throw new Error(`${label} could not be reached (${reason}).`);
  }
}

export function validateHealthBody(body, expectedVersion) {
  invariant(
    body !== null && typeof body === "object" && !Array.isArray(body),
    "API health did not return a JSON object.",
  );

  const expectedKeys = ["service", "status", "timestamp", "version"];
  invariant(
    sameTokens(Object.keys(body).join(","), expectedKeys),
    "API health returned an unexpected JSON shape.",
  );
  invariant(body.status === "ok", "API health status is not ok.");
  invariant(body.service === "api", "API health service is not api.");
  invariant(
    typeof body.timestamp === "string" &&
      !Number.isNaN(Date.parse(body.timestamp)),
    "API health timestamp is invalid.",
  );
  invariant(
    body.version === expectedVersion,
    "API health version does not match the expected release.",
  );
}

export async function runProductionSmoke(
  configuration,
  { fetchImpl = globalThis.fetch } = {},
) {
  const webOrigin = parseHttpsOrigin(
    configuration.webOrigin,
    "RELAY_SMOKE_WEB_ORIGIN",
  );
  const apiOrigin = parseHttpsOrigin(
    configuration.apiOrigin,
    "RELAY_SMOKE_API_ORIGIN",
  );
  const expectedVersion = validateExpectedVersion(
    configuration.expectedVersion,
  );
  invariant(webOrigin !== apiOrigin, "Web and API origins must be distinct.");

  const webResponse = await safeFetch(fetchImpl, webOrigin, "Web application", {
    headers: { accept: "text/html" },
  });
  assertSuccessfulResponse(webResponse, "Web application");
  invariant(
    webResponse.headers.get("content-type")?.includes("text/html"),
    "Web application did not return HTML.",
  );
  await webResponse.body?.cancel();
  console.log(`PASS web HTTPS (${new URL(webOrigin).host})`);

  const healthUrl = new URL(HEALTH_PATH, apiOrigin);
  const healthResponse = await safeFetch(fetchImpl, healthUrl, "API health", {
    headers: { accept: "application/json", origin: webOrigin },
  });
  invariant(
    healthResponse.status === 200,
    "API health did not return HTTP 200.",
  );
  invariant(
    healthResponse.headers.get("content-type")?.includes("application/json"),
    "API health did not return JSON.",
  );
  assertExactAllowedOrigin(healthResponse, webOrigin, "API health");

  let healthBody;
  try {
    healthBody = await healthResponse.json();
  } catch {
    throw new Error("API health returned malformed JSON.");
  }
  validateHealthBody(healthBody, expectedVersion);
  console.log(`PASS API HTTPS and health (${healthUrl.host})`);
  console.log(`PASS release version (${expectedVersion})`);

  const preflightResponse = await safeFetch(
    fetchImpl,
    healthUrl,
    "Allowed CORS preflight",
    {
      method: "OPTIONS",
      headers: {
        origin: webOrigin,
        "access-control-request-method": "GET",
        "access-control-request-headers": REQUESTED_CORS_HEADERS.join(","),
      },
    },
  );
  invariant(
    preflightResponse.status === 204,
    `Allowed CORS preflight returned HTTP ${preflightResponse.status}, not 204.`,
  );
  assertExactAllowedOrigin(
    preflightResponse,
    webOrigin,
    "Allowed CORS preflight",
  );
  invariant(
    headerTokens(
      preflightResponse.headers.get("access-control-allow-methods"),
    ).has("get"),
    "Allowed CORS preflight did not permit GET.",
  );
  invariant(
    sameTokens(
      preflightResponse.headers.get("access-control-allow-headers"),
      REQUESTED_CORS_HEADERS,
    ),
    "Allowed CORS preflight did not permit exactly the requested headers.",
  );
  await preflightResponse.body?.cancel();

  const deniedResponse = await safeFetch(
    fetchImpl,
    healthUrl,
    "Denied CORS preflight",
    {
      method: "OPTIONS",
      headers: {
        origin: DENIED_CORS_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": REQUESTED_CORS_HEADERS.join(","),
      },
    },
  );
  invariant(
    deniedResponse.headers.get("access-control-allow-origin") === null,
    "API CORS policy also allowed an untrusted origin.",
  );
  await deniedResponse.body?.cancel();
  console.log("PASS exact CORS allowlist");

  return { apiOrigin, expectedVersion, webOrigin };
}

function configurationFromEnvironment(environment) {
  return {
    apiOrigin: environment.RELAY_SMOKE_API_ORIGIN,
    expectedVersion: environment.RELAY_SMOKE_EXPECTED_VERSION,
    webOrigin: environment.RELAY_SMOKE_WEB_ORIGIN,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    await runProductionSmoke(configurationFromEnvironment(process.env));
    console.log("Production smoke checks passed without invoking providers.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Smoke check failed.";
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  }
}
