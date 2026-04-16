import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_ACTION_VARIANTS,
  buildAuthEntryTheme,
  buildAuthEntryViewModel,
} from "../src/services/auth-entry-service.js";
import {
  BRAND_THEME_IDS,
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

const luminance = ({ r, g, b }) => {
  const normalize = (channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
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

test("auth entry view model exposes clear primary, secondary, and tertiary actions", () => {
  const model = buildAuthEntryViewModel({
    authMode: "signup",
    startupLocalResumeAvailable: true,
    authProviderUnavailable: false,
  });

  assert.equal(model.form.primaryAction.variant, AUTH_ACTION_VARIANTS.primary);
  assert.equal(model.localAction?.variant, AUTH_ACTION_VARIANTS.tertiary);
  assert.ok(model.form.modeOptions.every((option) => option.variant === AUTH_ACTION_VARIANTS.tertiary));
  assert.match(model.localAction?.description || "", /device|cloud/i);
  assert.equal(model.pathCards[0]?.id, "cloud");
  assert.equal(model.pathCards.length, 1);
  assert.match(model.localAction?.label || "", /use local data instead/i);
});

test("provider-unavailable auth model keeps the local path explicit as a fallback", () => {
  const model = buildAuthEntryViewModel({
    authMode: "signin",
    startupLocalResumeAvailable: false,
    authProviderUnavailable: true,
  });

  assert.ok(model.statusBadges.some((badge) => /cloud sign-in temporarily unavailable/i.test(badge)));
  assert.ok(model.localAction);
  assert.match(model.localAction?.description || "", /device|offline|local/i);
  assert.match(model.pathCards[0]?.description || "", /temporarily unavailable|offline/i);
  assert.match(model.localAction?.badge || "", /fallback/i);
  assert.equal(model.localAction?.variant, AUTH_ACTION_VARIANTS.tertiary);
});

test("auth entry theme keeps primary and local-secondary contrast safe across all curated themes", () => {
  BRAND_THEME_IDS.forEach((themeId) => {
    ["Dark", "Light"].forEach((mode) => {
      const brandThemeState = buildBrandThemeState({
        appearance: { theme: themeId, mode },
        systemPrefersDark: mode === "Dark",
      });
      const authTheme = buildAuthEntryTheme({ brandThemeState });
      const primaryRatio = contrastRatio(
        authTheme.contrastPairs.primary.foreground,
        authTheme.contrastPairs.primary.background
      );
      const secondaryRatio = contrastRatio(
        authTheme.contrastPairs.secondary.foreground,
        authTheme.contrastPairs.secondary.background
      );
      const localRatio = contrastRatio(
        authTheme.contrastPairs.local.foreground,
        authTheme.contrastPairs.local.background
      );

      assert.ok(primaryRatio >= 4.5, `${themeId} ${mode} primary contrast dropped to ${primaryRatio.toFixed(2)}`);
      assert.ok(secondaryRatio >= 4.5, `${themeId} ${mode} secondary contrast dropped to ${secondaryRatio.toFixed(2)}`);
      assert.ok(localRatio >= 4.5, `${themeId} ${mode} local contrast dropped to ${localRatio.toFixed(2)}`);
    });
  });
});
