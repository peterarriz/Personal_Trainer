import React from "react";

import {
  SETTINGS_ACTION_ROW_STYLE,
  SETTINGS_BODY_STYLE,
  SETTINGS_DIVIDER_STYLE,
  SETTINGS_LABEL_STYLE,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_INTRO_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_STACK_STYLE,
  SETTINGS_SUBPANEL_STYLE,
  SETTINGS_TITLE_STYLE,
  SETTINGS_TWO_COL_GRID_STYLE,
} from "./settings-ui.js";

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
    <section data-testid="settings-programs-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:colors.blue, marginBottom:0 }}>TRAINING STYLE</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Choose a named plan, or keep FORMA building one around your goals and routine.
        </div>
      </div>
      <div style={SETTINGS_TWO_COL_GRID_STYLE}>
        <div style={SETTINGS_SUBPANEL_STYLE}>
          <div style={SETTINGS_LABEL_STYLE}>CURRENT PLAN</div>
          <div style={SETTINGS_TITLE_STYLE}>
            {settingsPlanBasisExplanation?.basisSummary || "Built for you"}
          </div>
          <div style={SETTINGS_BODY_STYLE}>
            {settingsPlanBasisExplanation?.personalizationSummary || "No named plan or training feel is active right now."}
          </div>
        </div>
        <div style={SETTINGS_SUBPANEL_STYLE}>
          <div style={SETTINGS_LABEL_STYLE}>ACTIVE CHOICES</div>
          <div style={{ ...SETTINGS_TITLE_STYLE, fontSize:"0.56rem" }}>
            Plan: {activeProgramDefinition?.displayName || "Built for you"}
          </div>
          <div style={SETTINGS_BODY_STYLE}>
            Style: {activeStyleDefinition?.displayName || "None"}
          </div>
          <button className="btn" onClick={onClearProgramLayer} style={{ width:"fit-content", marginTop:"0.12rem", fontSize:"0.48rem" }}>
            Back to built-for-you plan
          </button>
        </div>
      </div>
      {(planManagementNotice || planManagementError) && (
        <div style={{ fontSize:"0.52rem", color:planManagementError ? colors.amber : colors.green, lineHeight:1.5 }}>
          {planManagementError || planManagementNotice}
        </div>
      )}
      <div style={{ ...SETTINGS_PANEL_STYLE, gap:"0.45rem" }}>
        <div style={SETTINGS_STACK_STYLE}>
          <div style={SETTINGS_LABEL_STYLE}>PLAN</div>
          <div style={SETTINGS_TITLE_STYLE}>Pick a named plan when you want more structure than FORMA&apos;s built-for-you approach.</div>
        </div>
        <select value={selectedSettingsProgramId} onChange={(e) => onSelectProgramId(e.target.value)} style={{ fontSize:"0.54rem" }}>
          {programDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName}</option>)}
        </select>
        <select value={selectedSettingsProgramFidelityMode} onChange={(e) => onSelectProgramFidelityMode(e.target.value)} style={{ fontSize:"0.52rem" }}>
          <option value={adaptiveMode}>Fit it to me</option>
          <option value={structuredMode}>Follow it closely</option>
          <option value={styleMode}>Use for feel</option>
        </select>
        <div style={SETTINGS_BODY_STYLE}>{selectedSettingsProgramDefinition?.summary || "Select a program."}</div>
        {settingsProgramCompatibility?.headline && (
          <div style={{ ...SETTINGS_BODY_STYLE, fontSize:"0.48rem", color:settingsProgramCompatibility?.outcome === incompatibleOutcome ? colors.amber : "var(--text-soft)" }}>
            {settingsProgramCompatibility.headline}
          </div>
        )}
        <button className="btn btn-primary" onClick={onActivateProgram} style={{ width:"fit-content", fontSize:"0.5rem" }}>
          Use this plan
        </button>
        <div style={SETTINGS_DIVIDER_STYLE}>
          <div style={SETTINGS_LABEL_STYLE}>STYLE</div>
          <select value={selectedSettingsStyleId} onChange={(e) => onSelectStyleId(e.target.value)} style={{ fontSize:"0.54rem" }}>
            {styleDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName}</option>)}
          </select>
          <div style={SETTINGS_BODY_STYLE}>{selectedSettingsStyleDefinition?.summary || "Select a style."}</div>
          {settingsStyleCompatibility?.headline && (
            <div style={{ ...SETTINGS_BODY_STYLE, fontSize:"0.48rem", color:settingsStyleCompatibility?.outcome === incompatibleOutcome ? colors.amber : "var(--text-soft)" }}>
              {settingsStyleCompatibility.headline}
            </div>
          )}
          <div style={SETTINGS_ACTION_ROW_STYLE}>
            <button className="btn" onClick={onActivateStyle} style={{ width:"fit-content", fontSize:"0.5rem", color:colors.green, borderColor:colors.green + "35" }}>
            Use this style
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
