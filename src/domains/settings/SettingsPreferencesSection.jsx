import React from "react";

import { SettingsFieldRow } from "./SettingsFieldRow.jsx";
import {
  SETTINGS_BODY_STYLE,
  SETTINGS_CHIP_ROW_STYLE,
  SETTINGS_DIVIDER_STYLE,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_INTRO_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_SUBPANEL_STYLE,
  buildSettingsPillStyle,
} from "./settings-ui.js";

export function SettingsPreferencesSection({
  colors,
  trainingPrefs = {},
  nutritionPrefs = {},
  appearance = {},
  notifications = {},
  showEnvEditor = false,
  onToggleEnvEditor = () => {},
  onPatchSettings = () => {},
  onPatchNutritionPreferences = () => {},
  AppearanceThemeSectionComponent = null,
}) {
  const patchTrainingPreferences = (patch = {}) => {
    onPatchSettings({ trainingPreferences: { ...trainingPrefs, ...patch } });
  };

  const patchNutritionPreferences = (patch = {}) => {
    onPatchNutritionPreferences({ ...nutritionPrefs, ...patch });
  };

  const patchNotifications = (patch = {}) => {
    onPatchSettings({ notifications: { ...notifications, ...patch } });
  };

  const AppearanceSection = AppearanceThemeSectionComponent;
  const cuisineOptions = [
    ["mexican", "Mexican"],
    ["mediterranean", "Mediterranean"],
    ["asian", "Asian bowls"],
    ["italian", "Italian"],
    ["american_grill", "American grill"],
    ["middle_eastern", "Middle Eastern"],
  ];
  const selectedCuisines = Array.isArray(nutritionPrefs?.preferredCuisines) ? nutritionPrefs.preferredCuisines : [];
  const toggleCuisine = (cuisineKey = "") => {
    const safeKey = String(cuisineKey || "").trim().toLowerCase();
    if (!safeKey) return;
    const nextCuisines = selectedCuisines.includes(safeKey)
      ? selectedCuisines.filter((value) => value !== safeKey)
      : [...selectedCuisines, safeKey];
    patchNutritionPreferences({ preferredCuisines: nextCuisines });
  };

  return (
    <section data-testid="settings-preferences-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:"var(--brand-accent)", marginBottom:0 }}>PREFERENCES</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Keep defaults, appearance, and reminder status simple without pretending unfinished delivery features are already live.
        </div>
      </div>
      <div style={{ ...SETTINGS_PANEL_STYLE, gap:"0.12rem" }}>
        <SettingsFieldRow label="Default environment" helper="Used unless Today overrides the setup for a single session.">
          <div style={{ display:"grid", gap:"0.35rem", maxWidth:320 }}>
            <button className="btn" onClick={onToggleEnvEditor} style={{ justifyContent:"space-between", fontSize:"0.56rem", color:"var(--text-strong)", borderColor:"var(--border)" }}>
              <span>{trainingPrefs?.defaultEnvironment || "Home"}</span>
              <span>{showEnvEditor ? "Hide" : "Edit"}</span>
            </button>
            {showEnvEditor && (
              <div style={{ display:"grid", gap:"0.28rem" }}>
                <select value={trainingPrefs?.defaultEnvironment || "Home"} onChange={(e) => patchTrainingPreferences({ defaultEnvironment: e.target.value })}>
                  {["Home", "Gym", "Travel"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
                <div style={{ fontSize:"0.5rem", color:"var(--text-soft)", lineHeight:1.45 }}>
                  Session-by-session changes still happen from Today.
                </div>
              </div>
            )}
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Weekly check-in day" helper="Sets the anchor day for weekly review prompts.">
          <div style={{ maxWidth:220 }}>
            <select value={trainingPrefs?.weeklyCheckinDay || "Sun"} onChange={(e) => patchTrainingPreferences({ weeklyCheckinDay: e.target.value })}>
              {["Sun", "Mon", "Sat"].map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Intensity preference" helper="Tells the planner how much progression risk you want it to accept.">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap:"0.3rem" }}>
            {[["Conservative", "Lower risk"], ["Standard", "Balanced"], ["Aggressive", "Higher risk"]].map(([mode, desc]) => {
              const selected = trainingPrefs?.intensityPreference === mode;
              return (
              <button
                key={mode}
                className={`btn ${selected ? "btn-selected" : ""}`}
                onClick={() => patchTrainingPreferences({ intensityPreference: mode })}
                style={{
                  fontSize:"0.54rem",
                  textAlign:"left",
                  minWidth:0,
                  whiteSpace:"normal",
                  lineHeight:1.35,
                  padding:"0.62rem 0.68rem",
                }}
              >
                <div>{mode}</div>
                <div style={{ fontSize:"0.46rem", color:"var(--text-soft)", marginTop:"0.1rem" }}>{desc}</div>
              </button>
              );
            })}
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Nutrition defaults" helper="Make calorie intent explicit and nudge meal suggestions toward food you actually like.">
          <div style={{ display:"grid", gap:"0.55rem" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 180px),1fr))", gap:"0.45rem" }}>
              <label style={{ display:"grid", gap:"0.18rem" }}>
                <span style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.4 }}>Maintenance estimate</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="25"
                  value={nutritionPrefs?.maintenanceEstimateCalories ?? ""}
                  placeholder="Auto"
                  onChange={(e) => patchNutritionPreferences({ maintenanceEstimateCalories: e.target.value })}
                />
              </label>
              <label style={{ display:"grid", gap:"0.18rem" }}>
                <span style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.4 }}>Weekly cut target</span>
                <select
                  value={nutritionPrefs?.weeklyDeficitTargetCalories ?? ""}
                  onChange={(e) => patchNutritionPreferences({ weeklyDeficitTargetCalories: e.target.value })}
                >
                  <option value="">Auto</option>
                  <option value="0">Maintain</option>
                  <option value="900">Performance-first cut</option>
                  <option value="1600">Moderate cut</option>
                  <option value="2200">Assertive cut</option>
                </select>
              </label>
            </div>
            <div style={SETTINGS_BODY_STYLE}>
              Leave maintenance blank if you want FORMA to estimate it and label that estimate as heuristic. The weekly cut target is stored explicitly so quality and long-run days do not quietly carry the whole deficit.
            </div>
            <div style={{ display:"grid", gap:"0.28rem" }}>
              <div style={{ fontSize:"0.5rem", color:"var(--text-strong)", lineHeight:1.4 }}>Preferred cuisines</div>
              <div style={SETTINGS_CHIP_ROW_STYLE}>
                {cuisineOptions.map(([key, label]) => {
                  const selected = selectedCuisines.includes(key);
                  return (
                    <button
                      key={key}
                      className={`btn ${selected ? "btn-selected" : ""}`}
                      type="button"
                      onClick={() => toggleCuisine(key)}
                      style={{
                        fontSize:"0.52rem",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ ...SETTINGS_BODY_STYLE, fontSize:"0.48rem" }}>
                These do not change macros. They steer meal examples and fast options toward food patterns you are more likely to repeat.
              </div>
            </div>
          </div>
        </SettingsFieldRow>
      </div>
      <div style={SETTINGS_DIVIDER_STYLE}>
        <div className="sect-title" style={{ color:"var(--text-strong)", marginBottom:0 }}>APPEARANCE</div>
        {AppearanceSection ? <AppearanceSection appearance={appearance} onPatchAppearance={(nextAppearance) => onPatchSettings({ appearance: nextAppearance })} /> : null}
      </div>
      <div data-testid="settings-preferences-lower" style={SETTINGS_DIVIDER_STYLE}>
        <div className="sect-title" style={{ color:"var(--text-strong)", marginBottom:0 }}>REMINDER STATUS</div>
        <div data-testid="settings-notifications-section" style={{ ...SETTINGS_PANEL_STYLE, gap:"0.12rem" }}>
          <div
            data-testid="settings-reminders-status"
            style={SETTINGS_SUBPANEL_STYLE}
          >
            <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ fontSize:"0.58rem", color:"var(--text-strong)", lineHeight:1.4 }}>Push reminders are planned, not live.</div>
              <span className="tag" style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-3)", borderColor:"var(--border)", uppercase:true })}>Planned</span>
            </div>
            <div style={SETTINGS_BODY_STYLE}>
              FORMA does not currently have a production push subscription, service worker delivery path, or verified background reminder flow. Reminder choices below are shown as draft preferences only.
            </div>
          </div>
          <SettingsFieldRow label="Pause all reminders" helper="Draft setting only until reminder delivery is wired and verified.">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"var(--text-soft)", minWidth:0, opacity:0.62 }}>
              <input type="checkbox" checked={Boolean(notifications?.allOff)} disabled onChange={(e) => patchNotifications({ allOff: e.target.checked })} />
              <span>All reminders off</span>
            </label>
          </SettingsFieldRow>
          <SettingsFieldRow label="Weekly reminder" helper="Draft preference only. No production push delivery is active yet.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 180px),1fr))", gap:"0.35rem", alignItems:"center", minWidth:0, opacity:0.62 }}>
              <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"var(--text-soft)", minWidth:0, lineHeight:1.4 }}>
                <input type="checkbox" checked={Boolean(notifications?.weeklyReminderOn)} disabled onChange={(e) => patchNotifications({ weeklyReminderOn: e.target.checked })} />
                <span>Send weekly reminder</span>
              </label>
              <div style={{ maxWidth:180 }}>
                <input type="time" value={notifications?.weeklyReminderTime || "18:00"} disabled onChange={(e) => patchNotifications({ weeklyReminderTime: e.target.value })} />
              </div>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Coach proactive nudge" helper="Draft preference only. No live nudge delivery is available yet.">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"var(--text-soft)", minWidth:0, lineHeight:1.4, opacity:0.62 }}>
              <input type="checkbox" checked={Boolean(notifications?.proactiveNudgeOn)} disabled onChange={(e) => patchNotifications({ proactiveNudgeOn: e.target.checked })} />
              <span>Send coach nudge</span>
            </label>
          </SettingsFieldRow>
        </div>
      </div>
    </section>
  );
}
