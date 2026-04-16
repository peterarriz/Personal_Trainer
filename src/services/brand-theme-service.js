const sanitizeText = (value = "", maxLength = 120) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const extractColorTokens = (value = "") => String(value || "").match(/#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\([^)]*\)/g) || [];

const parseThemeColor = (value = "") => {
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

const measureColorLuminance = ({ r, g, b }) => {
  const normalize = (channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const [rr, gg, bb] = [normalize(r), normalize(g), normalize(b)];
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
};

const measureContrastRatio = (foreground = "", background = "") => {
  const fg = parseThemeColor(foreground);
  const bg = parseThemeColor(background);
  if (!fg || !bg) return 0;
  const fgLum = measureColorLuminance(fg);
  const bgLum = measureColorLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
};

const formatThemeColor = ({ r = 0, g = 0, b = 0 } = {}) => {
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const mixThemeColor = (baseColor = null, targetColor = null, amount = 0) => {
  if (!baseColor || !targetColor) return baseColor;
  return {
    r: baseColor.r + ((targetColor.r - baseColor.r) * amount),
    g: baseColor.g + ((targetColor.g - baseColor.g) * amount),
    b: baseColor.b + ((targetColor.b - baseColor.b) * amount),
  };
};

const resolveAccessibleBackgroundColor = (backgroundColor = "", textColor = "", minimumRatio = 4.5) => {
  if (measureContrastRatio(textColor, backgroundColor) >= minimumRatio) return backgroundColor;
  const background = parseThemeColor(backgroundColor);
  const text = parseThemeColor(textColor);
  if (!background || !text) return backgroundColor;
  const lightenBackground = measureColorLuminance(text) < measureColorLuminance(background);
  const target = lightenBackground
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 };

  let bestColor = backgroundColor;
  for (let step = 1; step <= 28; step += 1) {
    const blended = mixThemeColor(background, target, step / 28);
    const formatted = formatThemeColor(blended);
    bestColor = formatted;
    if (measureContrastRatio(textColor, formatted) >= minimumRatio) {
      return formatted;
    }
  }
  return bestColor;
};

const resolveAccessibleGradient = (gradientValue = "", textColor = "", minimumRatio = 4.5) => {
  const stops = extractColorTokens(gradientValue);
  if (stops.length === 0) return gradientValue;
  let resolvedGradient = String(gradientValue || "");
  stops.forEach((stopColor) => {
    const accessibleColor = resolveAccessibleBackgroundColor(stopColor, textColor, minimumRatio);
    resolvedGradient = resolvedGradient.replace(stopColor, accessibleColor);
  });
  return resolvedGradient;
};

const resolveAccessibleCtaPresentation = (tokenSet = {}) => {
  const ctaStops = [
    ...extractColorTokens(tokenSet.ctaBg),
    ...extractColorTokens(tokenSet.ctaBgHover),
  ];
  const candidates = [
    tokenSet.accentContrast,
    tokenSet.textStrong,
    tokenSet.text,
    tokenSet.bg,
    tokenSet.bg2,
    "#f7fbff",
    "#08121a",
  ].filter(Boolean);
  if (ctaStops.length === 0) {
    return {
      ctaText: candidates[0] || "#08121a",
      ctaBg: tokenSet.ctaBg,
      ctaBgHover: tokenSet.ctaBgHover,
    };
  }

  let winner = candidates[0] || "#08121a";
  let winningCtaBg = tokenSet.ctaBg;
  let winningCtaBgHover = tokenSet.ctaBgHover;
  let bestScore = -1;
  candidates.forEach((candidate) => {
    const accessibleCtaBg = resolveAccessibleGradient(tokenSet.ctaBg, candidate);
    const accessibleCtaBgHover = resolveAccessibleGradient(tokenSet.ctaBgHover, candidate);
    const accessibleStops = [
      ...extractColorTokens(accessibleCtaBg),
      ...extractColorTokens(accessibleCtaBgHover),
    ];
    const score = Math.min(...accessibleStops.map((stop) => measureContrastRatio(candidate, stop)));
    if (score > bestScore) {
      bestScore = score;
      winner = candidate;
      winningCtaBg = accessibleCtaBg;
      winningCtaBgHover = accessibleCtaBgHover;
    }
  });
  return {
    ctaText: winner,
    ctaBg: winningCtaBg,
    ctaBgHover: winningCtaBgHover,
  };
};

export const PRODUCT_BRAND = {
  name: "FORMA",
  strapline: "Training Operating System",
  mark: "F",
  wordmarkTreatment: "Wide uppercase wordmark with a compact athletic monogram.",
  logoDirection: "Rounded monogram tile with a sharp editorial wordmark and restrained motion accents.",
  typography: {
    atlas: {
      display: "'Space Grotesk', sans-serif",
      body: "'Manrope', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
    maison: {
      display: "'Fraunces', serif",
      body: "'Manrope', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
    circuit: {
      display: "'Space Grotesk', sans-serif",
      body: "'Manrope', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
    signal: {
      display: "'Sora', sans-serif",
      body: "'Outfit', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
    editorial: {
      display: "'Newsreader', serif",
      body: "'Outfit', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
    studio: {
      display: "'Bricolage Grotesque', sans-serif",
      body: "'Manrope', sans-serif",
      mono: "'IBM Plex Mono', monospace",
    },
  },
};

export const BRAND_FOUNDATION = {
  recommendedProductName: PRODUCT_BRAND.name,
  logoWordmark: {
    wordmark: PRODUCT_BRAND.wordmarkTreatment,
    mark: PRODUCT_BRAND.logoDirection,
  },
  typographyHierarchy: [
    {
      label: "Display",
      usage: "Product name, section titles, big moments",
      direction: "Expressive editorial display with tight tracking and calm weight.",
    },
    {
      label: "Body",
      usage: "App copy, coach explanations, cards",
      direction: "High-legibility sans serif that stays soft in dark mode.",
    },
    {
      label: "Mono",
      usage: "Metrics, timestamps, compact system labels",
      direction: "Technical support voice for data, not the whole interface.",
    },
  ],
  baseDesignTokens: [
    {
      label: "Canvas",
      detail: "Layered gradient backgrounds with softened contrast instead of flat black or pure white.",
    },
    {
      label: "Surface",
      detail: "Tinted panels with restrained borders and depth-based shadows.",
    },
    {
      label: "Accent",
      detail: "One primary brand accent per theme, with semantic success/warning states kept separate.",
    },
    {
      label: "Focus",
      detail: "Soft luminous rings and lifted hover states instead of bright outlines.",
    },
  ],
  patterns: [
    {
      label: "Cards",
      detail: "Dense but breathable panels with a subtle top sheen and tone-on-tone glow.",
    },
    {
      label: "Buttons",
      detail: "Solid editorial CTAs, quiet secondary buttons, and elevated active states.",
    },
    {
      label: "Inputs",
      detail: "Tinted controls with strong focus contrast and no harsh browser white.",
    },
    {
      label: "Badges",
      detail: "Small rounded capsules with low-ink backgrounds and theme-aware borders.",
    },
  ],
};

export const BRAND_THEME_IDS = ["Atlas", "Maison", "Circuit", "Harbor", "Ember", "Solstice", "Fieldhouse", "Slate", "Redwood", "Pulse", "Canvas", "Voltage"];
export const BRAND_THEME_MODES = ["System", "Dark", "Light"];

export const BRAND_THEME_OPTIONS = [
  {
    id: "Atlas",
    label: "Atlas",
    mood: "Premium athletic",
    description: "Deep graphite, mineral teal, and sharp performance contrast.",
    preview: ["#07131b", "#0f2430", "#52d4c8", "#d8eef0"],
    previewFamily: "dashboard",
  },
  {
    id: "Maison",
    label: "Maison",
    mood: "Luxury coach",
    description: "Warm obsidian, oxblood undertones, and rich editorial warmth.",
    preview: ["#140f14", "#251920", "#d2ab77", "#efe5d7"],
    previewFamily: "editorial",
  },
  {
    id: "Circuit",
    label: "Circuit",
    mood: "Clean technical",
    description: "Engineered slate, crisp cobalt, and cool structured contrast.",
    preview: ["#091118", "#111c26", "#70c5ff", "#dce8f3"],
    previewFamily: "dashboard",
  },
  {
    id: "Harbor",
    label: "Harbor",
    mood: "Calm premium",
    description: "Sea-glass accents, inky navy surfaces, and softer endurance energy.",
    preview: ["#08131c", "#102333", "#47c4bb", "#d8f0ef"],
    previewFamily: "journal",
  },
  {
    id: "Ember",
    label: "Ember",
    mood: "Warm performance",
    description: "Burnished copper, clay undertones, and a confident warm glow.",
    preview: ["#151012", "#24191b", "#e08c5a", "#f2e1d3"],
    previewFamily: "signal",
  },
  {
    id: "Solstice",
    label: "Solstice",
    mood: "Editorial light",
    description: "Soft stone light mode, dusk blue accents, and lower-ink calm contrast.",
    preview: ["#f2efe9", "#e6e1d7", "#5b7ca6", "#1e2a34"],
    previewFamily: "editorial",
  },
  {
    id: "Fieldhouse",
    label: "Fieldhouse",
    mood: "Athletic classic",
    description: "Deep green structure with brass warmth and old-school training credibility.",
    preview: ["#0b1411", "#13201b", "#9ecf56", "#edf4dc"],
    previewFamily: "scoreboard",
  },
  {
    id: "Slate",
    label: "Slate",
    mood: "Monochrome quiet",
    description: "Cool graphite with restrained silver highlights and low-drama contrast.",
    preview: ["#101216", "#181c22", "#97a4b5", "#eef3f7"],
    previewFamily: "journal",
  },
  {
    id: "Redwood",
    label: "Redwood",
    mood: "Grounded editorial",
    description: "Deep cedar, muted rosewood, and a richer natural warmth.",
    preview: ["#171112", "#25181a", "#c7726c", "#f3ded8"],
    previewFamily: "editorial",
  },
  {
    id: "Pulse",
    label: "Pulse",
    mood: "Modern intensity",
    description: "High-contrast graphite, hot coral, and cool cyan energy without neon chaos.",
    preview: ["#090d13", "#131925", "#ff6f7d", "#dff6ff"],
    previewFamily: "signal",
  },
  {
    id: "Canvas",
    label: "Canvas",
    mood: "Paper editorial",
    description: "Cream paper, ink-blue framing, and a magazine-like planning mood.",
    preview: ["#f7f0e6", "#ebe0cf", "#3f648f", "#251d18"],
    previewFamily: "editorial",
  },
  {
    id: "Voltage",
    label: "Voltage",
    mood: "Sprint lab",
    description: "Near-black contrast, acid lime energy, and sharper faster surfaces.",
    preview: ["#06080d", "#10161d", "#d4ff4f", "#efffd0"],
    previewFamily: "signal",
  },
];

const LEGACY_PALETTE_TO_THEME = {
  Green: "Atlas",
  Blue: "Circuit",
  Orange: "Maison",
  Red: "Maison",
  Purple: "Maison",
  Neutral: "Circuit",
};

const LEGACY_MODE_VALUES = new Set(["System", "Light", "Dark"]);

const BRAND_THEMES = {
  Atlas: {
    fonts: PRODUCT_BRAND.typography.atlas,
    dark: {
      appBackground: "radial-gradient(120% 120% at 8% 0%, rgba(50,184,180,0.18), transparent 34%), radial-gradient(120% 140% at 100% 0%, rgba(78,118,170,0.16), transparent 38%), linear-gradient(180deg, #071019 0%, #0b1620 46%, #0d1b25 100%)",
      bg: "#09131b",
      bg2: "#0d1821",
      panel: "rgba(11, 21, 30, 0.88)",
      panel2: "rgba(15, 29, 40, 0.94)",
      panel3: "rgba(18, 34, 47, 0.98)",
      surface1: "#0f1d29",
      surface2: "#132432",
      surface3: "#1a3042",
      border: "rgba(123, 153, 173, 0.22)",
      borderStrong: "rgba(126, 173, 190, 0.32)",
      text: "#d8e8ee",
      textStrong: "#f2fbfd",
      textSoft: "#89a7b4",
      textMuted: "#6f8995",
      headingStart: "#f1fbfc",
      shellOverlay: "linear-gradient(180deg, rgba(16,30,40,0.72), rgba(10,19,27,0.38))",
      tabBg: "rgba(13, 25, 35, 0.82)",
      tabBorder: "rgba(122, 152, 171, 0.2)",
      tabText: "#89a7b4",
      tabActiveBg: "linear-gradient(135deg, rgba(61, 191, 178, 0.2), rgba(71, 126, 176, 0.3))",
      tabActiveText: "#f4fcfe",
      accent: "#52d4c8",
      accentHover: "#67ddd2",
      accentSoft: "rgba(82, 212, 200, 0.18)",
      accentGlow: "rgba(82, 212, 200, 0.28)",
      accentContrast: "#041018",
      ctaBg: "linear-gradient(135deg, #5ee1d4 0%, #4b8fda 100%)",
      ctaBgHover: "linear-gradient(135deg, #78eadf 0%, #5aa0e8 100%)",
      ctaBorder: "rgba(160, 230, 223, 0.38)",
      focusRing: "rgba(82, 212, 200, 0.22)",
      badgeBg: "rgba(82, 212, 200, 0.12)",
      badgeBorder: "rgba(82, 212, 200, 0.24)",
      badgeText: "#bfece7",
      cardBorder: "rgba(118, 149, 169, 0.18)",
      cardSoftBorder: "rgba(118, 149, 169, 0.14)",
      cardShadow: "0 12px 32px rgba(2, 10, 18, 0.28)",
      cardShadowHover: "0 18px 40px rgba(2, 10, 18, 0.36)",
      cardStrongShadow: "0 20px 52px rgba(2, 12, 20, 0.4)",
      cardSoftShadow: "0 10px 26px rgba(2, 10, 18, 0.24)",
      brandMarkBg: "linear-gradient(145deg, rgba(27, 56, 67, 0.94), rgba(11, 23, 34, 0.94))",
      brandMarkBorder: "rgba(130, 196, 192, 0.24)",
      inputBg: "#122432",
      inputBgFocus: "#162c3d",
      emptyBg: "rgba(17, 31, 42, 0.72)",
      emptyBorder: "rgba(118, 149, 169, 0.14)",
      shadow1: "0 10px 24px rgba(2, 10, 18, 0.24)",
      shadow2: "0 18px 38px rgba(2, 10, 18, 0.32)",
      shadow3: "0 24px 54px rgba(2, 10, 18, 0.42)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(116,214,203,0.18), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(116,150,204,0.16), transparent 40%), linear-gradient(180deg, #eef3ef 0%, #e5ece9 50%, #dde7e5 100%)",
      bg: "#e8efeb",
      bg2: "#dde7e4",
      panel: "rgba(248, 251, 249, 0.86)",
      panel2: "rgba(244, 248, 246, 0.94)",
      panel3: "rgba(237, 243, 240, 0.98)",
      surface1: "#f8fbf9",
      surface2: "#f0f5f3",
      surface3: "#e6eeeb",
      border: "rgba(105, 125, 136, 0.2)",
      borderStrong: "rgba(87, 121, 134, 0.28)",
      text: "#17303a",
      textStrong: "#0d2028",
      textSoft: "#566f79",
      textMuted: "#708791",
      headingStart: "#10252d",
      shellOverlay: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08))",
      tabBg: "rgba(249, 251, 250, 0.8)",
      tabBorder: "rgba(113, 132, 144, 0.18)",
      tabText: "#5b7280",
      tabActiveBg: "linear-gradient(135deg, rgba(82, 212, 200, 0.18), rgba(71, 126, 176, 0.22))",
      tabActiveText: "#12313a",
      accent: "#1a8b86",
      accentHover: "#247f9b",
      accentSoft: "rgba(26, 139, 134, 0.12)",
      accentGlow: "rgba(26, 139, 134, 0.22)",
      accentContrast: "#f5fbfb",
      ctaBg: "linear-gradient(135deg, #1c8c87 0%, #376fb1 100%)",
      ctaBgHover: "linear-gradient(135deg, #239995 0%, #467cc0 100%)",
      ctaBorder: "rgba(28, 140, 135, 0.24)",
      focusRing: "rgba(26, 139, 134, 0.16)",
      badgeBg: "rgba(26, 139, 134, 0.1)",
      badgeBorder: "rgba(26, 139, 134, 0.16)",
      badgeText: "#24504f",
      cardBorder: "rgba(113, 132, 144, 0.16)",
      cardSoftBorder: "rgba(113, 132, 144, 0.12)",
      cardShadow: "0 14px 32px rgba(93, 109, 119, 0.08)",
      cardShadowHover: "0 18px 40px rgba(93, 109, 119, 0.12)",
      cardStrongShadow: "0 22px 48px rgba(93, 109, 119, 0.14)",
      cardSoftShadow: "0 10px 22px rgba(93, 109, 119, 0.08)",
      brandMarkBg: "linear-gradient(145deg, rgba(239, 247, 245, 0.98), rgba(228, 237, 234, 0.98))",
      brandMarkBorder: "rgba(71, 126, 176, 0.18)",
      inputBg: "#f1f6f3",
      inputBgFocus: "#f8fbfa",
      emptyBg: "rgba(241, 246, 243, 0.9)",
      emptyBorder: "rgba(113, 132, 144, 0.16)",
      shadow1: "0 10px 24px rgba(93, 109, 119, 0.08)",
      shadow2: "0 18px 36px rgba(93, 109, 119, 0.12)",
      shadow3: "0 24px 50px rgba(93, 109, 119, 0.16)",
    },
  },
  Maison: {
    fonts: PRODUCT_BRAND.typography.maison,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(137,88,76,0.18), transparent 34%), radial-gradient(120% 140% at 100% 0%, rgba(206,171,119,0.16), transparent 38%), linear-gradient(180deg, #120d12 0%, #181117 48%, #1e171b 100%)",
      bg: "#130f13",
      bg2: "#1a1318",
      panel: "rgba(24, 18, 24, 0.9)",
      panel2: "rgba(32, 22, 29, 0.94)",
      panel3: "rgba(38, 26, 34, 0.98)",
      surface1: "#21171f",
      surface2: "#2a1c25",
      surface3: "#38252f",
      border: "rgba(179, 149, 134, 0.2)",
      borderStrong: "rgba(210, 171, 119, 0.28)",
      text: "#ece2d8",
      textStrong: "#fbf5ef",
      textSoft: "#b9a495",
      textMuted: "#9e8779",
      headingStart: "#fbf4ec",
      shellOverlay: "linear-gradient(180deg, rgba(36,24,28,0.78), rgba(18,13,18,0.44))",
      tabBg: "rgba(31, 23, 29, 0.84)",
      tabBorder: "rgba(176, 145, 128, 0.18)",
      tabText: "#b59f92",
      tabActiveBg: "linear-gradient(135deg, rgba(210, 171, 119, 0.16), rgba(114, 57, 53, 0.32))",
      tabActiveText: "#fff7ef",
      accent: "#d2ab77",
      accentHover: "#ddbb8e",
      accentSoft: "rgba(210, 171, 119, 0.16)",
      accentGlow: "rgba(210, 171, 119, 0.22)",
      accentContrast: "#1b1311",
      ctaBg: "linear-gradient(135deg, #c59b68 0%, #8b4f4a 100%)",
      ctaBgHover: "linear-gradient(135deg, #d2ab77 0%, #9d5c55 100%)",
      ctaBorder: "rgba(227, 196, 150, 0.28)",
      focusRing: "rgba(210, 171, 119, 0.2)",
      badgeBg: "rgba(210, 171, 119, 0.12)",
      badgeBorder: "rgba(210, 171, 119, 0.22)",
      badgeText: "#f1dcc0",
      cardBorder: "rgba(176, 145, 128, 0.16)",
      cardSoftBorder: "rgba(176, 145, 128, 0.12)",
      cardShadow: "0 14px 36px rgba(10, 6, 10, 0.3)",
      cardShadowHover: "0 18px 42px rgba(10, 6, 10, 0.38)",
      cardStrongShadow: "0 22px 52px rgba(10, 6, 10, 0.44)",
      cardSoftShadow: "0 10px 24px rgba(10, 6, 10, 0.24)",
      brandMarkBg: "linear-gradient(145deg, rgba(61, 37, 44, 0.96), rgba(28, 18, 24, 0.96))",
      brandMarkBorder: "rgba(227, 196, 150, 0.2)",
      inputBg: "#241821",
      inputBgFocus: "#2d1d27",
      emptyBg: "rgba(33, 23, 31, 0.78)",
      emptyBorder: "rgba(176, 145, 128, 0.14)",
      shadow1: "0 10px 24px rgba(10, 6, 10, 0.22)",
      shadow2: "0 18px 38px rgba(10, 6, 10, 0.3)",
      shadow3: "0 24px 54px rgba(10, 6, 10, 0.42)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(216,190,161,0.18), transparent 34%), radial-gradient(120% 120% at 100% 0%, rgba(155,104,93,0.14), transparent 38%), linear-gradient(180deg, #f3ede5 0%, #ede4da 52%, #e7ddd1 100%)",
      bg: "#efe7de",
      bg2: "#e8dfd4",
      panel: "rgba(251, 247, 242, 0.88)",
      panel2: "rgba(247, 241, 234, 0.94)",
      panel3: "rgba(240, 232, 223, 0.98)",
      surface1: "#fbf7f2",
      surface2: "#f5eee7",
      surface3: "#ebe2d8",
      border: "rgba(145, 120, 110, 0.18)",
      borderStrong: "rgba(163, 114, 103, 0.24)",
      text: "#342521",
      textStrong: "#201612",
      textSoft: "#755f56",
      textMuted: "#907870",
      headingStart: "#211512",
      shellOverlay: "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1))",
      tabBg: "rgba(251, 247, 242, 0.82)",
      tabBorder: "rgba(145, 120, 110, 0.16)",
      tabText: "#7b675e",
      tabActiveBg: "linear-gradient(135deg, rgba(210, 171, 119, 0.16), rgba(139, 79, 74, 0.18))",
      tabActiveText: "#321f18",
      accent: "#9a655d",
      accentHover: "#a86e65",
      accentSoft: "rgba(154, 101, 93, 0.12)",
      accentGlow: "rgba(154, 101, 93, 0.18)",
      accentContrast: "#fff8f2",
      ctaBg: "linear-gradient(135deg, #a56f61 0%, #c4a16e 100%)",
      ctaBgHover: "linear-gradient(135deg, #b17b6b 0%, #d0ae7b 100%)",
      ctaBorder: "rgba(165, 111, 97, 0.22)",
      focusRing: "rgba(165, 111, 97, 0.14)",
      badgeBg: "rgba(154, 101, 93, 0.1)",
      badgeBorder: "rgba(154, 101, 93, 0.16)",
      badgeText: "#5d3e38",
      cardBorder: "rgba(145, 120, 110, 0.14)",
      cardSoftBorder: "rgba(145, 120, 110, 0.12)",
      cardShadow: "0 12px 30px rgba(122, 98, 87, 0.08)",
      cardShadowHover: "0 16px 38px rgba(122, 98, 87, 0.12)",
      cardStrongShadow: "0 20px 48px rgba(122, 98, 87, 0.14)",
      cardSoftShadow: "0 10px 22px rgba(122, 98, 87, 0.08)",
      brandMarkBg: "linear-gradient(145deg, rgba(250, 244, 237, 0.98), rgba(239, 231, 222, 0.98))",
      brandMarkBorder: "rgba(196, 161, 110, 0.18)",
      inputBg: "#f5eee7",
      inputBgFocus: "#fbf7f2",
      emptyBg: "rgba(245, 238, 231, 0.88)",
      emptyBorder: "rgba(145, 120, 110, 0.14)",
      shadow1: "0 10px 24px rgba(122, 98, 87, 0.08)",
      shadow2: "0 18px 36px rgba(122, 98, 87, 0.12)",
      shadow3: "0 24px 50px rgba(122, 98, 87, 0.16)",
    },
  },
  Circuit: {
    fonts: PRODUCT_BRAND.typography.circuit,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(74,139,214,0.18), transparent 30%), radial-gradient(140% 140% at 100% 0%, rgba(106,197,255,0.14), transparent 36%), linear-gradient(180deg, #071018 0%, #0a141d 48%, #0d1821 100%)",
      bg: "#08121a",
      bg2: "#0d1821",
      panel: "rgba(10, 19, 28, 0.9)",
      panel2: "rgba(13, 24, 35, 0.94)",
      panel3: "rgba(17, 30, 43, 0.98)",
      surface1: "#0e1923",
      surface2: "#12202c",
      surface3: "#172b39",
      border: "rgba(117, 145, 164, 0.2)",
      borderStrong: "rgba(112, 197, 255, 0.28)",
      text: "#dce8f3",
      textStrong: "#f6fbff",
      textSoft: "#8ba1b5",
      textMuted: "#6e8798",
      headingStart: "#f4faff",
      shellOverlay: "linear-gradient(180deg, rgba(13,24,35,0.76), rgba(8,18,26,0.42))",
      tabBg: "rgba(11, 21, 31, 0.84)",
      tabBorder: "rgba(117, 145, 164, 0.18)",
      tabText: "#8aa0b4",
      tabActiveBg: "linear-gradient(135deg, rgba(112, 197, 255, 0.18), rgba(80, 120, 173, 0.28))",
      tabActiveText: "#f4fbff",
      accent: "#70c5ff",
      accentHover: "#8ad0ff",
      accentSoft: "rgba(112, 197, 255, 0.16)",
      accentGlow: "rgba(112, 197, 255, 0.22)",
      accentContrast: "#08121a",
      ctaBg: "linear-gradient(135deg, #70c5ff 0%, #4e86d2 100%)",
      ctaBgHover: "linear-gradient(135deg, #8ad0ff 0%, #6195df 100%)",
      ctaBorder: "rgba(148, 214, 255, 0.32)",
      focusRing: "rgba(112, 197, 255, 0.2)",
      badgeBg: "rgba(112, 197, 255, 0.12)",
      badgeBorder: "rgba(112, 197, 255, 0.2)",
      badgeText: "#c7eaff",
      cardBorder: "rgba(117, 145, 164, 0.16)",
      cardSoftBorder: "rgba(117, 145, 164, 0.12)",
      cardShadow: "0 14px 36px rgba(4, 10, 18, 0.3)",
      cardShadowHover: "0 18px 42px rgba(4, 10, 18, 0.36)",
      cardStrongShadow: "0 22px 50px rgba(4, 10, 18, 0.42)",
      cardSoftShadow: "0 10px 24px rgba(4, 10, 18, 0.24)",
      brandMarkBg: "linear-gradient(145deg, rgba(20, 35, 49, 0.96), rgba(10, 19, 28, 0.96))",
      brandMarkBorder: "rgba(148, 214, 255, 0.18)",
      inputBg: "#12202c",
      inputBgFocus: "#152635",
      emptyBg: "rgba(14, 25, 35, 0.8)",
      emptyBorder: "rgba(117, 145, 164, 0.14)",
      shadow1: "0 10px 24px rgba(4, 10, 18, 0.22)",
      shadow2: "0 18px 38px rgba(4, 10, 18, 0.3)",
      shadow3: "0 24px 52px rgba(4, 10, 18, 0.42)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(112,197,255,0.16), transparent 34%), radial-gradient(120% 120% at 100% 0%, rgba(146, 164, 185, 0.14), transparent 38%), linear-gradient(180deg, #edf2f6 0%, #e5ebf0 50%, #dde4ea 100%)",
      bg: "#e8eef3",
      bg2: "#e0e7ed",
      panel: "rgba(249, 251, 252, 0.88)",
      panel2: "rgba(244, 247, 249, 0.94)",
      panel3: "rgba(237, 242, 246, 0.98)",
      surface1: "#f9fbfc",
      surface2: "#f1f5f8",
      surface3: "#e7edf2",
      border: "rgba(110, 126, 140, 0.18)",
      borderStrong: "rgba(96, 131, 165, 0.24)",
      text: "#19303f",
      textStrong: "#11202b",
      textSoft: "#597184",
      textMuted: "#74899a",
      headingStart: "#10212c",
      shellOverlay: "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1))",
      tabBg: "rgba(249, 251, 252, 0.82)",
      tabBorder: "rgba(110, 126, 140, 0.14)",
      tabText: "#62798b",
      tabActiveBg: "linear-gradient(135deg, rgba(112, 197, 255, 0.18), rgba(78, 134, 210, 0.14))",
      tabActiveText: "#153041",
      accent: "#2b78bf",
      accentHover: "#3886ce",
      accentSoft: "rgba(43, 120, 191, 0.12)",
      accentGlow: "rgba(43, 120, 191, 0.18)",
      accentContrast: "#f6fbff",
      ctaBg: "linear-gradient(135deg, #2f7dc5 0%, #4ca2de 100%)",
      ctaBgHover: "linear-gradient(135deg, #3888d1 0%, #59afe9 100%)",
      ctaBorder: "rgba(47, 125, 197, 0.22)",
      focusRing: "rgba(43, 120, 191, 0.14)",
      badgeBg: "rgba(43, 120, 191, 0.1)",
      badgeBorder: "rgba(43, 120, 191, 0.16)",
      badgeText: "#234f75",
      cardBorder: "rgba(110, 126, 140, 0.14)",
      cardSoftBorder: "rgba(110, 126, 140, 0.1)",
      cardShadow: "0 12px 28px rgba(90, 106, 120, 0.08)",
      cardShadowHover: "0 16px 36px rgba(90, 106, 120, 0.12)",
      cardStrongShadow: "0 20px 46px rgba(90, 106, 120, 0.14)",
      cardSoftShadow: "0 10px 22px rgba(90, 106, 120, 0.08)",
      brandMarkBg: "linear-gradient(145deg, rgba(248, 250, 252, 0.98), rgba(235, 241, 246, 0.98))",
      brandMarkBorder: "rgba(76, 162, 222, 0.18)",
      inputBg: "#f1f5f8",
      inputBgFocus: "#f9fbfc",
      emptyBg: "rgba(241, 245, 248, 0.88)",
      emptyBorder: "rgba(110, 126, 140, 0.14)",
      shadow1: "0 10px 24px rgba(90, 106, 120, 0.08)",
      shadow2: "0 18px 36px rgba(90, 106, 120, 0.12)",
      shadow3: "0 24px 48px rgba(90, 106, 120, 0.16)",
    },
  },
};

const cloneTheme = (theme = {}) => JSON.parse(JSON.stringify(theme || {}));

const createThemeVariant = ({
  baseThemeId = "Atlas",
  fonts = null,
  dark = {},
  light = {},
} = {}) => {
  const baseTheme = cloneTheme(BRAND_THEMES[baseThemeId] || BRAND_THEMES.Atlas);
  return {
    fonts: fonts || baseTheme.fonts,
    dark: { ...baseTheme.dark, ...(dark || {}) },
    light: { ...baseTheme.light, ...(light || {}) },
  };
};

const EXTENDED_BRAND_THEMES = {
  Harbor: createThemeVariant({
    baseThemeId: "Atlas",
    fonts: PRODUCT_BRAND.typography.studio,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(71,196,187,0.18), transparent 34%), radial-gradient(120% 140% at 100% 0%, rgba(79,128,184,0.18), transparent 38%), linear-gradient(180deg, #08131c 0%, #0b1824 48%, #10202d 100%)",
      accent: "#47c4bb",
      accentHover: "#5ad0c7",
      accentSoft: "rgba(71, 196, 187, 0.16)",
      accentGlow: "rgba(71, 196, 187, 0.26)",
      ctaBg: "linear-gradient(135deg, #47c4bb 0%, #5f8ed7 100%)",
      ctaBgHover: "linear-gradient(135deg, #58d0c8 0%, #74a0e1 100%)",
      brandMarkBorder: "rgba(126, 212, 205, 0.22)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(112,220,210,0.18), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(129,166,212,0.16), transparent 38%), linear-gradient(180deg, #eef4f4 0%, #e7efee 52%, #dfe8e7 100%)",
      accent: "#267f7a",
      accentHover: "#2c8b85",
      accentSoft: "rgba(38, 127, 122, 0.12)",
      accentGlow: "rgba(38, 127, 122, 0.2)",
      ctaBg: "linear-gradient(135deg, #2a8a84 0%, #4f74b6 100%)",
      ctaBgHover: "linear-gradient(135deg, #30958f 0%, #6085c3 100%)",
    },
  }),
  Ember: createThemeVariant({
    baseThemeId: "Maison",
    fonts: PRODUCT_BRAND.typography.signal,
    dark: {
      appBackground: "radial-gradient(130% 120% at 10% 0%, rgba(224,140,90,0.22), transparent 32%), radial-gradient(120% 140% at 100% 0%, rgba(178,83,78,0.16), transparent 38%), linear-gradient(180deg, #170f11 0%, #211518 48%, #29191a 100%)",
      accent: "#e08c5a",
      accentHover: "#ea9b6e",
      accentSoft: "rgba(224, 140, 90, 0.16)",
      accentGlow: "rgba(224, 140, 90, 0.24)",
      ctaBg: "linear-gradient(135deg, #dd8655 0%, #b6534e 100%)",
      ctaBgHover: "linear-gradient(135deg, #e59767 0%, #c5675e 100%)",
    },
    light: {
      appBackground: "radial-gradient(130% 140% at 12% 0%, rgba(233,171,129,0.22), transparent 34%), radial-gradient(120% 120% at 100% 0%, rgba(211,132,98,0.14), transparent 40%), linear-gradient(180deg, #f6eee8 0%, #efe4db 52%, #e9ddd3 100%)",
      accent: "#b86445",
      accentHover: "#c56f4f",
      accentSoft: "rgba(184, 100, 69, 0.12)",
      accentGlow: "rgba(184, 100, 69, 0.18)",
      ctaBg: "linear-gradient(135deg, #b86445 0%, #d29d63 100%)",
      ctaBgHover: "linear-gradient(135deg, #c56f4f 0%, #dfac73 100%)",
    },
  }),
  Solstice: createThemeVariant({
    baseThemeId: "Atlas",
    fonts: PRODUCT_BRAND.typography.editorial,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(133,165,212,0.16), transparent 30%), radial-gradient(120% 140% at 100% 0%, rgba(202,167,121,0.14), transparent 36%), linear-gradient(180deg, #11151f 0%, #171c29 48%, #1d2431 100%)",
      bg: "#121521",
      surface1: "#181d2a",
      surface2: "#1e2431",
      accent: "#8ab0dd",
      accentHover: "#9bbce4",
      ctaBg: "linear-gradient(135deg, #7d9fcc 0%, #caa779 100%)",
      ctaBgHover: "linear-gradient(135deg, #8daeda 0%, #d7b68c 100%)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(223,208,178,0.18), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(137,169,206,0.16), transparent 38%), linear-gradient(180deg, #f3efe9 0%, #ece6dc 50%, #e5ded4 100%)",
      bg: "#f1ece5",
      bg2: "#eae4db",
      surface1: "#fbf8f2",
      surface2: "#f4efe8",
      surface3: "#ebe5dc",
      text: "#28313a",
      textStrong: "#182028",
      textSoft: "#677887",
      accent: "#5b7ca6",
      accentHover: "#6889b2",
      ctaBg: "linear-gradient(135deg, #5b7ca6 0%, #c49b66 100%)",
      ctaBgHover: "linear-gradient(135deg, #6889b2 0%, #d2a978 100%)",
    },
  }),
  Fieldhouse: createThemeVariant({
    baseThemeId: "Atlas",
    fonts: PRODUCT_BRAND.typography.signal,
    dark: {
      appBackground: "radial-gradient(120% 120% at 8% 0%, rgba(158,207,86,0.16), transparent 32%), radial-gradient(120% 140% at 100% 0%, rgba(97,140,110,0.18), transparent 40%), linear-gradient(180deg, #0b1411 0%, #101b17 48%, #13211b 100%)",
      accent: "#9ecf56",
      accentHover: "#aedb6d",
      accentSoft: "rgba(158, 207, 86, 0.16)",
      accentGlow: "rgba(158, 207, 86, 0.24)",
      ctaBg: "linear-gradient(135deg, #9ecf56 0%, #5f8c66 100%)",
      ctaBgHover: "linear-gradient(135deg, #b0db6d 0%, #73a178 100%)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(187,223,131,0.18), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(129,170,137,0.14), transparent 40%), linear-gradient(180deg, #eef2ea 0%, #e5eadf 50%, #dde4d6 100%)",
      accent: "#4e7c3f",
      accentHover: "#5a8a49",
      ctaBg: "linear-gradient(135deg, #5b8f48 0%, #b9965f 100%)",
      ctaBgHover: "linear-gradient(135deg, #6b9f58 0%, #c7a56f 100%)",
    },
  }),
  Slate: createThemeVariant({
    baseThemeId: "Circuit",
    fonts: PRODUCT_BRAND.typography.studio,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(151,164,181,0.14), transparent 28%), radial-gradient(140% 140% at 100% 0%, rgba(88,98,114,0.2), transparent 36%), linear-gradient(180deg, #0d1015 0%, #131820 46%, #181e27 100%)",
      accent: "#97a4b5",
      accentHover: "#aab6c5",
      accentSoft: "rgba(151, 164, 181, 0.14)",
      accentGlow: "rgba(151, 164, 181, 0.22)",
      ctaBg: "linear-gradient(135deg, #7b8798 0%, #a2afc0 100%)",
      ctaBgHover: "linear-gradient(135deg, #8c98a9 0%, #b3bfce 100%)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(210,218,228,0.18), transparent 34%), radial-gradient(120% 120% at 100% 0%, rgba(167,177,189,0.16), transparent 40%), linear-gradient(180deg, #eff2f5 0%, #e7ebef 52%, #dde3e8 100%)",
      accent: "#5f6f82",
      accentHover: "#6d7d90",
      accentSoft: "rgba(95, 111, 130, 0.12)",
      accentGlow: "rgba(95, 111, 130, 0.18)",
      ctaBg: "linear-gradient(135deg, #617184 0%, #93a0b0 100%)",
      ctaBgHover: "linear-gradient(135deg, #708093 0%, #a2afbe 100%)",
    },
  }),
  Redwood: createThemeVariant({
    baseThemeId: "Maison",
    fonts: PRODUCT_BRAND.typography.editorial,
    dark: {
      appBackground: "radial-gradient(120% 120% at 10% 0%, rgba(199,114,108,0.16), transparent 34%), radial-gradient(120% 140% at 100% 0%, rgba(122,74,68,0.18), transparent 38%), linear-gradient(180deg, #171112 0%, #1d1517 48%, #24191b 100%)",
      accent: "#c7726c",
      accentHover: "#d5857f",
      ctaBg: "linear-gradient(135deg, #c7726c 0%, #9a5b55 100%)",
      ctaBgHover: "linear-gradient(135deg, #d5857f 0%, #ab6c66 100%)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(225,167,161,0.18), transparent 34%), radial-gradient(120% 120% at 100% 0%, rgba(202,154,121,0.14), transparent 40%), linear-gradient(180deg, #f5ece7 0%, #eee3dc 52%, #e7dad1 100%)",
      accent: "#9f5a54",
      accentHover: "#ad6862",
      ctaBg: "linear-gradient(135deg, #a25c56 0%, #d8a07c 100%)",
      ctaBgHover: "linear-gradient(135deg, #b06a63 0%, #e3ad8c 100%)",
    },
  }),
  Pulse: createThemeVariant({
    baseThemeId: "Circuit",
    fonts: PRODUCT_BRAND.typography.signal,
    dark: {
      appBackground: "radial-gradient(120% 120% at 8% 0%, rgba(255,111,125,0.14), transparent 28%), radial-gradient(120% 140% at 100% 0%, rgba(96,223,255,0.12), transparent 34%), linear-gradient(180deg, #090d13 0%, #0d121a 48%, #131925 100%)",
      accent: "#ff6f7d",
      accentHover: "#ff8591",
      accentSoft: "rgba(255, 111, 125, 0.16)",
      accentGlow: "rgba(255, 111, 125, 0.24)",
      tabActiveBg: "linear-gradient(135deg, rgba(255,111,125,0.18), rgba(96,223,255,0.2))",
      ctaBg: "linear-gradient(135deg, #ff6f7d 0%, #57c8e6 100%)",
      ctaBgHover: "linear-gradient(135deg, #ff8591 0%, #6ad6ef 100%)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(255,145,156,0.16), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(122,215,235,0.16), transparent 38%), linear-gradient(180deg, #f4eef1 0%, #eee7eb 52%, #e7dfe4 100%)",
      accent: "#d45969",
      accentHover: "#e06676",
      accentSoft: "rgba(212, 89, 105, 0.12)",
      accentGlow: "rgba(212, 89, 105, 0.18)",
      ctaBg: "linear-gradient(135deg, #d45969 0%, #58aeca 100%)",
      ctaBgHover: "linear-gradient(135deg, #e06676 0%, #68bad3 100%)",
    },
  }),
  Canvas: createThemeVariant({
    baseThemeId: "Solstice",
    fonts: PRODUCT_BRAND.typography.editorial,
    dark: {
      appBackground: "radial-gradient(120% 120% at 12% 0%, rgba(79,120,168,0.16), transparent 28%), radial-gradient(120% 140% at 100% 0%, rgba(219,183,127,0.12), transparent 36%), linear-gradient(180deg, #181311 0%, #201816 46%, #271d1a 100%)",
      bg: "#1a1512",
      bg2: "#231b18",
      panel: "rgba(34, 25, 22, 0.9)",
      panel2: "rgba(42, 31, 27, 0.95)",
      panel3: "rgba(49, 36, 31, 0.98)",
      surface1: "#281d19",
      surface2: "#31241f",
      surface3: "#3b2c26",
      border: "rgba(205, 185, 161, 0.18)",
      borderStrong: "rgba(120, 154, 194, 0.28)",
      text: "#efe3d4",
      textStrong: "#fff7ef",
      textSoft: "#c1b09d",
      textMuted: "#9f8c79",
      headingStart: "#fff5ea",
      tabBg: "rgba(39, 29, 25, 0.84)",
      tabBorder: "rgba(205, 185, 161, 0.16)",
      tabText: "#c5b29d",
      tabActiveBg: "linear-gradient(135deg, rgba(76, 117, 167, 0.24), rgba(219, 183, 127, 0.16))",
      tabActiveText: "#fff7ef",
      accent: "#88a9d1",
      accentHover: "#99b6da",
      accentSoft: "rgba(136, 169, 209, 0.16)",
      accentGlow: "rgba(136, 169, 209, 0.22)",
      accentContrast: "#13100d",
      ctaBg: "linear-gradient(135deg, #88a9d1 0%, #dbb77f 100%)",
      ctaBgHover: "linear-gradient(135deg, #98b5db 0%, #e5c38f 100%)",
      ctaBorder: "rgba(209, 228, 248, 0.22)",
      focusRing: "rgba(136, 169, 209, 0.18)",
      badgeBg: "rgba(136, 169, 209, 0.12)",
      badgeBorder: "rgba(136, 169, 209, 0.18)",
      badgeText: "#dbeaf8",
      brandMarkBg: "linear-gradient(145deg, rgba(59, 45, 38, 0.96), rgba(31, 24, 20, 0.96))",
      brandMarkBorder: "rgba(209, 228, 248, 0.18)",
      inputBg: "#342722",
      inputBgFocus: "#3b2d28",
      emptyBg: "rgba(45, 33, 28, 0.82)",
      emptyBorder: "rgba(205, 185, 161, 0.16)",
    },
    light: {
      appBackground: "radial-gradient(120% 140% at 12% 0%, rgba(227,206,178,0.24), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(132,164,202,0.16), transparent 40%), linear-gradient(180deg, #f8f0e6 0%, #f1e7dc 48%, #ebe0d4 100%)",
      bg: "#f5ebdf",
      bg2: "#eee3d6",
      panel: "rgba(253, 248, 242, 0.9)",
      panel2: "rgba(249, 243, 236, 0.96)",
      panel3: "rgba(242, 234, 225, 0.98)",
      surface1: "#fffaf4",
      surface2: "#f5ede4",
      surface3: "#ece2d6",
      border: "rgba(139, 117, 93, 0.18)",
      borderStrong: "rgba(76, 117, 167, 0.24)",
      text: "#31251e",
      textStrong: "#1f1712",
      textSoft: "#6f6257",
      textMuted: "#8b7a6b",
      headingStart: "#1e1711",
      tabBg: "rgba(255, 250, 244, 0.82)",
      tabBorder: "rgba(139, 117, 93, 0.14)",
      tabText: "#76685c",
      tabActiveBg: "linear-gradient(135deg, rgba(76, 117, 167, 0.14), rgba(219, 183, 127, 0.16))",
      tabActiveText: "#243342",
      accent: "#4f6f96",
      accentHover: "#5f80a7",
      accentSoft: "rgba(79, 111, 150, 0.12)",
      accentGlow: "rgba(79, 111, 150, 0.18)",
      accentContrast: "#f8f1e9",
      ctaBg: "linear-gradient(135deg, #4f6f96 0%, #c99659 100%)",
      ctaBgHover: "linear-gradient(135deg, #5f80a7 0%, #d5a76e 100%)",
      ctaBorder: "rgba(79, 111, 150, 0.18)",
      focusRing: "rgba(79, 111, 150, 0.16)",
      badgeBg: "rgba(79, 111, 150, 0.1)",
      badgeBorder: "rgba(79, 111, 150, 0.16)",
      badgeText: "#335071",
      brandMarkBg: "linear-gradient(145deg, rgba(255, 250, 244, 0.98), rgba(241, 230, 217, 0.98))",
      brandMarkBorder: "rgba(79, 111, 150, 0.16)",
      inputBg: "#f8f0e6",
      inputBgFocus: "#fffaf4",
      emptyBg: "rgba(245, 237, 228, 0.9)",
      emptyBorder: "rgba(139, 117, 93, 0.14)",
    },
  }),
  Voltage: createThemeVariant({
    baseThemeId: "Circuit",
    fonts: PRODUCT_BRAND.typography.signal,
    dark: {
      appBackground: "radial-gradient(130% 120% at 8% 0%, rgba(212,255,79,0.18), transparent 28%), radial-gradient(120% 140% at 100% 0%, rgba(75,110,255,0.12), transparent 36%), linear-gradient(180deg, #06080d 0%, #090d13 44%, #10161d 100%)",
      bg: "#06090d",
      bg2: "#0b1016",
      panel: "rgba(9, 13, 19, 0.92)",
      panel2: "rgba(12, 17, 24, 0.96)",
      panel3: "rgba(16, 22, 29, 0.98)",
      surface1: "#10161d",
      surface2: "#161d24",
      surface3: "#202a33",
      border: "rgba(195, 214, 223, 0.14)",
      borderStrong: "rgba(212, 255, 79, 0.3)",
      text: "#edf3de",
      textStrong: "#f9ffef",
      textSoft: "#aeb89d",
      textMuted: "#87907d",
      headingStart: "#fbffe8",
      tabBg: "rgba(10, 14, 20, 0.86)",
      tabBorder: "rgba(195, 214, 223, 0.14)",
      tabText: "#aab49c",
      tabActiveBg: "linear-gradient(135deg, rgba(212,255,79,0.22), rgba(72,115,255,0.18))",
      tabActiveText: "#fbffe8",
      accent: "#d4ff4f",
      accentHover: "#ddff73",
      accentSoft: "rgba(212, 255, 79, 0.18)",
      accentGlow: "rgba(212, 255, 79, 0.28)",
      accentContrast: "#081006",
      ctaBg: "linear-gradient(135deg, #d4ff4f 0%, #7cb8ff 100%)",
      ctaBgHover: "linear-gradient(135deg, #e0ff74 0%, #92c4ff 100%)",
      ctaBorder: "rgba(230, 255, 164, 0.28)",
      focusRing: "rgba(212, 255, 79, 0.22)",
      badgeBg: "rgba(212, 255, 79, 0.12)",
      badgeBorder: "rgba(212, 255, 79, 0.22)",
      badgeText: "#efffd0",
      brandMarkBg: "linear-gradient(145deg, rgba(24, 30, 18, 0.96), rgba(8, 13, 9, 0.96))",
      brandMarkBorder: "rgba(230, 255, 164, 0.2)",
      inputBg: "#141b22",
      inputBgFocus: "#192129",
      emptyBg: "rgba(17, 23, 30, 0.82)",
      emptyBorder: "rgba(195, 214, 223, 0.14)",
    },
    light: {
      appBackground: "radial-gradient(130% 140% at 12% 0%, rgba(230,255,166,0.24), transparent 32%), radial-gradient(120% 120% at 100% 0%, rgba(171,197,255,0.18), transparent 40%), linear-gradient(180deg, #f3f7e9 0%, #eaf0df 48%, #dfe8d3 100%)",
      bg: "#edf3e0",
      bg2: "#e3ebd7",
      panel: "rgba(251, 253, 244, 0.9)",
      panel2: "rgba(245, 249, 236, 0.96)",
      panel3: "rgba(236, 242, 226, 0.98)",
      surface1: "#fbfff1",
      surface2: "#f1f6e6",
      surface3: "#e6edd8",
      border: "rgba(103, 120, 88, 0.16)",
      borderStrong: "rgba(114, 147, 212, 0.22)",
      text: "#202a19",
      textStrong: "#11180d",
      textSoft: "#5d6752",
      textMuted: "#7c876f",
      headingStart: "#12180d",
      tabBg: "rgba(251, 253, 244, 0.84)",
      tabBorder: "rgba(103, 120, 88, 0.14)",
      tabText: "#66705c",
      tabActiveBg: "linear-gradient(135deg, rgba(212,255,79,0.16), rgba(124,184,255,0.18))",
      tabActiveText: "#192313",
      accent: "#6c8b12",
      accentHover: "#7b9d17",
      accentSoft: "rgba(108, 139, 18, 0.12)",
      accentGlow: "rgba(108, 139, 18, 0.18)",
      accentContrast: "#f6fbe8",
      ctaBg: "linear-gradient(135deg, #7b9d17 0%, #6f8dd8 100%)",
      ctaBgHover: "linear-gradient(135deg, #89ab1d 0%, #809ce3 100%)",
      ctaBorder: "rgba(123, 157, 23, 0.2)",
      focusRing: "rgba(108, 139, 18, 0.16)",
      badgeBg: "rgba(108, 139, 18, 0.1)",
      badgeBorder: "rgba(108, 139, 18, 0.16)",
      badgeText: "#42540e",
      brandMarkBg: "linear-gradient(145deg, rgba(246, 251, 232, 0.98), rgba(232, 239, 217, 0.98))",
      brandMarkBorder: "rgba(114, 147, 212, 0.16)",
      inputBg: "#f1f6e6",
      inputBgFocus: "#fbfff1",
      emptyBg: "rgba(241, 246, 230, 0.88)",
      emptyBorder: "rgba(103, 120, 88, 0.14)",
    },
  }),
};

const ALL_BRAND_THEMES = {
  ...BRAND_THEMES,
  ...EXTENDED_BRAND_THEMES,
};

const detectSystemDark = () => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-color-scheme: dark)").matches
);

const DEFAULT_THEME_CHROME = {
  radiusSm: "10px",
  radiusMd: "14px",
  radiusLg: "18px",
  cardTopLight: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0))",
  cardBloom: "radial-gradient(circle, var(--brand-accent-soft) 0%, rgba(0,0,0,0) 68%)",
  buttonShadowRest: "0 0 0 rgba(0,0,0,0)",
};

const THEME_CHROME = {
  Atlas: {
    radiusSm: "10px",
    radiusMd: "16px",
    radiusLg: "22px",
    buttonShadowHover: "0 18px 34px rgba(8, 18, 34, 0.24)",
  },
  Maison: {
    radiusSm: "14px",
    radiusMd: "22px",
    radiusLg: "30px",
    cardTopLight: "linear-gradient(180deg, rgba(255,243,228,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(210,171,119,0.18) 0%, rgba(0,0,0,0) 70%)",
    buttonShadowHover: "0 18px 34px rgba(40, 18, 18, 0.28)",
  },
  Circuit: {
    radiusSm: "8px",
    radiusMd: "12px",
    radiusLg: "18px",
    cardTopLight: "linear-gradient(180deg, rgba(184,220,255,0.1), rgba(255,255,255,0))",
    buttonShadowHover: "0 18px 34px rgba(7, 16, 26, 0.24)",
  },
  Harbor: {
    radiusSm: "16px",
    radiusMd: "22px",
    radiusLg: "30px",
    cardTopLight: "linear-gradient(180deg, rgba(220,255,250,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(71,196,187,0.18) 0%, rgba(0,0,0,0) 70%)",
  },
  Ember: {
    radiusSm: "12px",
    radiusMd: "18px",
    radiusLg: "24px",
    cardTopLight: "linear-gradient(180deg, rgba(255,225,203,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(224,140,90,0.2) 0%, rgba(0,0,0,0) 70%)",
  },
  Solstice: {
    radiusSm: "16px",
    radiusMd: "24px",
    radiusLg: "32px",
    cardTopLight: "linear-gradient(180deg, rgba(255,247,232,0.14), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(136,176,221,0.18) 0%, rgba(0,0,0,0) 70%)",
  },
  Fieldhouse: {
    radiusSm: "8px",
    radiusMd: "12px",
    radiusLg: "18px",
    cardTopLight: "linear-gradient(180deg, rgba(231,244,195,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(158,207,86,0.18) 0%, rgba(0,0,0,0) 70%)",
  },
  Slate: {
    radiusSm: "10px",
    radiusMd: "14px",
    radiusLg: "20px",
    cardTopLight: "linear-gradient(180deg, rgba(237,243,247,0.08), rgba(255,255,255,0))",
  },
  Redwood: {
    radiusSm: "14px",
    radiusMd: "20px",
    radiusLg: "28px",
    cardTopLight: "linear-gradient(180deg, rgba(255,232,225,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(199,114,108,0.18) 0%, rgba(0,0,0,0) 70%)",
  },
  Pulse: {
    radiusSm: "9px",
    radiusMd: "14px",
    radiusLg: "20px",
    cardTopLight: "linear-gradient(180deg, rgba(255,208,217,0.1), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(255,111,125,0.2) 0%, rgba(0,0,0,0) 70%)",
    buttonShadowHover: "0 20px 36px rgba(14, 18, 30, 0.28)",
  },
  Canvas: {
    radiusSm: "16px",
    radiusMd: "22px",
    radiusLg: "30px",
    cardTopLight: "linear-gradient(180deg, rgba(255,249,240,0.16), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(79,111,150,0.16) 0%, rgba(0,0,0,0) 70%)",
    buttonShadowHover: "0 18px 32px rgba(64, 48, 37, 0.18)",
  },
  Voltage: {
    radiusSm: "6px",
    radiusMd: "10px",
    radiusLg: "16px",
    cardTopLight: "linear-gradient(180deg, rgba(240,255,188,0.12), rgba(255,255,255,0))",
    cardBloom: "radial-gradient(circle, rgba(212,255,79,0.2) 0%, rgba(0,0,0,0) 72%)",
    buttonShadowHover: "0 20px 36px rgba(8, 12, 14, 0.3)",
  },
};

const THEME_PREVIEW_FAMILIES = {
  dashboard: {
    metricLabel: "Live load",
    metricValue: "82%",
    accentLabel: "Quality day",
    listLabel: "Today",
    listItems: ["Warm-up stays controlled", "Main set is visible at a glance"],
  },
  editorial: {
    metricLabel: "Coach note",
    metricValue: "Ready",
    accentLabel: "Intentional",
    listLabel: "Why it works",
    listItems: ["Clear hierarchy", "Richer reading rhythm"],
  },
  scoreboard: {
    metricLabel: "Block score",
    metricValue: "4/5",
    accentLabel: "Classic",
    listLabel: "Session board",
    listItems: ["Main work leads", "Support stays visible"],
  },
  journal: {
    metricLabel: "Calm",
    metricValue: "Steady",
    accentLabel: "Readable",
    listLabel: "Focus",
    listItems: ["Less visual noise", "Comfortable long reads"],
  },
  signal: {
    metricLabel: "Signal",
    metricValue: "High",
    accentLabel: "Push day",
    listLabel: "What stands out",
    listItems: ["Fast visual scan", "Confident action emphasis"],
  },
};

const THEME_PREVIEW_OVERRIDES = {
  Atlas: {
    eyebrow: "Performance desk",
    headline: "Sharp enough for live training decisions.",
    body: "Mineral teal and graphite keep high-signal work crisp without drifting into generic dark mode.",
  },
  Maison: {
    eyebrow: "Coach brief",
    headline: "Editorial warmth without losing precision.",
    body: "Serif display moments and warm shadows make the product feel like a premium training journal, not a dashboard template.",
  },
  Circuit: {
    eyebrow: "Technical board",
    headline: "A cleaner lab-grade control room.",
    body: "Sharper corners, cooler contrast, and cobalt signal lines give the plan a more engineered read.",
  },
  Harbor: {
    eyebrow: "Endurance calm",
    headline: "Softer pacing, still unmistakably premium.",
    body: "Sea-glass accents and rounder cards turn the interface from harsh to composed without muddying the hierarchy.",
  },
  Ember: {
    eyebrow: "Warm intensity",
    headline: "Heat and momentum without neon chaos.",
    body: "Copper light, clay shadows, and a more assertive action tone create a visibly different performance mood.",
  },
  Solstice: {
    eyebrow: "Light editorial",
    headline: "A brighter desk with magazine-grade spacing.",
    body: "Stone, dusk blue, and serif rhythm make the light surface feel intentionally designed instead of merely inverted.",
  },
  Fieldhouse: {
    eyebrow: "Training hall",
    headline: "Vintage credibility with modern legibility.",
    body: "Green structure and brass warmth give the app a fieldhouse identity instead of another generic accent swap.",
  },
  Slate: {
    eyebrow: "Quiet utility",
    headline: "Low-drama surfaces for long planning sessions.",
    body: "Monochrome restraint, softened shadows, and studio typography create a calmer product voice.",
  },
  Redwood: {
    eyebrow: "Grounded editorial",
    headline: "Natural warmth with stronger storytelling.",
    body: "Rosewood undertones and longer serif moments make summaries feel deliberate instead of mechanical.",
  },
  Pulse: {
    eyebrow: "Modern push",
    headline: "Fast scan speed with real contrast discipline.",
    body: "Coral hits, cool support tones, and tighter geometry make this feel kinetic without breaking readability.",
  },
  Canvas: {
    eyebrow: "Paper planbook",
    headline: "Cream paper, ink framing, and slower visual rhythm.",
    body: "Canvas trades glossy dark surfaces for a magazine-like editorial direction that still preserves strong control contrast.",
  },
  Voltage: {
    eyebrow: "Sprint lab",
    headline: "Acid-lime signal with sharper faster edges.",
    body: "Voltage is the boldest direction in the set: tighter radii, near-black structure, and bright action emphasis.",
  },
};

const resolveThemeChrome = (themeId = "", tokenSet = {}) => {
  const chrome = THEME_CHROME[themeId] || {};
  return {
    radiusSm: chrome.radiusSm || DEFAULT_THEME_CHROME.radiusSm,
    radiusMd: chrome.radiusMd || DEFAULT_THEME_CHROME.radiusMd,
    radiusLg: chrome.radiusLg || DEFAULT_THEME_CHROME.radiusLg,
    cardTopLight: chrome.cardTopLight || DEFAULT_THEME_CHROME.cardTopLight,
    cardBloom: chrome.cardBloom || DEFAULT_THEME_CHROME.cardBloom,
    buttonShadowRest: chrome.buttonShadowRest || DEFAULT_THEME_CHROME.buttonShadowRest,
    buttonShadowHover: chrome.buttonShadowHover || tokenSet.shadow1 || "0 10px 24px rgba(0,0,0,0.12)",
  };
};

export const normalizeAppearanceSettings = (appearance = {}) => {
  const requestedTheme = sanitizeText(appearance?.theme || "", 40);
  const requestedMode = sanitizeText(appearance?.mode || "", 20);
  const requestedPalette = sanitizeText(appearance?.palette || "", 40);
  const themeId = BRAND_THEME_IDS.includes(requestedTheme)
    ? requestedTheme
    : LEGACY_PALETTE_TO_THEME[requestedPalette]
    || "Atlas";
  const mode = BRAND_THEME_MODES.includes(requestedMode)
    ? requestedMode
    : LEGACY_MODE_VALUES.has(requestedTheme)
    ? requestedTheme
    : "Dark";
  return {
    theme: themeId,
    mode,
  };
};

export const buildBrandThemeState = ({
  appearance = {},
  phaseTheme = null,
  systemPrefersDark = detectSystemDark(),
} = {}) => {
  const normalizedAppearance = normalizeAppearanceSettings(appearance);
  const themeId = normalizedAppearance.theme;
  const modePreference = normalizedAppearance.mode;
  const resolvedMode = modePreference === "System"
    ? (systemPrefersDark ? "Dark" : "Light")
    : modePreference;
  const themeDefinition = ALL_BRAND_THEMES[themeId] || ALL_BRAND_THEMES.Atlas;
  const tokenSet = themeDefinition?.[resolvedMode.toLowerCase()] || themeDefinition.dark;
  const themeChrome = resolveThemeChrome(themeId, tokenSet);
  const ctaPresentation = resolveAccessibleCtaPresentation(tokenSet);
  const ctaText = ctaPresentation.ctaText;

  return {
    brand: PRODUCT_BRAND,
    theme: BRAND_THEME_OPTIONS.find((option) => option.id === themeId) || BRAND_THEME_OPTIONS[0],
    appearance: normalizedAppearance,
    resolvedMode,
    themeChrome,
    contrastPairs: {
      surface: {
        foreground: tokenSet.text,
        background: tokenSet.surface1,
      },
      strongSurface: {
        foreground: tokenSet.textStrong,
        background: tokenSet.surface2,
      },
      primary: {
        foreground: ctaText,
        background: tokenSet.accent,
      },
      cta: {
        foreground: ctaText,
        background: tokenSet.accent,
      },
    },
    cssVars: {
      "--bg": tokenSet.bg,
      "--bg-2": tokenSet.bg2,
      "--panel": tokenSet.panel,
      "--panel-2": tokenSet.panel2,
      "--panel-3": tokenSet.panel3,
      "--surface-1": tokenSet.surface1,
      "--surface-2": tokenSet.surface2,
      "--surface-3": tokenSet.surface3,
      "--border": tokenSet.border,
      "--border-strong": tokenSet.borderStrong,
      "--muted": tokenSet.textMuted,
      "--text": tokenSet.text,
      "--text-strong": tokenSet.textStrong,
      "--text-soft": tokenSet.textSoft,
      "--heading-start": tokenSet.headingStart,
      "--shell-overlay": tokenSet.shellOverlay,
      "--tab-strip-bg": tokenSet.tabBg,
      "--tab-strip-border": tokenSet.tabBorder,
      "--tab-text": tokenSet.tabText,
      "--tab-active-bg": tokenSet.tabActiveBg,
      "--tab-active-text": tokenSet.tabActiveText,
      "--brand-accent": tokenSet.accent,
      "--brand-accent-hover": tokenSet.accentHover,
      "--brand-accent-soft": tokenSet.accentSoft,
      "--brand-accent-glow": tokenSet.accentGlow,
      "--accent": tokenSet.accent,
      "--accent-contrast": tokenSet.accentContrast,
      "--cta-text": ctaText,
      "--cta-bg": ctaPresentation.ctaBg,
      "--cta-bg-hover": ctaPresentation.ctaBgHover,
      "--cta-border": tokenSet.ctaBorder,
      "--focus-ring": tokenSet.focusRing,
      "--badge-bg": tokenSet.badgeBg,
      "--badge-border": tokenSet.badgeBorder,
      "--badge-text": tokenSet.badgeText,
      "--card-border": tokenSet.cardBorder,
      "--card-soft-border": tokenSet.cardSoftBorder,
      "--card-shadow": tokenSet.cardShadow,
      "--card-shadow-hover": tokenSet.cardShadowHover,
      "--card-strong-shadow": tokenSet.cardStrongShadow,
      "--card-soft-shadow": tokenSet.cardSoftShadow,
      "--brand-mark-bg": tokenSet.brandMarkBg,
      "--brand-mark-border": tokenSet.brandMarkBorder,
      "--input-bg": tokenSet.inputBg,
      "--input-bg-focus": tokenSet.inputBgFocus,
      "--empty-bg": tokenSet.emptyBg,
      "--empty-border": tokenSet.emptyBorder,
      "--shadow-1": tokenSet.shadow1,
      "--shadow-2": tokenSet.shadow2,
      "--shadow-3": tokenSet.shadow3,
      "--font-display": themeDefinition.fonts.display,
      "--font-body": themeDefinition.fonts.body,
      "--font-mono": themeDefinition.fonts.mono,
      "--radius-sm": themeChrome.radiusSm,
      "--radius-md": themeChrome.radiusMd,
      "--radius-lg": themeChrome.radiusLg,
      "--card-top-light": themeChrome.cardTopLight,
      "--card-bloom": themeChrome.cardBloom,
      "--button-shadow-rest": themeChrome.buttonShadowRest,
      "--button-shadow-hover": themeChrome.buttonShadowHover,
      "--phase-accent": sanitizeText(phaseTheme?.accent || tokenSet.accent, 40),
      "--phase-accent-soft": sanitizeText(phaseTheme?.accentSoft || tokenSet.accentSoft, 80),
      "--phase-accent-glow": sanitizeText(phaseTheme?.accentGlow || tokenSet.accentGlow, 80),
    },
    tokens: tokenSet,
    appBackground: tokenSet.appBackground,
  };
};

export const buildBrandThemePreviewModel = ({
  brandThemeState = null,
} = {}) => {
  const resolvedThemeState = brandThemeState?.cssVars
    ? brandThemeState
    : buildBrandThemeState({ appearance: brandThemeState?.appearance || {} });
  const themeOption = resolvedThemeState.theme || BRAND_THEME_OPTIONS[0];
  const previewFamily = themeOption.previewFamily || "dashboard";
  const previewFamilyContent = THEME_PREVIEW_FAMILIES[previewFamily] || THEME_PREVIEW_FAMILIES.dashboard;
  const previewStory = THEME_PREVIEW_OVERRIDES[themeOption.id] || {};
  const cssVars = resolvedThemeState.cssVars || {};
  const themeChrome = resolvedThemeState.themeChrome || resolveThemeChrome(themeOption.id, resolvedThemeState.tokens || {});

  return {
    id: themeOption.id,
    label: themeOption.label,
    mood: themeOption.mood,
    description: themeOption.description,
    previewFamily,
    modeLabel: resolvedThemeState.appearance?.mode === "System"
      ? `System · ${resolvedThemeState.resolvedMode || "Dark"}`
      : (resolvedThemeState.resolvedMode || "Dark"),
    swatches: Array.isArray(themeOption.preview) ? [...themeOption.preview] : [],
    eyebrow: previewStory.eyebrow || themeOption.mood,
    headline: previewStory.headline || themeOption.description,
    body: previewStory.body || "Curated tokens stay distinct without sacrificing legibility.",
    metricLabel: previewFamilyContent.metricLabel,
    metricValue: previewFamilyContent.metricValue,
    accentLabel: previewFamilyContent.accentLabel,
    listLabel: previewFamilyContent.listLabel,
    listItems: Array.isArray(previewFamilyContent.listItems) ? [...previewFamilyContent.listItems] : [],
    chrome: themeChrome,
    tokens: {
      background: resolvedThemeState.appBackground,
      panel: cssVars["--panel"],
      panel2: cssVars["--panel-2"],
      panel3: cssVars["--panel-3"],
      surface1: cssVars["--surface-1"],
      surface2: cssVars["--surface-2"],
      border: cssVars["--border"],
      borderStrong: cssVars["--border-strong"],
      text: cssVars["--text"],
      textStrong: cssVars["--text-strong"],
      textSoft: cssVars["--text-soft"],
      accent: cssVars["--brand-accent"],
      accentSoft: cssVars["--brand-accent-soft"],
      accentContrast: cssVars["--accent-contrast"],
      ctaText: cssVars["--cta-text"],
      badgeBg: cssVars["--badge-bg"],
      badgeBorder: cssVars["--badge-border"],
      badgeText: cssVars["--badge-text"],
      ctaBg: cssVars["--cta-bg"],
      ctaBorder: cssVars["--cta-border"],
      shadow1: cssVars["--shadow-1"],
      shadow2: cssVars["--shadow-2"],
      fontDisplay: cssVars["--font-display"],
      fontBody: cssVars["--font-body"],
      fontMono: cssVars["--font-mono"],
    },
  };
};
