const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const boundaries = require("../docs/architecture-boundaries.json");

const resolveFromRoot = (relativePath = "") => path.join(ROOT, relativePath.replaceAll("/", path.sep));

test("every user-facing domain declares exactly one public boundary, one state owner, and one primary test", () => {
  assert.ok(Array.isArray(boundaries));
  assert.ok(boundaries.length >= 7);

  const ids = new Set();
  const publicBoundaries = new Set();
  const primaryTests = new Set();

  boundaries.forEach((entry) => {
    assert.ok(entry.id, "Expected a domain id");
    assert.ok(!ids.has(entry.id), `Duplicate domain id: ${entry.id}`);
    ids.add(entry.id);

    assert.ok(entry.publicBoundary, `Missing public boundary for ${entry.id}`);
    assert.ok(!publicBoundaries.has(entry.publicBoundary), `Duplicate public boundary: ${entry.publicBoundary}`);
    publicBoundaries.add(entry.publicBoundary);
    assert.ok(fs.existsSync(resolveFromRoot(entry.publicBoundary)), `Missing public boundary file: ${entry.publicBoundary}`);

    assert.ok(entry.stateOwner?.file, `Missing state owner file for ${entry.id}`);
    assert.ok(fs.existsSync(resolveFromRoot(entry.stateOwner.file)), `Missing state owner file: ${entry.stateOwner.file}`);
    assert.ok(entry.stateOwner?.symbol, `Missing state owner symbol for ${entry.id}`);

    assert.ok(entry.primaryTest, `Missing primary test for ${entry.id}`);
    assert.ok(!primaryTests.has(entry.primaryTest), `Duplicate primary test entrypoint: ${entry.primaryTest}`);
    primaryTests.add(entry.primaryTest);
    assert.ok(fs.existsSync(resolveFromRoot(entry.primaryTest)), `Missing primary test file: ${entry.primaryTest}`);
  });
});
