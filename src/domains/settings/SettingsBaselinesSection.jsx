import React from "react";

export function SettingsBaselinesSection({
  colors,
  focusSection = "",
  children = null,
}) {
  return (
    <section data-testid="settings-baselines-section" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.4rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:colors.amber, marginBottom:0 }}>PLAN INPUTS</div>
        <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.5 }}>
          Add the inputs that matter now. Everything else can wait until it meaningfully improves accuracy.
        </div>
      </div>
      {focusSection === "metrics" && (
        <div style={{ fontSize:"0.5rem", color:colors.amber, lineHeight:1.5 }}>
          Opened from Plan because a few inputs are still needed before the next block can get more specific.
        </div>
      )}
      <div data-testid="settings-metrics-baselines" style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.65rem" }}>
        {children}
      </div>
    </section>
  );
}
