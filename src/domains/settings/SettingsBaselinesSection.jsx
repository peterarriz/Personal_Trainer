import React from "react";

import {
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_INTRO_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_SUBPANEL_STYLE,
} from "./settings-ui.js";

export function SettingsBaselinesSection({
  colors,
  focusSection = "",
  onOpenPlan = () => {},
  children = null,
}) {
  return (
    <section data-testid="settings-baselines-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:colors.amber, marginBottom:0 }}>BASELINES</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Keep the few numbers that make the next block more specific.
        </div>
      </div>
      <div style={{ ...SETTINGS_SUBPANEL_STYLE, display:"flex", justifyContent:"space-between", gap:"0.6rem", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ color:"var(--text-soft)", lineHeight:1.5, maxWidth:640 }}>
          Use Plan when you want guidance. Use this page when you already know the number.
        </div>
        <button className="btn" onClick={onOpenPlan} style={{ fontSize:"0.48rem", color:colors.amber, borderColor:colors.amber + "35" }}>
          Open Plan
        </button>
      </div>
      {focusSection === "metrics" && (
        <div style={{ ...SETTINGS_SUBPANEL_STYLE, color:colors.amber, lineHeight:1.5 }}>
          Add the missing baseline here, then the next block can get more specific.
        </div>
      )}
      <div data-testid="settings-metrics-baselines" style={SETTINGS_PANEL_STYLE}>
        {children}
      </div>
    </section>
  );
}
