import test from "node:test";
import assert from "node:assert/strict";

import {
  SETTINGS_SURFACES,
  buildDeleteAccountHelpText,
  buildSettingsAccountStateModel,
  createEmptySettingsDeleteDiagnosticsState,
  readSettingsDiagnosticsVisibility,
  resolveSettingsSurfaceFromFocus,
} from "../src/domains/settings/index.js";

test("settings surface catalog stays focused on clear user jobs", () => {
  assert.deepEqual(
    SETTINGS_SURFACES.map((surface) => surface.key),
    ["account", "profile", "goals", "baselines", "programs", "preferences", "advanced"]
  );
  assert.equal(SETTINGS_SURFACES.find((surface) => surface.key === "programs")?.label, "Plan layers");
  assert.equal(SETTINGS_SURFACES.find((surface) => surface.key === "advanced")?.label, "Devices");
});

test("focus routing sends old aliases to the right settings surface", () => {
  assert.equal(resolveSettingsSurfaceFromFocus("metrics"), "baselines");
  assert.equal(resolveSettingsSurfaceFromFocus("appearance"), "preferences");
  assert.equal(resolveSettingsSurfaceFromFocus("styles"), "programs");
  assert.equal(resolveSettingsSurfaceFromFocus(""), "account");
  assert.equal(resolveSettingsSurfaceFromFocus("unknown"), "account");
});

test("protected diagnostics stay hidden unless debug mode and an explicit staff flag are both present", () => {
  assert.equal(readSettingsDiagnosticsVisibility({
    debugMode: false,
    hostname: "localhost",
    locationSearch: "?diagnostics=1",
    storedDiagnosticsFlag: "1",
  }), false);
  assert.equal(readSettingsDiagnosticsVisibility({
    debugMode: true,
    hostname: "beta.forma.run",
    locationSearch: "?diagnostics=1",
    storedDiagnosticsFlag: "1",
  }), false);
  assert.equal(readSettingsDiagnosticsVisibility({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "?diagnostics=1",
    storedDiagnosticsFlag: "0",
  }), true);
  assert.equal(readSettingsDiagnosticsVisibility({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "",
    storedDiagnosticsFlag: "1",
  }), true);
  assert.equal(readSettingsDiagnosticsVisibility({
    debugMode: true,
    hostname: "localhost",
    locationSearch: "",
    storedDiagnosticsFlag: "0",
  }), false);
});

test("account state model keeps signed-out settings copy consumer-friendly", () => {
  const model = buildSettingsAccountStateModel({
    authEmail: "",
    storageReason: "not_signed_in",
    syncStateModel: {
      headline: "Local-only mode",
      detail: "This device is running offline.",
      assurance: "Saved data stays on this browser until cloud sync returns.",
    },
  });

  assert.deepEqual(model.lifecycleSummaryCards.map((card) => card.id), ["identity", "cloud", "device"]);
  assert.equal(model.accountIdentityState.label, "No account connected");
  assert.equal(model.deviceLifecycleState.label, "Saved on this device");
  assert.match(model.lifecycleSummaryCards[2]?.detail || "", /signing out pauses account sync/i);
});

test("account state model shows reset devices as blank starts", () => {
  const model = buildSettingsAccountStateModel({
    authEmail: "athlete@example.com",
    storageReason: "device_reset",
    syncStateModel: {
      headline: "Cloud pending",
      detail: "Cloud has not reloaded yet.",
      assurance: "Local backup still exists.",
    },
  });

  assert.equal(model.accountIdentityState.label, "Signed-in account");
  assert.equal(model.accountIdentityState.detail, "athlete@example.com");
  assert.equal(model.deviceLifecycleState.label, "Fresh on this device");
  assert.match(model.accountSyncState.label, /cloud pending/i);
});

test("delete diagnostics helper starts empty and keeps fallback help consumer-friendly", () => {
  const initialState = createEmptySettingsDeleteDiagnosticsState();

  assert.deepEqual(initialState, {
    loading: false,
    checked: false,
    configured: null,
    message: "",
    detail: "",
    fix: "",
    missing: [],
    required: [],
  });
  assert.match(buildDeleteAccountHelpText(initialState), /sign out or reset this device/i);
  assert.equal(buildDeleteAccountHelpText({ configured: true }), "");
});
