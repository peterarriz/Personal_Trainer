import test from "node:test";
import assert from "node:assert/strict";

import {
  BRAND_THEME_IDS,
  BRAND_THEME_OPTIONS,
  buildBrandThemePreviewModel,
  buildBrandThemeState,
} from "../src/services/brand-theme-service.js";

const parseColor = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = hex.split("");
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) return null;
  const [r, g, b] = rgbMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
};

const extractColors = (value) => String(value || "").match(/#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\([^)]*\)/g) || [];

const luminance = ({ r, g, b }) => {
  const normalize = (channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const [rr, gg, bb] = [normalize(r), normalize(g), normalize(b)];
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
};

const contrastRatio = (foreground, background) => {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  assert.ok(fg, `Expected parseable foreground color, received ${foreground}`);
  assert.ok(bg, `Expected parseable background color, received ${background}`);
  const fgLum = luminance(fg);
  const bgLum = luminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
};

test("brand theme catalog exposes 12 curated theme options with matching ids", () => {
  assert.equal(BRAND_THEME_IDS.length, 12);
  assert.equal(BRAND_THEME_OPTIONS.length, 12);
  assert.deepEqual(
    [...BRAND_THEME_IDS].sort(),
    BRAND_THEME_OPTIONS.map((option) => option.id).sort()
  );
});

test("brand theme preview families span materially different directions", () => {
  const families = new Set(BRAND_THEME_OPTIONS.map((option) => option.previewFamily));
  assert.ok(families.has("dashboard"));
  assert.ok(families.has("editorial"));
  assert.ok(families.has("journal"));
  assert.ok(families.has("scoreboard"));
  assert.ok(families.has("signal"));
  assert.ok(families.size >= 5);
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
      darkState.cssVars["--radius-lg"],
    ].join("|");
    const lightSignature = [
      lightState.cssVars["--bg"],
      lightState.cssVars["--surface-1"],
      lightState.cssVars["--brand-accent"],
      lightState.cssVars["--cta-bg"],
      lightState.cssVars["--font-display"],
      lightState.cssVars["--radius-lg"],
    ].join("|");

    darkSignatures.add(darkSignature);
    lightSignatures.add(lightSignature);
  });

  assert.equal(darkSignatures.size, BRAND_THEME_IDS.length);
  assert.equal(lightSignatures.size, BRAND_THEME_IDS.length);
});

test("every curated theme keeps body surfaces and CTA gradients above readable contrast", () => {
  BRAND_THEME_IDS.forEach((themeId) => {
    ["Dark", "Light"].forEach((mode) => {
      const themeState = buildBrandThemeState({
        appearance: { theme: themeId, mode },
        systemPrefersDark: mode === "Dark",
      });

      const surfaceRatio = contrastRatio(
        themeState.contrastPairs.surface.foreground,
        themeState.contrastPairs.surface.background
      );
      const strongSurfaceRatio = contrastRatio(
        themeState.contrastPairs.strongSurface.foreground,
        themeState.contrastPairs.strongSurface.background
      );

      assert.ok(surfaceRatio >= 4.5, `${themeId} ${mode} surface contrast dropped to ${surfaceRatio.toFixed(2)}`);
      assert.ok(strongSurfaceRatio >= 4.5, `${themeId} ${mode} strong-surface contrast dropped to ${strongSurfaceRatio.toFixed(2)}`);

      [themeState.cssVars["--cta-bg"], themeState.cssVars["--cta-bg-hover"]].forEach((gradientValue, index) => {
        const gradientStops = extractColors(gradientValue);
        assert.ok(gradientStops.length > 0, `Expected gradient stops for ${themeId} ${mode} CTA ${index}`);
        gradientStops.forEach((stopColor) => {
          const ratio = contrastRatio(themeState.cssVars["--cta-text"], stopColor);
          assert.ok(ratio >= 4.5, `${themeId} ${mode} CTA stop contrast dropped to ${ratio.toFixed(2)} for ${stopColor}`);
        });
      });
    });
  });
});

test("preview model carries mode labels and theme chrome into the appearance surface", () => {
  const systemTheme = buildBrandThemeState({
    appearance: { theme: "Canvas", mode: "System" },
    systemPrefersDark: false,
  });
  const previewModel = buildBrandThemePreviewModel({ brandThemeState: systemTheme });

  assert.equal(previewModel.id, "Canvas");
  assert.equal(previewModel.previewFamily, "editorial");
  assert.equal(previewModel.modeLabel, "System · Light");
  assert.equal(previewModel.swatches.length, 4);
  assert.ok(previewModel.chrome.radiusLg);
  assert.ok(previewModel.tokens.fontDisplay);
  assert.match(previewModel.headline, /paper|magazine|editorial|desk/i);
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
