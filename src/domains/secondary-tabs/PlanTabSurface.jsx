import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { buildPlanSurfaceModel } from "../../services/plan-surface-service.js";
import { buildSharedSessionSummaryModel } from "../../services/session-summary-surface-service.js";
import {
  SurfaceActions,
  SurfaceCard,
  SurfaceDisclosure,
  SurfaceHeading,
  SurfaceHero,
  SurfaceHeroCopy,
  SurfaceHeroHeader,
  SurfaceMetaRow,
  SurfacePill,
  SurfaceQuietPanel,
  SurfaceRecommendationCard,
  SurfaceStack,
} from "../../components/SurfaceSystem.jsx";
import { CompactTrustRow } from "../../components/CompactTrustRow.jsx";
import { SessionSummaryBlock } from "../../components/SessionSummaryBlock.jsx";

export function PlanTab({
 planDay = null,
 surfaceModel = null,
 currentPlanWeek = null,
 currentWeek = 1,
 logs = {},
 bodyweights = [],
 dailyCheckins = {},
 weeklyCheckins = {},
 personalization = {},
 athleteProfile = null,
 rollingHorizon = [],
 syncSurfaceModel = null,
 todayWorkout: legacyTodayWorkout = null,
 onManagePlan = () => {},
 onOpenToday = () => {},
 onOpenLog = () => {},
 runtime = {},
}) {
 const { C, PLAN_STATUS_TONES, sanitizeDisplayText, toTestIdFragment, SyncStateCallout, CompactSyncStatus } = runtime;
 const buildCurrentDaySessionLabel = useCallback((day = null, { isHybrid = false, fallbackLabel = "" } = {}) => {
  if (!day) return "";
  if (isHybrid || day?.isHybrid) return "Run + strength";
  if (day?.isRest) return sanitizeDisplayText(fallbackLabel || day?.title || "Recovery");
  if (fallbackLabel) return sanitizeDisplayText(fallbackLabel);
  const title = sanitizeDisplayText(day?.title || "");
  const detail = sanitizeDisplayText(day?.detail || "");
  return detail ? `${title} - ${detail}` : title;
 }, [sanitizeDisplayText]);
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout || null;
 const todayKey = sanitizeDisplayText(planDay?.dateKey || new Date().toISOString().split("T")[0]);
 const athleteGoals = athleteProfile?.goals || [];
 const showStorageBanner = Boolean(syncSurfaceModel?.showFullCard);
 const showQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");
 const planModel = useMemo(() => buildPlanSurfaceModel({
  planDay,
  surfaceModel,
  currentPlanWeek,
  currentWeek,
  rollingHorizon,
  logs,
  bodyweights,
  dailyCheckins,
  weeklyCheckins,
  athleteGoals,
  manualProgressInputs: personalization?.manualProgressInputs || {},
  todayWorkout,
 }), [
  planDay,
  surfaceModel,
  currentPlanWeek,
  currentWeek,
  rollingHorizon,
  logs,
  bodyweights,
  dailyCheckins,
  weeklyCheckins,
  athleteGoals,
  personalization?.manualProgressInputs,
  todayWorkout,
 ]);
 const [selectedCurrentDayKey, setSelectedCurrentDayKey] = useState("");
 const [selectedPreviewDayKey, setSelectedPreviewDayKey] = useState("");
 const currentWeekDays = Array.isArray(planModel?.currentWeekDays) ? planModel.currentWeekDays : [];
 const previewWeekDays = Array.isArray(planModel?.previewWeek?.days) ? planModel.previewWeek.days : [];
 const currentDayModel = planModel?.currentDay || currentWeekDays.find((day) => day?.isToday) || currentWeekDays[0] || null;
 const selectedCurrentDay = currentWeekDays.find((day) => String(day?.dayKey) === String(selectedCurrentDayKey)) || null;
 const selectedPreviewDay = previewWeekDays.find((day) => String(day?.dayKey) === String(selectedPreviewDayKey)) || null;
 const currentDayIsHybrid = useMemo(() => (
  /run \+ strength/i.test(String(surfaceModel?.display?.sessionType || ""))
  || Boolean(currentDayModel?.isHybrid)
  || Boolean(todayWorkout?.run && todayWorkout?.strengthDuration)
  || String(todayWorkout?.type || "").toLowerCase() === "run+strength"
 ), [
  surfaceModel?.display?.sessionType,
  currentDayModel?.isHybrid,
  todayWorkout?.run,
  todayWorkout?.strengthDuration,
  todayWorkout?.type,
 ]);
 const currentDaySummary = useMemo(() => buildSharedSessionSummaryModel({
  surfaceModel: currentDayModel
   ? {
    ...surfaceModel,
    display: {
     ...(surfaceModel?.display || {}),
     sessionLabel: buildCurrentDaySessionLabel(currentDayModel, {
      isHybrid: currentDayIsHybrid,
      fallbackLabel: currentDayModel?.isToday ? sanitizeDisplayText(todayWorkout?.label || "") : "",
     }) || surfaceModel?.display?.sessionLabel || "",
     sessionType: currentDayModel?.isRest
      ? "Recovery"
      : currentDayIsHybrid
      ? surfaceModel?.display?.sessionType || "Run + strength"
      : currentDayModel?.title || surfaceModel?.display?.sessionType || "",
     structure: currentDayModel?.detail || surfaceModel?.display?.structure || "",
    },
   }
   : surfaceModel,
  sessionContextLine: currentDayModel?.isToday
   ? "Today is the active session inside the committed week."
   : "This is where the current day sits inside the committed week.",
  currentWeekFocus: planModel?.intentLine || currentPlanWeek?.weeklyIntent?.focus || currentPlanWeek?.summary || "",
 }), [
  surfaceModel,
  currentDayModel,
  currentDayModel?.isToday,
  currentDayIsHybrid,
  buildCurrentDaySessionLabel,
  planModel?.intentLine,
  currentPlanWeek?.weeklyIntent?.focus,
  currentPlanWeek?.summary,
  todayWorkout?.label,
  sanitizeDisplayText,
 ]);

 useEffect(() => {
  if (selectedCurrentDayKey && !currentWeekDays.some((day) => String(day?.dayKey) === String(selectedCurrentDayKey))) {
   setSelectedCurrentDayKey("");
  }
 }, [selectedCurrentDayKey, currentWeekDays]);

 useEffect(() => {
  if (selectedPreviewDayKey && !previewWeekDays.some((day) => String(day?.dayKey) === String(selectedPreviewDayKey))) {
   setSelectedPreviewDayKey("");
  }
 }, [selectedPreviewDayKey, previewWeekDays]);

 const buildStatusPillStyle = (tone = null) => ({
  color: tone?.color || "var(--consumer-text-muted)",
  background: tone?.background || "var(--consumer-subpanel)",
  borderColor: tone?.borderColor || "var(--consumer-border-strong)",
 });

 const buildGoalDistanceTone = (statusKey = "") => {
  if (statusKey === "on_track") return { color:C.green, background:`${C.green}14`, borderColor:`${C.green}30` };
  if (statusKey === "needs_data") return { color:C.amber, background:`${C.amber}14`, borderColor:`${C.amber}30` };
  if (statusKey === "review_based") return { color:C.purple, background:`${C.purple}14`, borderColor:`${C.purple}30` };
  return { color:C.blue, background:`${C.blue}14`, borderColor:`${C.blue}30` };
 };

 const renderDayDetailPanel = (day = null, { preview = false } = {}) => {
  if (!day) {
   return (
    <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
     {preview ? "Pick an upcoming day to see the likely session." : "Pick a day to see the session and next step."}
    </div>
   );
  }

  const showTodayAction = !preview && Boolean(day?.isToday);
  const showLogAction = !preview && Boolean(day?.dateKey && day.dateKey <= todayKey);
  const detailTone = buildStatusPillStyle(day?.status?.tone);

  return (
   <div data-testid="planned-session-plan" style={{ display:"grid", gap:"0.42rem" }}>
    <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
     <div style={{ display:"grid", gap:"0.12rem", minWidth:0 }}>
      <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
       {preview ? "Preview day" : "Day context"}
      </div>
      <div style={{ fontSize:"0.68rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
       {day.title}
      </div>
      {!!day.detail && (
       <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-soft)", lineHeight:1.5 }}>
        {day.detail}
       </div>
      )}
     </div>
     <SurfacePill style={detailTone}>{day.status?.label || (preview ? "Preview" : "Upcoming")}</SurfacePill>
    </div>
    <CompactTrustRow model={day?.trustModel || null} dataTestId="program-day-trust-row" />
    <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
     {preview
      ? "Preview weeks are forecasts. They can still change."
      : day.status?.detail
      ? day.status.detail
      : day?.isToday
      ? "Do this session from Today, then record what happened in Log."
      : day?.dateKey && day.dateKey < todayKey
      ? "Open Log to review or correct finished days."
      : "Plan shows the week at a glance. Today has the exact session."}
    </div>
    {(showTodayAction || showLogAction) && (
     <SurfaceActions>
      {showTodayAction && (
       <button type="button" className="btn btn-primary" onClick={onOpenToday} style={{ fontSize:"0.5rem" }}>
        Open Today
       </button>
      )}
      {showLogAction && (
       <button type="button" className="btn" onClick={onOpenLog} style={{ fontSize:"0.5rem" }}>
        Open Log
       </button>
      )}
     </SurfaceActions>
    )}
   </div>
  );
 };

 return (
  <div className="fi" data-testid="program-tab" style={{ display:"grid", gap:"0.75rem" }}>
   {showStorageBanner && (
    <SyncStateCallout
     model={syncSurfaceModel}
     dataTestId="program-sync-status"
     compact
     style={{ background:"rgba(11, 20, 32, 0.76)" }}
    />
   )}

   <SurfaceHero data-testid="program-trajectory-header" accentColor={C.blue} style={{ borderColor:`${C.blue}26` }}>
    <SurfaceStack gap="0.55rem">
     <SurfaceHeroHeader>
      <SurfaceHeroCopy>
       <SurfaceHeading
        eyebrow="Plan"
        title={planModel?.weekLabel || "This week"}
        titleTestId="program-trajectory-title"
        supporting={planModel?.intentLine || "This week moves the active goals forward without adding noise."}
        eyebrowColor={C.blue}
        titleSize="hero"
       />
      </SurfaceHeroCopy>
      <SurfaceMetaRow style={{ justifyContent:"flex-end" }}>
       <SurfacePill style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}24`, fontWeight:750 }}>
        {planModel?.commitmentLabel || "Committed week"}
       </SurfacePill>
       {!!planModel?.previewWeek?.label && <SurfacePill>Next: {planModel.previewWeek.label}</SurfacePill>}
       {showQuietSyncChip && (
        <div style={{ minWidth:210 }}>
         <CompactSyncStatus
          model={syncSurfaceModel}
          dataTestId="program-sync-status"
          style={{
           background:"rgba(11, 20, 32, 0.32)",
           opacity:0.88,
          }}
         />
        </div>
       )}
      </SurfaceMetaRow>
     </SurfaceHeroHeader>

     <SurfaceQuietPanel data-testid="program-current-day-context" style={{ display:"grid", gap:"0.45rem" }}>
     <SessionSummaryBlock
       model={currentDaySummary}
       accentColor={C.blue}
       titleTestId="program-canonical-session-label"
       rationaleTestId="program-change-summary"
       contextTestId="program-current-day-context-line"
       showContext
      />
      <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
       {planModel?.commitmentLine || "This week is set. Future weeks can still adjust."}
      </div>
     <CompactTrustRow model={planModel?.weekTrustModel || null} dataTestId="program-header-trust-row" />
     </SurfaceQuietPanel>

     {!!planModel?.goalDistanceItems?.length && (
      <div
       data-testid="program-goal-distance"
       style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",
        gap:"0.45rem",
       }}
      >
       {planModel.goalDistanceItems.map((item) => {
        const tone = buildGoalDistanceTone(item?.statusKey);
        const railRatio = Number.isFinite(Number(item?.progressRatio)) ? Math.max(0, Math.min(1, Number(item.progressRatio))) : null;
        return (
         <div
          key={`program-goal-distance-${item.key}`}
          data-testid={`program-goal-distance-item-${toTestIdFragment(item.key || item.summary)}`}
          style={{
           border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
           borderRadius:20,
           padding:"0.68rem 0.74rem",
           background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
           display:"grid",
           gap:"0.28rem",
           alignContent:"start",
          }}
         >
          <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
           <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
            <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
             {item.kind === "exact_metric" ? "Goal distance" : "Goal status"}
            </div>
            <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
             {item.summary}
            </div>
            <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
             {item.metricLabel}
            </div>
           </div>
           <SurfacePill style={buildStatusPillStyle(tone)}>{item.statusLabel}</SurfacePill>
          </div>

          {item.kind === "exact_metric" ? (
           <>
            <div style={{ fontSize:"0.62rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
             {item.distanceLabel}
            </div>
            <div style={{ display:"grid", gap:"0.14rem" }}>
             <div
              aria-hidden="true"
              style={{
               height:8,
               borderRadius:999,
               background:"color-mix(in srgb, var(--consumer-border) 72%, rgba(255,255,255,0.04))",
               overflow:"hidden",
               position:"relative",
              }}
             >
              {railRatio !== null && (
               <div
                style={{
                 width:`${Math.max(6, Math.round(railRatio * 100))}%`,
                 height:"100%",
                 borderRadius:999,
                 background:`linear-gradient(90deg, ${tone.background} 0%, ${tone.color} 100%)`,
                }}
               />
              )}
             </div>
             <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap" }}>
              <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.4 }}>
               {item.currentLabel}
              </div>
              <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.4 }}>
               {item.targetLabel}
              </div>
             </div>
             <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-faint)", lineHeight:1.4 }}>
              {item.baselineLabel}
             </div>
            </div>
           </>
          ) : (
           <>
            <div style={{ fontSize:"0.6rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
             {item.headline}
            </div>
            <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
             {item.detailLine}
            </div>
            {!!item.noteLine && (
             <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-faint)", lineHeight:1.45 }}>
              {item.noteLine}
             </div>
            )}
           </>
          )}
         </div>
        );
       })}
      </div>
     )}

     <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.45rem" }}>
      {Array.isArray(planModel?.alignmentItems) && planModel.alignmentItems.map((item, index) => (
       <div
        key={`program-alignment-${index}`}
        style={{
         border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
         borderRadius:20,
         padding:"0.68rem 0.74rem",
         background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
         display:"grid",
         gap:"0.18rem",
        }}
       >
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         Goal alignment
        </div>
        <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
         {item.label}
        </div>
        <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
         {item.detail}
        </div>
       </div>
      ))}
     </div>

     <SurfaceActions>
      <button type="button" className="btn btn-primary" data-testid="program-primary-cta" onClick={onOpenToday} style={{ fontSize:"0.5rem" }}>
       Open Today
      </button>
      <button type="button" className="btn" data-testid="program-secondary-cta" onClick={onOpenLog} style={{ fontSize:"0.5rem" }}>
       Open Log
      </button>
      <button type="button" className="btn" onClick={() => onManagePlan("plan")} style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)" }}>
       Edit goals
      </button>
     </SurfaceActions>
    </SurfaceStack>
   </SurfaceHero>

   <SurfaceCard data-testid="program-roadmap" style={{ display:"grid", gap:"0.48rem" }}>
    <div style={{ display:"grid", gap:"0.16rem" }}>
     <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>PLAN ARC</div>
     <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-soft)", lineHeight:1.52 }}>
      This week is set. The next few weeks show where the block is headed.
     </div>
    </div>
    <div data-testid="program-roadmap-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:"0.4rem" }}>
     {(planModel?.roadmapRows || []).map((row) => (
      <div
       key={`program-roadmap-week-${row.absoluteWeek}`}
       data-testid={`program-roadmap-week-${row.absoluteWeek}`}
       style={{
        border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
        borderRadius:20,
        background:row?.isCurrentWeek ? "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 100%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
        padding:"0.66rem 0.74rem",
        display:"grid",
        gap:"0.18rem",
       }}
      >
       <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
        <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {row.weekLabel}
        </div>
        <SurfacePill style={buildStatusPillStyle(row?.isCurrentWeek ? PLAN_STATUS_TONES.completed : PLAN_STATUS_TONES.preview)}>
         {row.stateLabel}
        </SurfacePill>
       </div>
       <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
        {row.phaseLabel}
       </div>
       <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
        {row.focus}
       </div>
      </div>
     ))}
    </div>
   </SurfaceCard>

   <SurfaceCard data-testid="program-this-week" style={{ display:"grid", gap:"0.58rem" }}>
    <div style={{ display:"grid", gap:"0.16rem" }}>
     <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>THIS WEEK</div>
     <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
      {planModel?.balanceLine || "This week is laid out below."}
     </div>
     <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
      {planModel?.currentWeekSummaryLine || "Nothing has been logged yet this week."}
     </div>
    </div>

    <div data-testid="program-current-week-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.35rem" }}>
     {currentWeekDays.map((day) => (
      <button
       key={`program-current-week-cell-${day.dayKey}`}
       type="button"
       data-testid={`program-current-week-cell-${day.dayKey}`}
       data-current-day={day.isToday ? "true" : "false"}
       onClick={() => setSelectedCurrentDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
       className="btn"
       style={{
        minHeight:112,
        padding:"0.66rem 0.72rem",
        borderRadius:20,
        borderColor:day.isToday ? `${C.blue}30` : "color-mix(in srgb, var(--consumer-border) 88%, rgba(255,255,255,0.04))",
        background:day.isToday ? "linear-gradient(180deg, rgba(60, 145, 230, 0.12) 0%, rgba(60, 145, 230, 0.06) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
        display:"grid",
        gap:"0.2rem",
        justifyItems:"start",
        textAlign:"left",
       }}
      >
       <div style={{ display:"flex", width:"100%", justifyContent:"space-between", gap:"0.25rem", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {day.dayLabel}{day.isToday ? " - Today" : ""}
        </div>
        <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
       </div>
       <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
        {day.title}
       </div>
       {!!day.detail && (
        <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
         {day.detail}
        </div>
       )}
      </button>
     ))}
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:"0.5rem" }}>
     <div style={{ display:"grid", gap:"0.32rem" }}>
      {currentWeekDays.map((day) => {
       const selected = String(selectedCurrentDayKey) === String(day.dayKey);
       return (
        <div
         key={`program-this-week-session-item-${day.dayKey}`}
         data-testid={`program-this-week-session-item-${day.dayKey}`}
         data-session-selected={selected ? "true" : "false"}
         style={{
          border:"1px solid color-mix(in srgb, var(--consumer-border) 88%, rgba(255,255,255,0.04))",
          borderRadius:20,
          background:selected ? "linear-gradient(180deg, rgba(60, 145, 230, 0.12) 0%, rgba(60, 145, 230, 0.06) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
          padding:"0.18rem",
         }}
        >
         <button
          type="button"
          className="btn"
          data-testid={`program-this-week-session-button-${day.dayKey}`}
          aria-expanded={selected ? "true" : "false"}
          onClick={() => setSelectedCurrentDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
          style={{
           width:"100%",
           minHeight:56,
           border:"none",
           background:"transparent",
           justifyContent:"space-between",
           display:"grid",
           gridTemplateColumns:"auto 1fr auto",
           gap:"0.45rem",
           textAlign:"left",
           alignItems:"center",
          }}
         >
          <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
           {day.dayLabel}
          </div>
          <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
           <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
            {day.title}
           </div>
           <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
            {day.detail || day.status?.detail}
           </div>
          </div>
          <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
         </button>
        </div>
       );
      })}
     </div>

     <div
      data-testid="program-this-week-session-detail-panel"
      style={{
       border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
       borderRadius:22,
       background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
       padding:"0.76rem 0.82rem",
       display:"grid",
       gap:"0.35rem",
       alignContent:"start",
      }}
     >
      {renderDayDetailPanel(selectedCurrentDay)}
     </div>
    </div>

    {!!planModel?.upcomingKeySessions?.length && (
     <div data-testid="program-upcoming-key-sessions" style={{ display:"grid", gap:"0.24rem" }}>
      <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
       Key sessions coming next
      </div>
      <div style={{ display:"grid", gap:"0.24rem" }}>
       {planModel.upcomingKeySessions.map((session) => (
        <div key={session.key} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.4rem", alignItems:"baseline" }}>
         <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
          {session.dayLabel}
         </div>
         <div style={{ fontSize:"0.52rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
          {session.title}{session.detail ? ` - ${session.detail}` : ""}
         </div>
         <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)" }}>
          {session.statusLabel}
         </div>
        </div>
       ))}
      </div>
     </div>
    )}
   </SurfaceCard>

   {!!planModel?.previewWeek && (
    <SurfaceCard data-testid="program-future-weeks" style={{ display:"grid", gap:"0.5rem" }}>
     <div style={{ display:"grid", gap:"0.16rem" }}>
      <div className="sect-title" style={{ color:C.purple, marginBottom:0 }}>NEXT WEEK</div>
      <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
       {planModel.previewWeek.focus}
      </div>
      <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
       {planModel.previewWeek.shapeLine}
      </div>
     </div>

     <div
      data-testid={`program-future-week-card-${planModel.previewWeek.absoluteWeek || toTestIdFragment(planModel.previewWeek.label)}`}
      style={{
       border:"1px solid var(--consumer-border)",
       borderRadius:20,
       background:"var(--consumer-panel)",
       padding:"0.72rem 0.78rem",
       display:"grid",
       gap:"0.45rem",
      }}
     >
      <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
       <div style={{ display:"grid", gap:"0.08rem" }}>
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {planModel.previewWeek.label}
        </div>
        <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
         Preview
        </div>
       </div>
       <SurfacePill style={buildStatusPillStyle(PLAN_STATUS_TONES.preview)}>Preview</SurfacePill>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"0.5rem" }}>
       <div style={{ display:"grid", gap:"0.3rem" }}>
        {previewWeekDays.map((day) => {
         const selected = String(selectedPreviewDayKey) === String(day.dayKey);
         return (
          <div
           key={`program-future-week-session-item-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
           data-testid={`program-future-week-session-item-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
           data-session-selected={selected ? "true" : "false"}
           style={{
            border:"1px solid var(--consumer-border)",
            borderRadius:18,
            background:selected ? "rgba(110, 99, 217, 0.08)" : "var(--consumer-subpanel)",
            padding:"0.18rem",
           }}
          >
           <button
            type="button"
            className="btn"
            data-testid={`program-future-week-session-button-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
            aria-expanded={selected ? "true" : "false"}
            onClick={() => setSelectedPreviewDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
            style={{
             width:"100%",
             minHeight:54,
             border:"none",
             background:"transparent",
             justifyContent:"space-between",
             display:"grid",
             gridTemplateColumns:"auto 1fr auto",
             gap:"0.45rem",
             textAlign:"left",
             alignItems:"center",
            }}
           >
            <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
             {day.dayLabel}
            </div>
            <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
             <div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
              {day.title}
             </div>
             <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
              {day.detail || day.status?.detail}
             </div>
            </div>
            <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
           </button>
          </div>
         );
        })}
       </div>

       <div
        data-testid="program-future-week-session-detail-panel"
        style={{
         border:"1px solid var(--consumer-border)",
         borderRadius:20,
         background:"var(--consumer-subpanel)",
         padding:"0.72rem 0.78rem",
         display:"grid",
         gap:"0.35rem",
         alignContent:"start",
        }}
       >
        {renderDayDetailPanel(selectedPreviewDay, { preview:true })}
       </div>
      </div>
     </div>
    </SurfaceCard>
   )}
  </div>
 );
}

// LOG TAB (POLISHED)
