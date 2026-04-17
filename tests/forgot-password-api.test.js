const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATH = "../api/auth/forgot-password.js";

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

const createReq = ({ email = "athlete@example.com", redirectTo = "", ip = "203.0.113.9" } = {}) => {
  const body = JSON.stringify({
    email,
    ...(redirectTo ? { redirect_to: redirectTo } : {}),
  });
  return {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
};

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

test("forgot-password POST proxies to Supabase recover and returns a generic success message", async () => {
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({
      url,
      method: options.method || "GET",
      body: options.body || "",
    });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    };
  };

  await withEnv({
    SUPABASE_URL: "https://forma.example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
  }, async () => {
    const handler = loadHandler();
    const res = createRes();
    await handler(createReq({ redirectTo: "https://beta.forma.run/reset", ip: "203.0.113.10" }), res);
    const payload = readJson(res);
    assert.equal(res.statusCode, 202);
    assert.equal(payload.code, "password_reset_requested");
    assert.match(payload.message, /reset link will arrive shortly/i);
    assert.ok(fetchCalls.some((call) => /\/auth\/v1\/recover$/i.test(call.url) && call.method === "POST"));
  });

  delete global.fetch;
});

test("forgot-password POST rate limits repeated requests from the same IP", async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({}),
  });

  await withEnv({
    SUPABASE_URL: "https://forma.example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
  }, async () => {
    const handler = loadHandler();
    for (let index = 0; index < 5; index += 1) {
      const res = createRes();
      await handler(createReq({ ip: "203.0.113.11" }), res);
      assert.equal(res.statusCode, 202);
    }
    const limitedRes = createRes();
    await handler(createReq({ ip: "203.0.113.11" }), limitedRes);
    const payload = readJson(limitedRes);
    assert.equal(limitedRes.statusCode, 429);
    assert.equal(payload.code, "rate_limited");
  });

  delete global.fetch;
});
