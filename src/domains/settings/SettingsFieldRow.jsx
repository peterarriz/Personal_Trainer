import React from "react";

export function SettingsFieldRow({ label = "", helper = "", children = null, dataTestId = "" }) {
  return (
    <div data-testid={dataTestId || undefined} style={{ display:"grid", gap:"0.3rem", padding:"0.62rem 0", borderTop:"1px solid rgba(125, 149, 176, 0.14)", minWidth:0 }}>
      <div style={{ display:"grid", gap:"0.12rem", minWidth:0 }}>
        <div style={{ fontSize:"0.62rem", color:"var(--text-strong)", lineHeight:1.35 }}>{label}</div>
        {helper ? (
          <div style={{ fontSize:"0.54rem", color:"var(--text-soft)", lineHeight:1.5 }}>
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
