export const SETTINGS_SECTION_STYLE = {
  borderTop: "1px solid var(--border)",
  paddingTop: "0.9rem",
  display: "grid",
  gap: "0.55rem",
};

export const SETTINGS_SECTION_HEADER_STYLE = {
  display: "grid",
  gap: "0.18rem",
};

export const SETTINGS_SECTION_INTRO_STYLE = {
  fontSize: "0.54rem",
  color: "var(--text-soft)",
  lineHeight: 1.55,
  maxWidth: 760,
};

export const SETTINGS_PANEL_STYLE = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-1)",
  padding: "0.78rem",
  display: "grid",
  gap: "0.5rem",
  minWidth: 0,
  boxShadow: "var(--shadow-1)",
};

export const SETTINGS_SUBPANEL_STYLE = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-2)",
  padding: "0.62rem 0.66rem",
  display: "grid",
  gap: "0.28rem",
  minWidth: 0,
};

export const SETTINGS_STACK_STYLE = {
  display: "grid",
  gap: "0.45rem",
  minWidth: 0,
};

export const SETTINGS_TWO_COL_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 220px),1fr))",
  gap: "0.45rem",
  alignItems: "start",
};

export const SETTINGS_ACTION_ROW_STYLE = {
  display: "flex",
  gap: "0.38rem",
  flexWrap: "wrap",
  alignItems: "center",
};

export const SETTINGS_CHIP_ROW_STYLE = {
  display: "flex",
  gap: "0.32rem",
  flexWrap: "wrap",
  alignItems: "center",
};

export const SETTINGS_DIVIDER_STYLE = {
  borderTop: "1px solid var(--border)",
  paddingTop: "0.62rem",
  display: "grid",
  gap: "0.45rem",
  minWidth: 0,
};

export const SETTINGS_LABEL_STYLE = {
  fontSize: "0.47rem",
  color: "var(--text-soft)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  lineHeight: 1.4,
};

export const SETTINGS_TITLE_STYLE = {
  fontSize: "0.6rem",
  color: "var(--text-strong)",
  lineHeight: 1.45,
  fontWeight: 600,
};

export const SETTINGS_BODY_STYLE = {
  fontSize: "0.5rem",
  color: "var(--text-soft)",
  lineHeight: 1.55,
};

export const SETTINGS_MUTED_NOTE_STYLE = {
  fontSize: "0.48rem",
  color: "var(--text-soft)",
  lineHeight: 1.5,
};

export function buildSettingsPillStyle({
  color = "var(--text-soft)",
  background = "var(--surface-2)",
  borderColor = "var(--border)",
  emphasized = false,
  uppercase = false,
} = {}) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "var(--pill-height)",
    padding: "0.18rem 0.52rem",
    borderRadius: 999,
    border: `1px solid ${borderColor}`,
    background,
    color,
    fontSize: "0.45rem",
    lineHeight: 1.1,
    fontWeight: emphasized ? 700 : 600,
    letterSpacing: uppercase ? "0.08em" : "0.01em",
    textTransform: uppercase ? "uppercase" : "none",
    whiteSpace: "nowrap",
  };
}
