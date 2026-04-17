import React from "react";

import { SETTINGS_SURFACES } from "./settings-surface-model.js";

export function SettingsSurfaceNav({ activeSurface = "account", onSelectSurface = () => {} }) {
  return (
    <div data-testid="settings-surface-nav" style={{ display:"grid", gap:"0.35rem" }}>
      <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.45 }}>
        Pick the job you want to do.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.35rem" }}>
        {SETTINGS_SURFACES.map((surface) => {
          const selected = activeSurface === surface.key;
          return (
            <button
              key={surface.key}
              type="button"
              className="btn"
              data-testid={`settings-surface-${surface.key}`}
              onClick={() => onSelectSurface(surface.key)}
              style={{
                textAlign:"left",
                display:"grid",
                gap:"0.12rem",
                color:selected ? "var(--accent-contrast)" : "var(--text-strong)",
                background:selected ? "var(--cta-bg)" : "var(--surface-1)",
                borderColor:selected ? "var(--cta-border)" : "var(--border)",
              }}
            >
              <span style={{ fontSize:"0.52rem" }}>{surface.label}</span>
              <span style={{ fontSize:"0.44rem", color:selected ? "var(--accent-contrast)" : "var(--text-soft)", lineHeight:1.4 }}>{surface.helper}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
