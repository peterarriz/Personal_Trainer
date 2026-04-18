import React from "react";

import { SETTINGS_SURFACES } from "./settings-surface-model.js";
import {
  SETTINGS_BODY_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
} from "./settings-ui.js";

export function SettingsSurfaceNav({ activeSurface = "account", onSelectSurface = () => {} }) {
  return (
    <div data-testid="settings-surface-nav" style={{ display:"grid", gap:"0.45rem" }}>
      <div style={{ ...SETTINGS_BODY_STYLE, maxWidth:420 }}>
        Pick the job you want to do.
      </div>
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
                gap:"0.14rem",
                alignContent:"start",
                minHeight:"4.35rem",
                padding:"0.72rem 0.78rem",
                background:selected ? "var(--accent-soft)" : "var(--surface-1)",
              }}
            >
              <span style={{ ...SETTINGS_SECTION_HEADER_STYLE, gap:"0.14rem" }}>
                <span style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.35 }}>{surface.label}</span>
                <span style={{ fontSize:"0.46rem", color:"var(--text-soft)", lineHeight:1.45 }}>{surface.helper}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
