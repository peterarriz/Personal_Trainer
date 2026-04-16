const { expect } = require("@playwright/test");

const FAILURE_CLASSIFICATIONS = Object.freeze({
  trustBreak: "trust break",
  deadEnd: "dead end",
  contradiction: "contradiction",
  accessibilityBug: "accessibility bug",
  polishBug: "polish bug",
});

const normalizeSurfaceText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const registerAdversarialCase = async (testInfo, {
  classification = FAILURE_CLASSIFICATIONS.trustBreak,
  concern = "",
  surfaces = [],
  notes = [],
} = {}) => {
  const record = {
    classification,
    concern: normalizeSurfaceText(concern),
    surfaces: Array.isArray(surfaces) ? surfaces.filter(Boolean) : [],
    notes: (Array.isArray(notes) ? notes : [notes]).map((note) => normalizeSurfaceText(note)).filter(Boolean),
  };
  testInfo.annotations.push({
    type: "adversarial",
    description: `${record.classification}: ${record.concern || "skeptical-user regression"}`,
  });
  testInfo.annotations.push({
    type: "classification",
    description: record.classification,
  });
  if (record.surfaces.length) {
    testInfo.annotations.push({
      type: "surfaces",
      description: record.surfaces.join(", "),
    });
  }
  await testInfo.attach("adversarial-case", {
    body: Buffer.from(JSON.stringify(record, null, 2)),
    contentType: "application/json",
  });
  return record;
};

const captureAdversarialScreenshot = async (page, testInfo, name, locator = null) => {
  const target = locator || page;
  const screenshot = await target.screenshot({
    animations: "disabled",
    caret: "hide",
  });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
  return screenshot;
};

const measureContrast = async (locator) => locator.evaluate((node) => {
  const clamp = (value) => Math.max(0, Math.min(255, Number(value) || 0));
  const transparent = { r: 0, g: 0, b: 0, a: 0 };
  const white = { r: 255, g: 255, b: 255, a: 1 };

  const parseColor = (value = "") => {
    const text = String(value || "").trim().toLowerCase();
    if (!text || text === "transparent") return transparent;
    if (text.startsWith("#")) {
      const hex = text.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      if (hex.length === 6 || hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        };
      }
    }
    const match = text.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return transparent;
    const parts = match[1].split(",").map((part) => part.trim());
    return {
      r: clamp(parts[0]),
      g: clamp(parts[1]),
      b: clamp(parts[2]),
      a: parts[3] == null ? 1 : Math.max(0, Math.min(1, Number(parts[3]) || 0)),
    };
  };

  const blend = (foreground, background) => {
    const fg = foreground || transparent;
    const bg = background || white;
    const alpha = fg.a + (bg.a * (1 - fg.a));
    if (alpha <= 0) return transparent;
    return {
      r: (((fg.r * fg.a) + (bg.r * bg.a * (1 - fg.a))) / alpha),
      g: (((fg.g * fg.a) + (bg.g * bg.a * (1 - fg.a))) / alpha),
      b: (((fg.b * fg.a) + (bg.b * bg.a * (1 - fg.a))) / alpha),
      a: alpha,
    };
  };

  const cssColor = (value) => `rgb(${Math.round(value.r)}, ${Math.round(value.g)}, ${Math.round(value.b)})`;

  const luminance = ({ r, g, b }) => {
    const transform = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * transform(r)) + (0.7152 * transform(g)) + (0.0722 * transform(b));
  };

  const rootBackground = parseColor(getComputedStyle(document.documentElement).backgroundColor);
  const bodyBackground = parseColor(getComputedStyle(document.body).backgroundColor);
  let resolvedBackground = blend(rootBackground, white);
  resolvedBackground = blend(bodyBackground, resolvedBackground);

  const ancestry = [];
  let current = node;
  while (current) {
    ancestry.unshift(current);
    current = current.parentElement;
  }
  ancestry.forEach((element) => {
    resolvedBackground = blend(parseColor(getComputedStyle(element).backgroundColor), resolvedBackground);
  });

  const style = getComputedStyle(node);
  const foreground = blend(parseColor(style.color), resolvedBackground);
  const contrastRatio = (() => {
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(resolvedBackground);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  })();

  return {
    contrastRatio: Number(contrastRatio.toFixed(2)),
    color: cssColor(foreground),
    background: cssColor(resolvedBackground),
    fontSizePx: Number.parseFloat(style.fontSize || "0") || 0,
    fontWeight: Number.parseInt(style.fontWeight || "400", 10) || 400,
    opacity: Number.parseFloat(style.opacity || "1") || 1,
    isVisible: !(style.visibility === "hidden" || style.display === "none"),
  };
});

const expectReadableAction = async (locator, {
  minContrast = 4.5,
  allowLargeText = true,
} = {}) => {
  const contrast = await measureContrast(locator);
  const qualifiesAsLargeText = allowLargeText && (
    contrast.fontSizePx >= 24
    || (contrast.fontSizePx >= 18.5 && contrast.fontWeight >= 700)
  );
  const requiredContrast = qualifiesAsLargeText ? Math.min(minContrast, 3) : minContrast;
  expect(contrast.isVisible).toBe(true);
  expect(contrast.opacity).toBeGreaterThan(0.95);
  expect(contrast.contrastRatio).toBeGreaterThanOrEqual(requiredContrast);
  return contrast;
};

module.exports = {
  FAILURE_CLASSIFICATIONS,
  captureAdversarialScreenshot,
  expectReadableAction,
  measureContrast,
  normalizeSurfaceText,
  registerAdversarialCase,
};
