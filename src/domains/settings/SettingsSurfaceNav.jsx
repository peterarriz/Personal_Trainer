import React from "react";

import { SETTINGS_SURFACES } from "./settings-surface-model.js";
import {
  SETTINGS_SECTION_HEADER_STYLE,
} from "./settings-ui.js";

export function SettingsSurfaceNav({ activeSurface = "account", onSelectSurface = () => {} }) {
  return (
    <div data-testid="settings-surface-nav" style={{ display:"grid", gap:"0.45rem" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))", gap:"0.4rem" }}>
        {SETTINGS_SURFACES.map((surface) => {
          const selected = activeSurface === surface.key;
          return (
            <button
              key={surface.key}
              type="button"
              className={`btn ${selected ? "btn-selected" : ""}`}
              data-testid={`settings-surface-${surface.key}`}
              onClick={() => onSelectSurface(surface.key)}
              style={{
                textAlign:"left",
                display:"grid",
                gap:"0.1rem",
                alignContent:"center",
                minHeight:"3.1rem",
                padding:"0.64rem 0.72rem",
                background:selected ? "var(--accent-soft)" : "var(--surface-1)",
              }}
            >
              <span style={{ ...SETTINGS_SECTION_HEADER_STYLE, gap:"0.1rem" }}>
                <span style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.35 }}>{surface.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
