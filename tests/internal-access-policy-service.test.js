import test from "node:test";
import assert from "node:assert/strict";

import {
  canExposeInternalOperatorTools,
  canExposeProtectedDiagnostics,
  canUseClientSuppliedAiKey,
  isTrustedLocalOperatorHost,
} from "../src/services/internal-access-policy-service.js";

test("trusted internal tooling is limited to localhost-style hosts", () => {
  assert.equal(isTrustedLocalOperatorHost({ hostname: "localhost" }), true);
  assert.equal(isTrustedLocalOperatorHost({ hostname: "127.0.0.1" }), true);
  assert.equal(isTrustedLocalOperatorHost({ hostname: "beta.forma.run" }), false);
});

test("internal operator tools stay hidden on non-local hosts even with debug flags", () => {
  assert.equal(canExposeInternalOperatorTools({
    debugMode: true,
    hostname: "beta.forma.run",
  }), false);
  assert.equal(canExposeInternalOperatorTools({
    debugMode: true,
    hostname: "localhost",
  }), true);
});

test("protected diagnostics need both a trusted host and an explicit diagnostics flag", () => {
  assert.equal(canExposeProtectedDiagnostics({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "?diagnostics=1",
    storedDiagnosticsFlag: "0",
  }), true);
  assert.equal(canExposeProtectedDiagnostics({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "",
    storedDiagnosticsFlag: "1",
  }), true);
  assert.equal(canExposeProtectedDiagnostics({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "",
    storedDiagnosticsFlag: "0",
  }), false);
});

test("client-supplied AI keys are disabled outside trusted local debug use", () => {
  assert.equal(canUseClientSuppliedAiKey({
    debugMode: false,
    hostname: "localhost",
  }), false);
  assert.equal(canUseClientSuppliedAiKey({
    debugMode: true,
    hostname: "beta.forma.run",
  }), false);
  assert.equal(canUseClientSuppliedAiKey({
    debugMode: true,
    hostname: "localhost",
  }), true);
});

