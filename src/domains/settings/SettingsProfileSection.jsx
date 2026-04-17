import React from "react";

import { SettingsFieldRow } from "./SettingsFieldRow.jsx";

export function SettingsProfileSection({
  colors,
  accountProfileDraft = {},
  unitSettings = {},
  onChangeDraft = () => {},
  onSaveProfile = () => {},
}) {
  const handleDraftPatch = (patch = {}) => {
    onChangeDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <section data-testid="settings-profile-section" style={{ borderTop:"1px solid var(--border)", paddingTop:"0.75rem", display:"grid", gap:"0.35rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:"var(--brand-accent)", marginBottom:0 }}>PROFILE</div>
        <div style={{ fontSize:"0.56rem", color:"var(--text-soft)", lineHeight:1.5 }}>
          Keep the athlete basics clear: identity, units, body metrics, and training age.
        </div>
      </div>
      <div style={{ border:"1px solid var(--border)", borderRadius:12, background:"var(--surface-1)", padding:"0.55rem 0.75rem", display:"grid", gap:"0.1rem" }}>
        <SettingsFieldRow label="Display name" helper="Shown across the app and coach surfaces.">
          <div style={{ maxWidth:360 }}>
            <input value={accountProfileDraft.name || ""} onChange={(e) => handleDraftPatch({ name: e.target.value })} placeholder="Display name" />
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Timezone" helper="Used for scheduling, reminders, and daily rollovers.">
          <div style={{ maxWidth:360 }}>
            <input value={accountProfileDraft.timezone || ""} onChange={(e) => handleDraftPatch({ timezone: e.target.value })} placeholder="America/Chicago" />
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Birth year" helper="Keeps age context consistent without compressing it into the main row.">
          <div style={{ maxWidth:220 }}>
            <input type="number" value={accountProfileDraft.birthYear || ""} onChange={(e) => handleDraftPatch({ birthYear: e.target.value })} placeholder="1990" />
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Weight unit" helper="Choose the unit shown for bodyweight.">
          <div style={{ maxWidth:220 }}>
            <select value={accountProfileDraft.unitsWeight || "lbs"} onChange={(e) => handleDraftPatch({ unitsWeight: e.target.value })}>
              <option value="lbs">Pounds (lb)</option>
              <option value="kg">Kilograms (kg)</option>
            </select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Current bodyweight" helper={`Stored in ${accountProfileDraft.unitsWeight || unitSettings?.weight || "lbs"}.`}>
          <div style={{ maxWidth:220 }}>
            <input type="number" step="0.1" value={accountProfileDraft.weight || ""} onChange={(e) => handleDraftPatch({ weight: e.target.value })} placeholder={`Weight (${accountProfileDraft.unitsWeight || unitSettings?.weight || "lbs"})`} />
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Height unit" helper="Choose how height is entered and displayed.">
          <div style={{ maxWidth:220 }}>
            <select value={accountProfileDraft.unitsHeight || "ft_in"} onChange={(e) => handleDraftPatch({ unitsHeight: e.target.value })}>
              <option value="ft_in">Feet and inches</option>
              <option value="cm">Centimeters</option>
            </select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Current height" helper={accountProfileDraft.unitsHeight === "cm" ? "Enter height in centimeters." : "Enter height in feet and inches, for example 5'10\"."}>
          <div style={{ maxWidth:220 }}>
            {accountProfileDraft.unitsHeight === "cm" ? (
              <input type="number" value={accountProfileDraft.height || ""} onChange={(e) => handleDraftPatch({ height: e.target.value })} placeholder="178" />
            ) : (
              <input value={accountProfileDraft.height || ""} onChange={(e) => handleDraftPatch({ height: e.target.value })} placeholder={"5'10\""} />
            )}
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Distance unit" helper="Used for running and endurance summaries.">
          <div style={{ maxWidth:220 }}>
            <select value={accountProfileDraft.unitsDistance || "miles"} onChange={(e) => handleDraftPatch({ unitsDistance: e.target.value })}>
              <option value="miles">Miles</option>
              <option value="kilometers">Kilometers</option>
            </select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Training age" helper="Years of consistent training, not just gym exposure.">
          <div style={{ maxWidth:220 }}>
            <input type="number" min="0" max="60" value={accountProfileDraft.trainingAgeYears || ""} onChange={(e) => handleDraftPatch({ trainingAgeYears: e.target.value })} placeholder="5" />
          </div>
        </SettingsFieldRow>
        <button className="btn" onClick={onSaveProfile} style={{ width:"fit-content", fontSize:"0.52rem", color:"var(--brand-accent)", borderColor:"var(--cta-border)", marginTop:"0.3rem" }}>
          Save profile
        </button>
      </div>
    </section>
  );
}
