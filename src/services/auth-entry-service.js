const normalizeAuthMode = (value = "") => (
  String(value || "").trim().toLowerCase() === "signup" ? "signup" : "signin"
);

const parseHexColor = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw.startsWith("#")) return null;
  const hex = raw.slice(1);
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
};

const toRgbString = (color) => (
  color
    ? `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
    : ""
);

const darkenColor = (value, amount = 0.2, fallback = value) => {
  const color = parseHexColor(value);
  if (!color) return fallback;
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
  return toRgbString({
    r: color.r * (1 - ratio),
    g: color.g * (1 - ratio),
    b: color.b * (1 - ratio),
  });
};

export const AUTH_ACTION_VARIANTS = {
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
};

export const AUTH_ENTRY_STYLE_TEXT = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
  .auth-entry-root{
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:clamp(1rem, 2vw, 2rem);
    background:var(--auth-canvas, linear-gradient(180deg, #0b1118 0%, #121a26 100%));
    color:var(--auth-text, var(--text, #dce7f1));
    font-family:var(--font-body, 'Manrope', sans-serif);
  }
  .auth-entry-root *{box-sizing:border-box}
  .auth-entry-shell{
    width:min(1120px, 100%);
    display:grid;
    gap:clamp(0.9rem, 1.8vw, 1.35rem);
    grid-template-columns:minmax(0, 1.08fr) minmax(320px, 0.92fr);
    align-items:stretch;
  }
  .auth-entry-rail,
  .auth-entry-form{
    position:relative;
    overflow:hidden;
    border-radius:28px;
    border:1px solid var(--auth-border, var(--border, rgba(255,255,255,0.14)));
    box-shadow:var(--auth-shadow, 0 26px 56px rgba(5,10,18,0.32));
    backdrop-filter:blur(18px);
  }
  .auth-entry-rail{
    padding:clamp(1.2rem, 2vw, 1.7rem);
    background:
      radial-gradient(circle at top right, var(--auth-accent-soft, rgba(82,212,200,0.18)) 0%, rgba(0,0,0,0) 36%),
      linear-gradient(180deg, var(--auth-panel-strong, rgba(15,29,40,0.95)) 0%, var(--auth-panel, rgba(11,21,30,0.88)) 100%);
  }
  .auth-entry-form{
    padding:clamp(1.15rem, 2vw, 1.55rem);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 18%),
      linear-gradient(180deg, var(--auth-panel, rgba(11,21,30,0.88)) 0%, var(--auth-panel-soft, rgba(9,18,28,0.78)) 100%);
  }
  .auth-entry-rail::after,
  .auth-entry-form::after{
    content:"";
    position:absolute;
    inset:auto -8% -16% auto;
    width:220px;
    height:220px;
    background:radial-gradient(circle, var(--auth-accent-soft, rgba(82,212,200,0.18)) 0%, rgba(0,0,0,0) 72%);
    opacity:0.9;
    pointer-events:none;
  }
  .auth-brand-row{
    display:flex;
    align-items:center;
    gap:0.75rem;
    margin-bottom:1.05rem;
  }
  .auth-brand-mark{
    width:52px;
    height:52px;
    border-radius:16px;
    display:grid;
    place-items:center;
    font-family:var(--font-display, 'Space Grotesk', sans-serif);
    font-size:1.08rem;
    font-weight:700;
    color:var(--auth-primary-text, var(--accent-contrast, #07131b));
    background:var(--auth-primary-bg, var(--cta-bg, linear-gradient(135deg, #5ee1d4 0%, #4b8fda 100%)));
    border:1px solid var(--auth-primary-border, var(--cta-border, rgba(255,255,255,0.24)));
    box-shadow:0 18px 36px rgba(5, 12, 22, 0.24);
  }
  .auth-brand-copy{
    display:grid;
    gap:0.2rem;
  }
  .auth-brand-wordmark{
    font-family:var(--font-display, 'Space Grotesk', sans-serif);
    font-size:1.2rem;
    font-weight:700;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
  }
  .auth-brand-strapline{
    font-size:0.66rem;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-eyebrow,
  .auth-section-label{
    font-size:0.62rem;
    font-weight:700;
    letter-spacing:0.14em;
    text-transform:uppercase;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-title{
    margin-top:0.5rem;
    font-family:var(--font-display, 'Space Grotesk', sans-serif);
    font-size:clamp(1.95rem, 4vw, 2.8rem);
    line-height:0.98;
    letter-spacing:-0.03em;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
    max-width:11ch;
  }
  .auth-subtitle{
    margin-top:0.85rem;
    max-width:34rem;
    font-size:0.82rem;
    line-height:1.7;
    color:var(--auth-text, var(--text, #dce7f1));
  }
  .auth-status-row{
    display:flex;
    flex-wrap:wrap;
    gap:0.5rem;
    margin-top:1rem;
  }
  .auth-status-badge{
    display:inline-flex;
    align-items:center;
    min-height:32px;
    padding:0.45rem 0.7rem;
    border-radius:999px;
    border:1px solid var(--auth-badge-border, var(--badge-border, rgba(82,212,200,0.22)));
    background:var(--auth-badge-bg, var(--badge-bg, rgba(82,212,200,0.12)));
    color:var(--auth-badge-text, var(--badge-text, #bfece7));
    font-size:0.64rem;
    font-weight:700;
    letter-spacing:0.03em;
  }
  .auth-path-grid{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:0.8rem;
    margin-top:1.25rem;
  }
  .auth-path-card{
    position:relative;
    overflow:hidden;
    display:grid;
    gap:0.72rem;
    padding:1rem;
    border-radius:22px;
    border:1px solid var(--auth-border, var(--border, rgba(255,255,255,0.14)));
    background:linear-gradient(180deg, var(--auth-surface-strong, var(--surface-2, #132432)) 0%, var(--auth-surface, var(--surface-1, #0f1d29)) 100%);
    box-shadow:var(--auth-soft-shadow, 0 10px 24px rgba(2,10,18,0.24));
  }
  .auth-path-card[data-emphasis="strong"]{
    border-color:var(--auth-border-strong, var(--border-strong, rgba(126,173,190,0.32)));
    box-shadow:0 18px 32px rgba(5, 12, 22, 0.24);
  }
  .auth-path-card[data-tone="local"]{
    background:linear-gradient(180deg, var(--auth-panel-soft, rgba(9,18,28,0.78)) 0%, var(--auth-surface, var(--surface-1, #0f1d29)) 100%);
  }
  .auth-path-card::before{
    content:"";
    position:absolute;
    inset:0 0 auto 0;
    height:3px;
    background:var(--auth-primary-bg, var(--cta-bg, linear-gradient(135deg, #5ee1d4 0%, #4b8fda 100%)));
    opacity:0.9;
  }
  .auth-path-card[data-tone="local"]::before{
    background:linear-gradient(90deg, var(--auth-border-strong, var(--border-strong, rgba(126,173,190,0.32))) 0%, rgba(0,0,0,0) 100%);
  }
  .auth-path-kicker{
    font-size:0.58rem;
    font-weight:700;
    letter-spacing:0.12em;
    text-transform:uppercase;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-path-title{
    font-family:var(--font-display, 'Space Grotesk', sans-serif);
    font-size:1.05rem;
    font-weight:700;
    line-height:1.1;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
  }
  .auth-path-description{
    font-size:0.72rem;
    line-height:1.58;
    color:var(--auth-text, var(--text, #dce7f1));
  }
  .auth-benefit-list{
    display:grid;
    gap:0.44rem;
  }
  .auth-benefit-item{
    display:grid;
    grid-template-columns:auto 1fr;
    gap:0.5rem;
    align-items:start;
    font-size:0.68rem;
    line-height:1.5;
    color:var(--auth-text, var(--text, #dce7f1));
  }
  .auth-benefit-dot{
    width:9px;
    height:9px;
    border-radius:999px;
    margin-top:0.22rem;
    background:var(--auth-accent, var(--brand-accent, #52d4c8));
    box-shadow:0 0 0 5px var(--auth-accent-soft, rgba(82,212,200,0.18));
  }
  .auth-form-head{
    display:grid;
    gap:0.32rem;
    margin-bottom:1rem;
  }
  .auth-form-title{
    font-family:var(--font-display, 'Space Grotesk', sans-serif);
    font-size:1.28rem;
    line-height:1.05;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
  }
  .auth-form-support{
    font-size:0.72rem;
    line-height:1.6;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-mode-switch{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:0.65rem;
    margin-bottom:1rem;
  }
  .auth-mode-button{
    width:100%;
    display:grid;
    gap:0.2rem;
    justify-items:start;
    min-height:76px;
    padding:0.9rem 0.95rem;
    border-radius:18px;
    border:1px solid var(--auth-tertiary-border, var(--border, rgba(255,255,255,0.14)));
    background:var(--auth-tertiary-bg, rgba(15, 24, 34, 0.74));
    color:var(--auth-tertiary-text, var(--text, #dce7f1));
    text-align:left;
    transition:transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    cursor:pointer;
  }
  .auth-mode-button:hover{
    transform:translateY(-1px);
    border-color:var(--auth-border-strong, var(--border-strong, rgba(126,173,190,0.32)));
    box-shadow:var(--auth-soft-shadow, 0 10px 24px rgba(2,10,18,0.24));
  }
  .auth-mode-button[data-active="true"]{
    border-color:var(--auth-border-strong, var(--border-strong, rgba(126,173,190,0.32)));
    background:linear-gradient(180deg, var(--auth-surface-strong, var(--surface-2, #132432)) 0%, var(--auth-surface, var(--surface-1, #0f1d29)) 100%);
    box-shadow:0 0 0 1px var(--auth-accent-soft, rgba(82,212,200,0.18)), var(--auth-soft-shadow, 0 10px 24px rgba(2,10,18,0.24));
  }
  .auth-mode-title{
    font-size:0.82rem;
    font-weight:800;
    line-height:1.18;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
  }
  .auth-mode-description{
    font-size:0.62rem;
    line-height:1.45;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-fieldset{
    display:grid;
    gap:0.78rem;
  }
  .auth-field-row{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:0.75rem;
  }
  .auth-field{
    display:grid;
    gap:0.34rem;
  }
  .auth-field-label{
    font-size:0.6rem;
    font-weight:700;
    letter-spacing:0.1em;
    text-transform:uppercase;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-field-input{
    width:100%;
    min-height:50px;
    border-radius:16px;
    border:1px solid var(--auth-border, var(--border, rgba(255,255,255,0.14)));
    background:var(--auth-input-bg, var(--input-bg, #122432));
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
    font-family:var(--font-body, 'Manrope', sans-serif);
    font-size:0.76rem;
    line-height:1.35;
    padding:0.85rem 0.95rem;
    transition:border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    outline:none;
    appearance:none;
  }
  .auth-field-input::placeholder{color:var(--auth-text-muted, var(--muted, #6f8995))}
  .auth-field-input:focus{
    border-color:var(--auth-border-strong, var(--border-strong, rgba(126,173,190,0.32)));
    background:var(--auth-input-bg-focus, var(--input-bg-focus, #162c3d));
    box-shadow:0 0 0 4px var(--auth-focus-ring, var(--focus-ring, rgba(82,212,200,0.22)));
  }
  .auth-action-stack{
    display:grid;
    gap:0.75rem;
    margin-top:0.15rem;
  }
  .auth-action{
    width:100%;
    min-height:52px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:0.5rem;
    padding:0.85rem 1rem;
    border-radius:16px;
    font-family:var(--font-body, 'Manrope', sans-serif);
    font-size:0.78rem;
    font-weight:800;
    letter-spacing:0.02em;
    text-align:center;
    text-decoration:none;
    cursor:pointer;
    transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }
  .auth-action:hover{transform:translateY(-1px)}
  .auth-action:active{transform:translateY(0)}
  .auth-action:disabled{
    cursor:not-allowed;
    transform:none;
    box-shadow:none;
    background:var(--auth-action-disabled-bg, rgba(36,49,64,0.9)) !important;
    color:var(--auth-action-disabled-text, #9bafbf) !important;
    border-color:var(--auth-border, var(--border, rgba(255,255,255,0.14))) !important;
    opacity:1;
  }
  .auth-action[data-auth-variant="primary"]{
    border:1px solid var(--auth-primary-border, var(--cta-border, rgba(255,255,255,0.24)));
    background:var(--auth-primary-bg, var(--cta-bg, linear-gradient(135deg, #5ee1d4 0%, #4b8fda 100%)));
    color:var(--auth-primary-text, var(--accent-contrast, #07131b));
    box-shadow:0 18px 32px rgba(10, 18, 30, 0.24), inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .auth-action[data-auth-variant="primary"]:hover{
    box-shadow:0 22px 36px rgba(10, 18, 30, 0.28), inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .auth-action[data-auth-variant="secondary"]{
    border:1px solid var(--auth-secondary-border, var(--border-strong, rgba(126,173,190,0.32)));
    background:var(--auth-secondary-bg, linear-gradient(180deg, rgba(18,34,47,0.92) 0%, rgba(12,24,35,0.98) 100%));
    color:var(--auth-secondary-text, var(--text-strong, #f4fbfd));
    box-shadow:var(--auth-soft-shadow, 0 10px 24px rgba(2,10,18,0.24));
  }
  .auth-action-caption{
    font-size:0.64rem;
    line-height:1.55;
    color:var(--auth-text-soft, var(--text-soft, #8ea7b8));
  }
  .auth-local-cta{
    display:grid;
    gap:0.78rem;
    padding:1rem;
    border-radius:22px;
    border:1px solid var(--auth-border, var(--border, rgba(255,255,255,0.14)));
    background:linear-gradient(180deg, var(--auth-panel-soft, rgba(9,18,28,0.78)) 0%, var(--auth-surface, var(--surface-1, #0f1d29)) 100%);
    box-shadow:var(--auth-soft-shadow, 0 10px 24px rgba(2,10,18,0.24));
  }
  .auth-local-cta-head{
    display:grid;
    gap:0.3rem;
  }
  .auth-local-cta-title{
    font-size:0.86rem;
    font-weight:800;
    line-height:1.2;
    color:var(--auth-text-strong, var(--text-strong, #f4fbfd));
  }
  .auth-local-cta-description{
    font-size:0.68rem;
    line-height:1.58;
    color:var(--auth-text, var(--text, #dce7f1));
  }
  .auth-error{
    padding:0.88rem 0.95rem;
    border-radius:16px;
    border:1px solid rgba(212, 151, 55, 0.42);
    background:rgba(92, 56, 12, 0.28);
    color:#ffd590;
    font-size:0.68rem;
    line-height:1.58;
  }
  @media (max-width: 960px){
    .auth-entry-shell{grid-template-columns:minmax(0, 1fr)}
    .auth-title{max-width:none}
  }
  @media (max-width: 640px){
    .auth-entry-root{padding:0.85rem}
    .auth-entry-rail,
    .auth-entry-form{border-radius:24px; padding:1rem}
    .auth-path-grid,
    .auth-mode-switch,
    .auth-field-row{grid-template-columns:minmax(0, 1fr)}
    .auth-brand-row{margin-bottom:0.8rem}
    .auth-title{font-size:1.7rem}
  }
  @media (prefers-contrast: more){
    .auth-entry-rail,
    .auth-entry-form,
    .auth-path-card,
    .auth-local-cta,
    .auth-mode-button,
    .auth-field-input,
    .auth-action{
      border-width:2px;
    }
    .auth-action,
    .auth-mode-button{
      box-shadow:none;
    }
  }
  @media (forced-colors: active){
    .auth-entry-root,
    .auth-entry-rail,
    .auth-entry-form,
    .auth-path-card,
    .auth-local-cta,
    .auth-mode-button,
    .auth-field-input,
    .auth-action,
    .auth-status-badge,
    .auth-brand-mark,
    .auth-error{
      forced-color-adjust:auto;
      background:Canvas !important;
      color:CanvasText !important;
      border:1px solid CanvasText !important;
      box-shadow:none !important;
    }
    .auth-action[data-auth-variant="primary"],
    .auth-action[data-auth-variant="secondary"]{
      background:ButtonFace !important;
      color:ButtonText !important;
      border-color:ButtonText !important;
    }
    .auth-benefit-dot{
      background:CanvasText !important;
      box-shadow:none !important;
    }
  }
`;

export const buildAuthEntryTheme = ({
  brandThemeState = null,
} = {}) => {
  const cssVars = brandThemeState?.cssVars || {};
  const resolvedMode = brandThemeState?.resolvedMode === "Light" ? "Light" : "Dark";
  const isLight = resolvedMode === "Light";
  const accentBase = cssVars["--brand-accent"] || (isLight ? "#1a8b86" : "#52d4c8");
  const primaryStart = isLight
    ? darkenColor(accentBase, 0.22, "#176d72")
    : accentBase;
  const primaryEnd = isLight
    ? darkenColor(accentBase, 0.38, "#124f53")
    : cssVars["--brand-accent-hover"] || darkenColor(accentBase, 0.18, "#3fa69c");
  const primaryText = isLight
    ? "#f7fbff"
    : cssVars["--accent-contrast"] || "#041018";

  return {
    cssVars: {
      ...cssVars,
      "--auth-canvas": brandThemeState?.appBackground || "linear-gradient(180deg, #0b1118 0%, #121a26 100%)",
      "--auth-panel": cssVars["--panel-2"] || (isLight ? "rgba(244, 248, 246, 0.94)" : "rgba(15, 29, 40, 0.94)"),
      "--auth-panel-strong": cssVars["--panel-3"] || (isLight ? "rgba(237, 243, 240, 0.98)" : "rgba(18, 34, 47, 0.98)"),
      "--auth-panel-soft": cssVars["--panel"] || (isLight ? "rgba(248, 251, 249, 0.86)" : "rgba(11, 21, 30, 0.88)"),
      "--auth-surface": cssVars["--surface-1"] || (isLight ? "#f8fbf9" : "#0f1d29"),
      "--auth-surface-strong": cssVars["--surface-2"] || (isLight ? "#f0f5f3" : "#132432"),
      "--auth-border": cssVars["--border"] || (isLight ? "rgba(105, 125, 136, 0.2)" : "rgba(123, 153, 173, 0.22)"),
      "--auth-border-strong": cssVars["--border-strong"] || (isLight ? "rgba(87, 121, 134, 0.28)" : "rgba(126, 173, 190, 0.32)"),
      "--auth-text": cssVars["--text"] || (isLight ? "#17303a" : "#d8e8ee"),
      "--auth-text-strong": cssVars["--text-strong"] || (isLight ? "#0d2028" : "#f2fbfd"),
      "--auth-text-soft": cssVars["--text-soft"] || (isLight ? "#566f79" : "#89a7b4"),
      "--auth-text-muted": cssVars["--muted"] || (isLight ? "#708791" : "#6f8995"),
      "--auth-accent": cssVars["--brand-accent"] || (isLight ? "#1a8b86" : "#52d4c8"),
      "--auth-accent-soft": cssVars["--brand-accent-soft"] || (isLight ? "rgba(26, 139, 134, 0.12)" : "rgba(82, 212, 200, 0.18)"),
      "--auth-accent-glow": cssVars["--brand-accent-glow"] || (isLight ? "rgba(26, 139, 134, 0.22)" : "rgba(82, 212, 200, 0.28)"),
      "--auth-badge-bg": cssVars["--badge-bg"] || (isLight ? "rgba(26, 139, 134, 0.1)" : "rgba(82, 212, 200, 0.12)"),
      "--auth-badge-border": cssVars["--badge-border"] || (isLight ? "rgba(26, 139, 134, 0.16)" : "rgba(82, 212, 200, 0.24)"),
      "--auth-badge-text": cssVars["--badge-text"] || (isLight ? "#24504f" : "#bfece7"),
      "--auth-focus-ring": cssVars["--focus-ring"] || (isLight ? "rgba(26, 139, 134, 0.16)" : "rgba(82, 212, 200, 0.22)"),
      "--auth-input-bg": cssVars["--input-bg"] || (isLight ? "#f1f6f3" : "#122432"),
      "--auth-input-bg-focus": cssVars["--input-bg-focus"] || (isLight ? "#f8fbfa" : "#162c3d"),
      "--auth-primary-bg": `linear-gradient(135deg, ${primaryStart} 0%, ${primaryEnd} 100%)`,
      "--auth-primary-border": cssVars["--cta-border"] || (isLight ? "rgba(28, 140, 135, 0.24)" : "rgba(160, 230, 223, 0.38)"),
      "--auth-primary-text": primaryText,
      "--auth-secondary-bg": isLight
        ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,246,243,0.98) 100%)"
        : "linear-gradient(180deg, rgba(18,34,47,0.92) 0%, rgba(12,24,35,0.98) 100%)",
      "--auth-secondary-border": cssVars["--border-strong"] || (isLight ? "rgba(87, 121, 134, 0.28)" : "rgba(126, 173, 190, 0.32)"),
      "--auth-secondary-text": cssVars["--text-strong"] || (isLight ? "#0d2028" : "#f2fbfd"),
      "--auth-tertiary-bg": isLight ? "rgba(255,255,255,0.7)" : "rgba(14, 24, 34, 0.78)",
      "--auth-tertiary-border": cssVars["--border"] || (isLight ? "rgba(105, 125, 136, 0.2)" : "rgba(123, 153, 173, 0.22)"),
      "--auth-tertiary-text": cssVars["--text"] || (isLight ? "#17303a" : "#d8e8ee"),
      "--auth-action-disabled-bg": isLight ? "rgba(229,234,232,0.92)" : "rgba(36,49,64,0.92)",
      "--auth-action-disabled-text": isLight ? "#6e7d84" : "#9bafbf",
      "--auth-shadow": cssVars["--shadow-3"] || (isLight ? "0 24px 50px rgba(93, 109, 119, 0.16)" : "0 24px 54px rgba(2, 10, 18, 0.42)"),
      "--auth-soft-shadow": cssVars["--shadow-1"] || (isLight ? "0 10px 24px rgba(93, 109, 119, 0.08)" : "0 10px 24px rgba(2, 10, 18, 0.24)"),
    },
    contrastPairs: {
      primary: {
        background: primaryStart,
        foreground: primaryText,
      },
      secondary: {
        background: cssVars["--surface-1"] || (isLight ? "#f8fbf9" : "#0f1d29"),
        foreground: cssVars["--text-strong"] || (isLight ? "#0d2028" : "#f2fbfd"),
      },
      local: {
        background: cssVars["--surface-2"] || (isLight ? "#f0f5f3" : "#132432"),
        foreground: cssVars["--text-strong"] || (isLight ? "#0d2028" : "#f2fbfd"),
      },
    },
  };
};

export const buildAuthEntryViewModel = ({
  authMode = "signin",
  startupLocalResumeAvailable = false,
  authProviderUnavailable = false,
} = {}) => {
  const mode = normalizeAuthMode(authMode);
  const hasLocalPath = Boolean(startupLocalResumeAvailable || authProviderUnavailable);

  const localPathDescription = startupLocalResumeAvailable
    ? "Resume from the training data already stored on this device. Cloud backup, multi-device sync, and account recovery turn back on when you sign in."
    : "FORMA can keep working on this device while cloud sign-in is offline. Your training data stays here until the cloud path returns.";

  const subtitle = authProviderUnavailable
    ? "Cloud sign-in is offline right now. You can keep training on this device, and the local path below shows exactly what stays available."
    : startupLocalResumeAvailable
    ? "Choose between your synced account and the training data already saved on this device."
    : "Sign in or create an account to turn on syncing, backup, and recovery while keeping FORMA local-first.";

  return {
    eyebrow: "FORMA account access",
    title: "Choose how you want to continue",
    subtitle,
    statusBadges: [
      startupLocalResumeAvailable ? "Local data available on this device" : null,
      authProviderUnavailable ? "Cloud sign-in temporarily unavailable" : "Cloud sync ready when you are",
    ].filter(Boolean),
    pathCards: [
      {
        id: "cloud",
        kicker: authProviderUnavailable ? "Cloud account offline" : "Cloud account",
        title: authProviderUnavailable ? "Reconnect later, keep data safe" : "Sync your training across devices",
        description: authProviderUnavailable
          ? "Email sign-in, backup, and account recovery are temporarily unavailable. Nothing is wrong with your local training history."
          : "Use your FORMA account for cloud sync, backup, account controls, and recovery on a new device.",
        benefits: authProviderUnavailable
          ? [
              "Cloud account access returns as soon as the auth provider is available again.",
              "Local progress does not disappear while the cloud path is offline.",
              "Use local mode now, then sign in later to resume synced access.",
            ]
          : [
              "Sync plans, check-ins, and settings with your account.",
              "Restore your training state on a new device.",
              "Keep account controls and recovery tied to your email.",
            ],
        emphasis: "strong",
        tone: "cloud",
      },
      {
        id: "local",
        kicker: startupLocalResumeAvailable ? "On this device" : "Local mode",
        title: startupLocalResumeAvailable ? "Continue with the data on this device" : "Keep training without the cloud",
        description: localPathDescription,
        benefits: startupLocalResumeAvailable
          ? [
              "Uses the training history already saved in this browser.",
              "No email verification or cloud availability needed.",
              "You can sign in later to turn sync and recovery back on.",
            ]
          : [
              "Starts or continues in device-only storage.",
              "No cloud backup, no recovery email, and no multi-device sync yet.",
              "Best for resilience, testing, or temporary offline access.",
            ],
        emphasis: hasLocalPath ? "strong" : "quiet",
        tone: "local",
      },
    ],
    form: {
      title: mode === "signup" ? "Create your account" : "Sign in",
      description: mode === "signup"
        ? "Create the account first, then finish setup with the same intake flow you get after sign-in."
        : "Use the email tied to your FORMA account to restore cloud sync, backup, and account controls.",
      modeOptions: [
        {
          id: "signin",
          label: "Sign in",
          description: "Use your existing account",
          variant: AUTH_ACTION_VARIANTS.tertiary,
          active: mode === "signin",
        },
        {
          id: "signup",
          label: "Create account",
          description: "Start a new cloud profile",
          variant: AUTH_ACTION_VARIANTS.tertiary,
          active: mode === "signup",
        },
      ],
      primaryAction: {
        label: mode === "signup" ? "Create account" : "Sign in",
        variant: AUTH_ACTION_VARIANTS.primary,
      },
      primaryCaption: mode === "signup"
        ? "Turns on cloud backup and lets you recover this training state on another device."
        : "Signing in turns cloud sync, backup, and account controls back on for this device.",
    },
    localAction: hasLocalPath ? {
      title: startupLocalResumeAvailable ? "Continue with local data" : "Continue in local mode",
      label: startupLocalResumeAvailable ? "Continue with local data" : "Continue in local mode",
      description: localPathDescription,
      badge: startupLocalResumeAvailable ? "This device" : "Local mode",
      variant: AUTH_ACTION_VARIANTS.secondary,
    } : null,
  };
};
