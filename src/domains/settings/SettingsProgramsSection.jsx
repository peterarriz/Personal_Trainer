import React from "react";

export function SettingsProgramsSection({
  colors,
  settingsPlanBasisExplanation = null,
  activeProgramDefinition = null,
  activeStyleDefinition = null,
  planManagementNotice = "",
  planManagementError = "",
  selectedSettingsProgramId = "",
  programDefinitions = [],
  programFidelityModes = {},
  selectedSettingsProgramFidelityMode = "",
  selectedSettingsProgramDefinition = null,
  settingsProgramCompatibility = null,
  compatibilityOutcomes = {},
  styleDefinitions = [],
  selectedSettingsStyleId = "",
  selectedSettingsStyleDefinition = null,
  settingsStyleCompatibility = null,
  onSelectProgramId = () => {},
  onSelectProgramFidelityMode = () => {},
  onActivateProgram = () => {},
  onClearProgramLayer = () => {},
  onSelectStyleId = () => {},
  onActivateStyle = () => {},
}) {
  const adaptiveMode = programFidelityModes.adaptToMe || "adapt_to_me";
  const structuredMode = programFidelityModes.strict || programFidelityModes.runAsWritten || "run_as_written";
  const styleMode = programFidelityModes.useAsStyle || "use_as_style";
  const incompatibleOutcome = compatibilityOutcomes.incompatible || "incompatible";

  return (
    <section data-testid="settings-programs-section" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.4rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:colors.blue, marginBottom:0 }}>PLAN STYLE</div>
        <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.5 }}>
          Choose whether the plan stays adaptive, follows a more structured template, or leans toward a specific training bias.
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.4rem" }}>
        <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.6rem" }}>
          <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>CURRENT PLAN</div>
          <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45, marginTop:"0.12rem" }}>
            {settingsPlanBasisExplanation?.basisSummary || "Adaptive plan"}
          </div>
          <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.5 }}>
            {settingsPlanBasisExplanation?.personalizationSummary || "No extra structure or bias is active."}
          </div>
        </div>
        <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.6rem" }}>
          <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>ACTIVE CHOICES</div>
          <div style={{ fontSize:"0.54rem", color:"#e2e8f0", marginTop:"0.12rem", lineHeight:1.5 }}>
            Structure: {activeProgramDefinition?.displayName || "Adaptive"}
          </div>
          <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>
            Bias: {activeStyleDefinition?.displayName || "None"}
          </div>
          <button className="btn" onClick={onClearProgramLayer} style={{ width:"fit-content", marginTop:"0.3rem", fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#2b3d55" }}>
            Back to adaptive plan
          </button>
        </div>
      </div>
      {(planManagementNotice || planManagementError) && (
        <div style={{ fontSize:"0.52rem", color:planManagementError ? colors.amber : colors.green, lineHeight:1.5 }}>
          {planManagementError || planManagementNotice}
        </div>
      )}
      <div style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.65rem", display:"grid", gap:"0.35rem" }}>
        <div style={{ display:"grid", gap:"0.14rem" }}>
          <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>STRUCTURE</div>
          <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>Pick a named plan when you want more structure than the default adaptive approach.</div>
        </div>
        <select value={selectedSettingsProgramId} onChange={(e) => onSelectProgramId(e.target.value)} style={{ fontSize:"0.54rem" }}>
          {programDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName}</option>)}
        </select>
        <select value={selectedSettingsProgramFidelityMode} onChange={(e) => onSelectProgramFidelityMode(e.target.value)} style={{ fontSize:"0.52rem" }}>
          <option value={adaptiveMode}>Adaptive</option>
          <option value={structuredMode}>Structured</option>
          <option value={styleMode}>Use as training bias</option>
        </select>
        <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{selectedSettingsProgramDefinition?.summary || "Select a program."}</div>
        {settingsProgramCompatibility?.headline && (
          <div style={{ fontSize:"0.48rem", color:settingsProgramCompatibility?.outcome === incompatibleOutcome ? colors.amber : "#8fa5c8", lineHeight:1.45 }}>
            {settingsProgramCompatibility.headline}
          </div>
        )}
        <button className="btn btn-primary" onClick={onActivateProgram} style={{ width:"fit-content", fontSize:"0.5rem" }}>
          Use this plan
        </button>
        <div style={{ borderTop:"1px solid #1e293b", paddingTop:"0.35rem", display:"grid", gap:"0.35rem" }}>
          <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>BIAS</div>
          <select value={selectedSettingsStyleId} onChange={(e) => onSelectStyleId(e.target.value)} style={{ fontSize:"0.54rem" }}>
            {styleDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName}</option>)}
          </select>
          <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{selectedSettingsStyleDefinition?.summary || "Select a bias."}</div>
          {settingsStyleCompatibility?.headline && (
            <div style={{ fontSize:"0.48rem", color:settingsStyleCompatibility?.outcome === incompatibleOutcome ? colors.amber : "#8fa5c8", lineHeight:1.45 }}>
              {settingsStyleCompatibility.headline}
            </div>
          )}
          <button className="btn" onClick={onActivateStyle} style={{ width:"fit-content", fontSize:"0.5rem", color:colors.green, borderColor:colors.green + "35" }}>
            Apply bias
          </button>
        </div>
      </div>
    </section>
  );
}
