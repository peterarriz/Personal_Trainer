const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATH = "../api/auth/delete-account.js";

const loadHandler = () => {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
};

const createRes = () => {
  const headers = {};
  let body = "";
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(value = "") {
      body = String(value || "");
      this.body = body;
    },
    headers,
    body,
  };
};

const readJson = (res) => JSON.parse(String(res.body || "{}"));

const withEnv = async (patch, run) => {
  const previous = {};
  Object.keys(patch).forEach((key) => {
    previous[key] = process.env[key];
    const nextValue = patch[key];
    if (nextValue === undefined || nextValue === null || nextValue === "") delete process.env[key];
    else process.env[key] = String(nextValue);
  });
  try {
    await run();
  } finally {
    Object.keys(patch).forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
};

test("delete-account GET reports missing deployment configuration before the user hits a broken flow", async () => {
  await withEnv({
    SUPABASE_URL: "https://forma.example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "",
  }, async () => {
    const handler = loadHandler();
    const req = { method: "GET", headers: {} };
    const res = createRes();

    await handler(req, res);

    const payload = readJson(res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.configured, false);
    assert.equal(payload.code, "delete_account_not_configured");
    assert.deepEqual(payload.missing, ["SUPABASE_SERVICE_ROLE_KEY"]);
    assert.match(payload.fix, /SUPABASE_SERVICE_ROLE_KEY/i);
  });
});

test("delete-account POST returns a structured not-configured response when permanent delete is unavailable", async () => {
  await withEnv({
    SUPABASE_URL: "https://forma.example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "",
  }, async () => {
    const handler = loadHandler();
    const req = {
      method: "POST",
      headers: {
        authorization: "Bearer user-access-token",
      },
    };
    const res = createRes();

    await handler(req, res);

    const payload = readJson(res);
    assert.equal(res.statusCode, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "delete_account_not_configured");
    assert.deepEqual(payload.missing, ["SUPABASE_SERVICE_ROLE_KEY"]);
    assert.match(payload.fix, /redeploy/i);
  });
});

test("delete-account POST deletes the signed-in auth user when the deployment is configured", async () => {
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({
      url,
      method: options.method || "GET",
      headers: options.headers || {},
    });
    if (/\/auth\/v1\/user$/i.test(url)) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "athlete@example.com" }),
      };
    }
    if (/\/auth\/v1\/admin\/users\//i.test(url)) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await withEnv({
    SUPABASE_URL: "https://forma.example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }, async () => {
    const handler = loadHandler();
    const req = {
      method: "POST",
      headers: {
        authorization: "Bearer user-access-token",
      },
    };
    const res = createRes();

    await handler(req, res);

    const payload = readJson(res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "delete_account_deleted");
    assert.equal(payload.userId, "11111111-1111-4111-8111-111111111111");
    assert.ok(fetchCalls.some((call) => /\/auth\/v1\/user$/i.test(call.url)));
    assert.ok(fetchCalls.some((call) => /\/auth\/v1\/admin\/users\//i.test(call.url) && call.method === "DELETE"));
    const deleteCall = fetchCalls.find((call) => /\/auth\/v1\/admin\/users\//i.test(call.url));
    assert.equal(deleteCall?.headers?.Authorization, "Bearer service-role-key");
  });

  delete global.fetch;
});
