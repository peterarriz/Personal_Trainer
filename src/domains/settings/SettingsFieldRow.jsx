import React from "react";

import {
  SETTINGS_BODY_STYLE,
  SETTINGS_DIVIDER_STYLE,
} from "./settings-ui.js";

export function SettingsFieldRow({ label = "", helper = "", children = null, dataTestId = "" }) {
  return (
    <div data-testid={dataTestId || undefined} style={{ ...SETTINGS_DIVIDER_STYLE, paddingTop:"0.7rem", gap:"0.35rem" }}>
      <div style={{ display:"grid", gap:"0.14rem", minWidth:0 }}>
        <div style={{ fontSize:"0.6rem", color:"var(--text-strong)", lineHeight:1.35 }}>{label}</div>
        {helper ? (
          <div style={SETTINGS_BODY_STYLE}>
            {helper}
          </div>
        ) : null}
      </div>
      <div style={{ minWidth:0 }}>
        {children}
      </div>
    </div>
  );
}
