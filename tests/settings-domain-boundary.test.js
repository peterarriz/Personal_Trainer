import test from "node:test";
import assert from "node:assert/strict";

import * as settingsDomain from "../src/domains/settings/index.js";

test("settings domain public boundary exposes the owned settings surfaces and hooks", () => {
  const expectedFunctionExports = [
    "SettingsAccountSection",
    "SettingsAdvancedSection",
    "SettingsBaselinesSection",
    "SettingsFieldRow",
    "SettingsGoalsSection",
    "SettingsPreferencesSection",
    "SettingsProfileSection",
    "SettingsProgramsSection",
    "SettingsSurfaceNav",
    "useSettingsDeleteDiagnostics",
    "useSettingsScreenState",
    "buildSettingsAccountStateModel",
    "buildDeleteAccountHelpText",
    "resolveSettingsSurfaceFromFocus",
    "readSettingsDiagnosticsVisibility",
  ];

  expectedFunctionExports.forEach((name) => {
    assert.equal(typeof settingsDomain[name], "function", `Expected ${name} to be exported from the settings domain boundary`);
  });

  assert.ok(Array.isArray(settingsDomain.SETTINGS_SURFACES));
  assert.deepEqual(
    settingsDomain.SETTINGS_SURFACES.map((surface) => surface.key),
    ["account", "profile", "goals", "baselines", "programs", "preferences", "advanced"]
  );
  const preferenceSurface = settingsDomain.SETTINGS_SURFACES.find((surface) => surface.key === "preferences");
  assert.equal(preferenceSurface?.label, "Preferences");
  assert.match(preferenceSurface?.helper || "", /appearance|reminder/i);
});
