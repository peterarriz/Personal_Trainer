import crypto from "node:crypto";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_TEST_EMAIL", "SUPABASE_TEST_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const today = new Date().toISOString().split("T")[0];

const authHeaders = (token) => ({
  "Content-Type": "application/json",
  apikey: anonKey,
  Authorization: `Bearer ${token}`,
});

const signIn = async () => {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
};

const rest = async ({ method = "GET", path, token = anonKey, body }) => {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(method !== "GET" ? { Prefer: "return=representation,resolution=merge-duplicates" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
};

const marker = crypto.randomUUID().slice(0, 8);

const tableSpecs = [
  {
    table: "trainer_data",
    makeRow: (userId) => ({ id: `trainer_rls_${marker}`, user_id: userId, data: { marker } }),
    filter: (row) => `id=eq.${encodeURIComponent(row.id)}`,
    patch: { data: { marker, updated: true } },
  },
  {
    table: "goals",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, type: "strength", category: "strength", title: `RLS ${marker}`, target_value: 225, current_value: 185, target_date: today, priority: 1, status: "active" }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { title: `RLS ${marker} updated` },
  },
  {
    table: "plans",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, start_date: today, phase_boundaries: { base: [1, 4] }, status: "active" }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { status: "archived" },
  },
  {
    table: "sessions",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, date: today, type: "strength", prescription: { marker }, status: "scheduled" }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { status: "modified" },
  },
  {
    table: "session_logs",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, date: today, completion_status: "completed", feel_rating: 3, note: `RLS ${marker}`, exercises: [] }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { note: `RLS ${marker} updated` },
  },
  {
    table: "daily_checkins",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, date: today, sleep_score: 70, stress_score: 40, energy_score: 60, body_battery: 55, resting_hr: 52, garmin_readiness: 68 }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { energy_score: 65 },
  },
  {
    table: "garmin_data",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, date: today, body_battery_start: 60, sleep_hours: 7.2, sleep_score: 78, stress_score: 32, resting_hr: 51, steps: 8000, activities: [] }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { steps: 8500 },
  },
  {
    table: "nutrition_logs",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, date: today, protein_target: 180, carbs_target: 240, calories_target: 2400, water_oz_logged: 60, water_target: 100, reflection: "decent", supplement_log: [], weekly_inventory: {} }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { reflection: "on_track" },
  },
  {
    table: "my_places",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, name: `RLS ${marker}`, category: "restaurant", location_context: "test", menu_items: [] }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { category: "grocery" },
  },
  {
    table: "coach_memory",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, field_1: `RLS ${marker}`, field_2: "two", field_3: "three" }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { field_1: `RLS ${marker} updated` },
  },
  {
    table: "injury_flags",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, body_part: "knee", status: "watch", onset_date: today, active: true }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { status: "cleared" },
  },
  {
    table: "exercise_performance",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, exercise_name: `RLS ${marker}`, date: today, prescribed_weight: 100, actual_weight: 100, prescribed_reps: 5, actual_reps: 5, prescribed_sets: 3, actual_sets: 3, bodyweight_only: false }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { actual_reps: 6 },
  },
  {
    table: "push_subscriptions",
    makeRow: (userId) => ({ id: crypto.randomUUID(), user_id: userId, subscription: { endpoint: `https://example.com/${marker}` } }),
    filter: (row) => `id=eq.${row.id}`,
    patch: { subscription: { endpoint: `https://example.com/${marker}`, updated: true } },
  },
];

const main = async () => {
  const auth = await signIn();
  const userId = auth?.user?.id;
  const token = auth?.access_token;
  if (!userId || !token) throw new Error("Auth response missing user or token.");

  let failures = 0;

  for (const spec of tableSpecs) {
    const row = spec.makeRow(userId);
    const ownUserFilter = `user_id=eq.${userId}&select=*`;

    const anonRead = await rest({ path: `${spec.table}?${ownUserFilter}` });
    const anonReadPassed = anonRead.res.ok && Array.isArray(anonRead.json) && anonRead.json.length === 0;

    const anonInsert = await rest({ method: "POST", path: spec.table, body: row });
    const anonInsertPassed = !anonInsert.res.ok;

    const authInsert = await rest({ method: "POST", path: spec.table, token, body: row });
    const authInsertPassed = authInsert.res.ok;

    const authRead = await rest({ path: `${spec.table}?${spec.filter(row)}&select=*`, token });
    const authReadPassed = authRead.res.ok && Array.isArray(authRead.json) && authRead.json.length >= 1;

    const authUpdate = await rest({ method: "PATCH", path: `${spec.table}?${spec.filter(row)}`, token, body: spec.patch });
    const authUpdatePassed = authUpdate.res.ok;

    const authDelete = await rest({ method: "DELETE", path: `${spec.table}?${spec.filter(row)}`, token });
    const authDeletePassed = authDelete.res.ok;

    const passed = [anonReadPassed, anonInsertPassed, authInsertPassed, authReadPassed, authUpdatePassed, authDeletePassed].every(Boolean);
    if (!passed) failures += 1;

    console.log(`${passed ? "PASS" : "FAIL"} ${spec.table}`);
    if (!passed) {
      console.log(JSON.stringify({
        anonRead: { status: anonRead.res.status, body: anonRead.json },
        anonInsert: { status: anonInsert.res.status, body: anonInsert.json },
        authInsert: { status: authInsert.res.status, body: authInsert.json },
        authRead: { status: authRead.res.status, body: authRead.json },
        authUpdate: { status: authUpdate.res.status, body: authUpdate.json },
        authDelete: { status: authDelete.res.status, body: authDelete.json },
      }, null, 2));
    }
  }

  if (failures > 0) {
    console.error(`RLS smoke test failed for ${failures} table(s).`);
    process.exit(1);
  }

  console.log("All table RLS smoke tests passed.");
};

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
