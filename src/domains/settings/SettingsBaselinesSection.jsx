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
  children = null,
}) {
  return (
    <section data-testid="settings-baselines-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:colors.amber, marginBottom:0 }}>PLAN INPUTS</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Add the inputs that matter now. Everything else can wait until it meaningfully improves accuracy.
        </div>
      </div>
      {focusSection === "metrics" && (
        <div style={{ ...SETTINGS_SUBPANEL_STYLE, color:colors.amber, lineHeight:1.5 }}>
          Opened from Plan because a few inputs are still needed before the next block can get more specific.
        </div>
      )}
      <div data-testid="settings-metrics-baselines" style={SETTINGS_PANEL_STYLE}>
        {children}
      </div>
    </section>
  );
}
