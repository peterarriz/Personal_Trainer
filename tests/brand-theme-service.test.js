import test from "node:test";
import assert from "node:assert/strict";

import {
  BRAND_THEME_IDS,
  BRAND_THEME_OPTIONS,
  buildBrandThemeState,
} from "../src/services/brand-theme-service.js";

test("brand theme catalog exposes 10 curated theme options with matching ids", () => {
  assert.equal(BRAND_THEME_IDS.length, 10);
  assert.equal(BRAND_THEME_OPTIONS.length, 10);
  assert.deepEqual(
    [...BRAND_THEME_IDS].sort(),
    BRAND_THEME_OPTIONS.map((option) => option.id).sort()
  );
});

test("every curated theme resolves to distinct dark and light token signatures", () => {
  const darkSignatures = new Set();
  const lightSignatures = new Set();

  BRAND_THEME_IDS.forEach((themeId) => {
    const darkState = buildBrandThemeState({
      appearance: { theme: themeId, mode: "Dark" },
      systemPrefersDark: true,
    });
    const lightState = buildBrandThemeState({
      appearance: { theme: themeId, mode: "Light" },
      systemPrefersDark: false,
    });

    const darkSignature = [
      darkState.cssVars["--bg"],
      darkState.cssVars["--surface-1"],
      darkState.cssVars["--brand-accent"],
      darkState.cssVars["--cta-bg"],
      darkState.cssVars["--font-display"],
    ].join("|");
    const lightSignature = [
      lightState.cssVars["--bg"],
      lightState.cssVars["--surface-1"],
      lightState.cssVars["--brand-accent"],
      lightState.cssVars["--cta-bg"],
      lightState.cssVars["--font-display"],
    ].join("|");

    darkSignatures.add(darkSignature);
    lightSignatures.add(lightSignature);
  });

  assert.equal(darkSignatures.size, BRAND_THEME_IDS.length);
  assert.equal(lightSignatures.size, BRAND_THEME_IDS.length);
});

test("Atlas and Circuit stay materially distinct in both accent and canvas", () => {
  const atlasDark = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "Dark" },
    systemPrefersDark: true,
  });
  const circuitDark = buildBrandThemeState({
    appearance: { theme: "Circuit", mode: "Dark" },
    systemPrefersDark: true,
  });
  const atlasLight = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "Light" },
    systemPrefersDark: false,
  });
  const circuitLight = buildBrandThemeState({
    appearance: { theme: "Circuit", mode: "Light" },
    systemPrefersDark: false,
  });

  assert.notEqual(atlasDark.cssVars["--bg"], circuitDark.cssVars["--bg"]);
  assert.notEqual(atlasDark.cssVars["--brand-accent"], circuitDark.cssVars["--brand-accent"]);
  assert.notEqual(atlasLight.cssVars["--bg"], circuitLight.cssVars["--bg"]);
  assert.notEqual(atlasLight.cssVars["--brand-accent"], circuitLight.cssVars["--brand-accent"]);
});

test("System mode follows OS preference while explicit Dark and Light remain intentionally separate", () => {
  const atlasSystemDark = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "System" },
    systemPrefersDark: true,
  });
  const atlasSystemLight = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "System" },
    systemPrefersDark: false,
  });
  const atlasDark = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "Dark" },
    systemPrefersDark: false,
  });
  const atlasLight = buildBrandThemeState({
    appearance: { theme: "Atlas", mode: "Light" },
    systemPrefersDark: true,
  });

  assert.equal(atlasSystemDark.resolvedMode, "Dark");
  assert.equal(atlasSystemLight.resolvedMode, "Light");
  assert.equal(atlasSystemDark.cssVars["--brand-accent"], atlasDark.cssVars["--brand-accent"]);
  assert.equal(atlasSystemLight.cssVars["--brand-accent"], atlasLight.cssVars["--brand-accent"]);
  assert.notEqual(atlasDark.cssVars["--bg"], atlasLight.cssVars["--bg"]);
  assert.notEqual(atlasDark.cssVars["--panel"], atlasLight.cssVars["--panel"]);
});
