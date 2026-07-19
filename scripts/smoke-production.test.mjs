import assert from "node:assert/strict";
import test from "node:test";

import {
  parseHttpsOrigin,
  runProductionSmoke,
  validateExpectedVersion,
  validateHealthBody,
} from "./smoke-production.mjs";

const webOrigin = "https://relay.zerotools.online";
const apiOrigin = "https://api.zerotools.online";
const expectedVersion = "0123456789abcdef0123456789abcdef01234567";

function response(body, init, url) {
  const result = new Response(body, init);
  Object.defineProperty(result, "url", { value: url });
  return result;
}

test("requires a credential-free HTTPS origin", () => {
  assert.equal(parseHttpsOrigin(webOrigin, "WEB"), webOrigin);
  assert.throws(() => parseHttpsOrigin("http://relay.test", "WEB"), /HTTPS/u);
  assert.throws(
    () => parseHttpsOrigin("https://user:secret@relay.test", "WEB"),
    /credentials/u,
  );
  assert.throws(
    () => parseHttpsOrigin("https://relay.test/path?token=secret", "WEB"),
    /without a path/u,
  );
});

test("requires the immutable full Git release SHA", () => {
  assert.equal(validateExpectedVersion(expectedVersion), expectedVersion);
  assert.throws(
    () => validateExpectedVersion("0123456"),
    /full lowercase Git commit SHA/u,
  );
});

test("accepts only the strict health contract and expected release", () => {
  validateHealthBody(
    {
      service: "api",
      status: "ok",
      timestamp: "2026-07-19T12:00:00.000Z",
      version: expectedVersion,
    },
    expectedVersion,
  );

  assert.throws(
    () =>
      validateHealthBody(
        {
          service: "api",
          status: "ok",
          timestamp: "2026-07-19T12:00:00.000Z",
          version: "wrong-release",
        },
        expectedVersion,
      ),
    /does not match/u,
  );
});

test("checks web, health, exact CORS, and no provider route", async () => {
  const requests = [];
  const fakeFetch = async (input, init) => {
    const url = input instanceof URL ? input.href : String(input);
    requests.push({ init, url });

    if (new URL(url).origin === webOrigin) {
      return response("<html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      });
    }

    if (init.method === "OPTIONS") {
      const allowed = init.headers.origin === webOrigin;
      return response(null, {
        headers: allowed
          ? {
              "access-control-allow-headers": "authorization,content-type",
              "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
              "access-control-allow-origin": webOrigin,
              vary: "Origin, Access-Control-Request-Headers",
            }
          : {},
        status: 204,
      });
    }

    return response(
      JSON.stringify({
        service: "api",
        status: "ok",
        timestamp: "2026-07-19T12:00:00.000Z",
        version: expectedVersion,
      }),
      {
        headers: {
          "access-control-allow-origin": webOrigin,
          "content-type": "application/json; charset=utf-8",
          vary: "Origin",
        },
        status: 200,
      },
    );
  };

  await runProductionSmoke(
    { apiOrigin, expectedVersion, webOrigin },
    { fetchImpl: fakeFetch },
  );

  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(({ url }) => new URL(url).pathname),
    ["/", "/api/v1/health", "/api/v1/health", "/api/v1/health"],
  );
});

test("fails when an untrusted origin is allowed", async () => {
  const permissiveFetch = async (input, init) => {
    const url = input instanceof URL ? input.href : String(input);
    if (new URL(url).origin === webOrigin) {
      return response("<html></html>", {
        headers: { "content-type": "text/html" },
        status: 200,
      });
    }
    if (init.method === "OPTIONS") {
      return response(null, {
        headers: {
          "access-control-allow-headers": "authorization,content-type",
          "access-control-allow-methods": "GET",
          "access-control-allow-origin": init.headers.origin,
          vary: "Origin",
        },
        status: 204,
      });
    }
    return response(
      JSON.stringify({
        service: "api",
        status: "ok",
        timestamp: "2026-07-19T12:00:00.000Z",
        version: expectedVersion,
      }),
      {
        headers: {
          "access-control-allow-origin": webOrigin,
          "content-type": "application/json",
          vary: "Origin",
        },
        status: 200,
      },
    );
  };

  await assert.rejects(
    runProductionSmoke(
      { apiOrigin, expectedVersion, webOrigin },
      { fetchImpl: permissiveFetch },
    ),
    /untrusted origin/u,
  );
});
