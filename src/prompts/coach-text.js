export const buildWorkoutAdjustmentCoachNote = ({ plannedWorkout, adjustedWorkout, goals, currentMode, fatigueContext, timeAvailable, recentPatterns }) => {
 const plannedLabel = plannedWorkout?.label || plannedWorkout?.type || "planned session";
 const adjustedLabel = adjustedWorkout?.label || adjustedWorkout?.type || plannedLabel;
 const changed = (plannedWorkout?.type !== adjustedWorkout?.type)
 || (plannedWorkout?.label !== adjustedWorkout?.label)
 || !!adjustedWorkout?.coachOverride
 || !!adjustedWorkout?.minDay
 || !!adjustedWorkout?.reason;
 const primaryGoal = (goals || []).filter(g => g?.active).sort((a, b) => (a?.priority || 9) - (b?.priority || 9))[0]?.name || "your primary goal";
 const adjustmentLine = changed
 ? `${plannedLabel} was adjusted to ${adjustedLabel}${adjustedWorkout?.minDay ? " (short version)" : ""}.`
 : `${adjustedLabel} stays as planned today.`;
 const reasons = [
 adjustedWorkout?.reason ? `This change responds to ${String(adjustedWorkout.reason).replaceAll("_", " ")} in today's context.` : null,
 fatigueContext ? "Recovery and fatigue signals are elevated, so load was controlled to protect execution quality." : null,
 timeAvailable && Number(String(timeAvailable).replace("+", "")) <= 30 ? "Available time is tighter, so structure was condensed while keeping the key training intent." : null,
 recentPatterns?.[0] ? `Recent pattern: ${recentPatterns[0]}.` : null,
 !changed ? "Current signals support staying with the original prescription." : null,
 ].filter(Boolean).slice(0, 3);
 const helpLine = changed
 ? `This still moves ${primaryGoal} forward by preserving the session's core intent and improving the chance you complete it cleanly in ${currentMode || "current"} mode.`
 : `Keeping the session unchanged supports steady progress toward ${primaryGoal} because readiness and constraints are currently aligned.`;
 return `ADJUSTMENT:\n${adjustmentLine}\n\nWHY:\n- ${reasons.join("\n- ")}\n\nHOW THIS STILL HELPS:\n${helpLine}`;
};

export const buildCheckinReadSummary = ({ checkin, todayWorkout, environmentSelection, momentum, recentWorkoutCount = 0 }) => {
 const sleep = Number(checkin?.readiness?.sleep || 0);
 const stress = Number(checkin?.readiness?.stress || 0);
 const soreness = Number(checkin?.readiness?.soreness || 0);
 const readinessProvided = sleep > 0 || stress > 0 || soreness > 0;
 const strainSignal = (stress >= 4) || (soreness >= 4) || (sleep > 0 && sleep <= 2) || checkin?.sessionFeel === "harder_than_expected";
 const robustSignal = sleep >= 4 && stress <= 2 && soreness <= 2 && checkin?.sessionFeel !== "harder_than_expected";
 const lowMomentum = ["drifting", "falling off"].includes(momentum?.momentumState) || momentum?.inconsistencyRisk === "high";
 const timeCap = environmentSelection?.time === "20";
 const read = !readinessProvided
 ? "Readiness data is limited, so plan confidence is unchanged and we stay with the default structure."
 : strainSignal
 ? "Readiness points to reduced training quality if we force full intensity today. Compliance risk rises if load stays too high."
 : robustSignal
 ? "Readiness supports quality execution today. Recovery looks sufficient for normal or slightly progressive work."
 : "Signals are mixed; quality is possible, but execution will be more reliable with controlled intensity.";
 const implication = strainSignal
 ? `Use a condensed ${todayWorkout?.label || "session"} version, keep effort controlled, and protect nutrition consistency (protein + baseline calories).`
 : robustSignal
 ? `Run the planned ${todayWorkout?.label || "session"} as written, with normal fueling and hydration.`
 : `Keep today's ${todayWorkout?.label || "session"} simple and finishable; avoid adding extra volume.`;
 const changeNeeded = strainSignal || timeCap || lowMomentum
 ? `yes - ${timeCap ? "time is constrained, so use minimum effective dose" : strainSignal ? "readiness indicates lower capacity, so reduce load directionally" : "compliance risk is elevated, so simplify to preserve momentum"}.`
 : "no - current plan remains appropriate with no meaningful directional change.";
 return `CHECK-IN READ:\n${read}\n\nTODAY'S IMPLICATION:\n${implication}\n\nCHANGE NEEDED:\n${changeNeeded}`;
};

export const buildWeeklyPlanningCoachBrief = ({ goals, momentum, learningLayer, failureMode, salvageLayer, weeklyCheckin, environmentSelection }) => {
 const primaryGoal = (goals || []).filter(g => g?.active).sort((a, b) => (a?.priority || 9) - (b?.priority || 9))[0]?.name || "your primary goal";
 const lowEnergy = Number(weeklyCheckin?.energy || 3) <= 2;
 const highStress = Number(weeklyCheckin?.stress || 3) >= 4;
 const lowConfidence = Number(weeklyCheckin?.confidence || 3) <= 2;
 const chaotic = failureMode?.mode === "chaotic" || salvageLayer?.active;
 const slipping = ["drifting", "falling off"].includes(momentum?.momentumState) || momentum?.inconsistencyRisk === "high";
 const lockedIn = momentum?.momentumState === "building momentum" && !slipping && !chaotic;
 const reducedTime = String(environmentSelection?.time || "30") === "20";

 const mode = chaotic || lowEnergy || highStress
 ? "reduced-load week"
 : slipping || lowConfidence
 ? "rebuild week"
 : lockedIn
 ? "progression week"
 : "consistency week";
 const priority = mode === "progression week"
 ? "Push the highest-value sessions while protecting recovery."
 : mode === "reduced-load week"
 ? "Lower load, keep structure, and protect completion quality."
 : mode === "rebuild week"
 ? "Rebuild rhythm with finishable sessions and clear anchors."
 : "Stack clean completions and stabilize weekly execution.";
 const changes = [
 mode === "progression week"
 ? "Keep full key sessions; add only one modest progression."
 : "Cap session complexity and avoid unnecessary extras.",
 reducedTime
 ? "Use condensed session versions where needed to fit real time availability."
 : "Keep session timing predictable to reduce decision friction.",
 learningLayer?.adjustmentBias === "simplify" || slipping
 ? "Reduce weekly density slightly to improve adherence."
 : "Hold weekly density unless recovery flags rise.",
 ];
 const why = `This framing matches your recent execution pattern and recovery context, and keeps momentum pointed at ${primaryGoal} without forcing low-probability choices.`;
 const behaviors = [
 "Lock your training windows in advance (same days, same start time).",
 "Complete the first key session of the week no matter what - set the tone early.",
 "Log each session immediately so the next adjustment stays accurate.",
 ];
 return `WEEKLY MODE:\n${mode}\n\nTHIS WEEK'S PRIORITY:\n${priority}\n\nWHAT CHANGES THIS WEEK:\n- ${changes.join("\n- ")}\n\nWHY:\n${why}\n\nHOW TO WIN THIS WEEK:\n${behaviors.join("\n")}`;
};

export const buildNutritionCoachBrief = ({ primaryGoal, dayType, targets, momentum, travelMode, simplifiedWeek, constraints = [] }) => {
 const protein = Math.round(targets?.p || 0);
 const calories = Math.round(targets?.cal || 0);
 const carbs = Math.round(targets?.c || 0);
 const hardTraining = ["hardRun", "longRun", "travelRun", "otf"].includes(dayType);
 const inconsistent = ["drifting", "falling off"].includes(momentum?.momentumState) || momentum?.inconsistencyRisk === "high" || simplifiedWeek;
 const goalLine = primaryGoal ? `${primaryGoal}` : "current training goals";
 const priorities = [
 `Hit ${protein}g protein across the day (anchor each meal around a protein source).`,
 `Land near ${calories} kcal so recovery and body-composition direction stay on plan.`,
 hardTraining ? `Place carbs around training (${carbs}g target) to support output and recovery.` : `Use carbs intentionally (${carbs}g target) and keep portions consistent.`,
 ];
 const why = hardTraining
 ? `These targets support today's ${dayType} load while keeping progress aligned with ${goalLine}. Protein protects lean mass, calories stabilize recovery, and carbs fuel quality work.`
 : `These targets keep progress moving toward ${goalLine} without unnecessary complexity. Protein and calories are the key levers; carbs are managed to match today's demand.`;
 const simpleMoves = [
 inconsistent ? "Repeat 2 reliable meals today instead of chasing variety." : "Pre-decide your first two meals so execution is automatic.",
 travelMode || constraints.includes("travel_logistics") ? "Use easy order defaults: lean protein + carb side + produce." : "Build each plate: protein first, then produce, then carbs.",
 constraints.includes("time_pressure") ? "Keep a backup protein option on hand (shake/yogurt/jerky) to avoid misses." : "Log protein early; if you're behind by lunch, correct at dinner.",
 hardTraining ? "Put most carbs pre/post workout rather than spreading them randomly." : "Keep snacking planned; avoid unplanned grazing.",
 ].slice(0, 4);

 return `TODAY'S NUTRITION PRIORITIES:\n- ${priorities.join("\n- ")}\n\nTARGETS:\n- Protein: ${protein}g\n- Calories: ${calories} kcal\n- Carbs: ${carbs}g\n\nWHY THESE TARGETS:\n${why}\n\nKEEP IT SIMPLE TODAY:\n- ${simpleMoves.join("\n- ")}`;
};

export const buildSupplementCoachBrief = ({ primaryGoal, trainingStyle, adherenceNotes, recoveryNotes, detailed = false }) => {
 const core = [
 "Creatine monohydrate: 3-5g daily - supports strength, training output, and lean-mass retention.",
 "Protein powder (if needed): 20-40g to close gaps - helps reliably hit daily protein target.",
 "Electrolytes (especially around hard sessions/travel): 1 serving around training - supports hydration and performance consistency.",
 ];
 const optional = [
 "Omega-3 fish oil: may help recovery and general health if fatty fish intake is low.",
 "Vitamin D3: useful if sun exposure is limited or labs have been low.",
 "Magnesium glycinate (evening): may help sleep quality and muscle relaxation.",
 ];
 const deEmphasize = [
 "Fat burners / stimulant-heavy cuts",
 "Test boosters and hormone hacks",
 "Large pre-workout stacks with overlapping ingredients",
 ];
 const basicCore = detailed ? core : core.slice(0, 2);
 const basicOptional = detailed ? optional : optional.slice(0, 2);
 const goalText = primaryGoal || "current training goal";
 const styleText = trainingStyle || "mixed training";
 const adherenceText = adherenceNotes || "adherence is the main lever";
 const recoveryText = recoveryNotes || "recovery quality matters more than stack size";
 return `CORE STACK:\n- ${basicCore.join("\n- ")}\n\nOPTIONAL:\n- ${basicOptional.join("\n- ")}\n\nNOT WORTH FOCUSING ON RIGHT NOW:\n- ${deEmphasize.join("\n- ")}\n\nContext: Goal = ${goalText}; training style = ${styleText}; ${adherenceText}; ${recoveryText}.`;
};

export const buildCoachChatSystemPrompt = ({ allowedActions = [] } = {}) => `You are an adaptive fitness coach inside a personal training app.
Your source of truth is the structured payload. Be direct, calm, and specific.
Do not invent workouts that conflict with payload. Convert internal logic into human language.
Prioritize consistency in chaotic weeks, progression in stable weeks, and reduced load when recovery risk is elevated.
Return strict JSON with keys notices[], recommendations[], effects[], actions[], coachBrief.
Actions must use only: ${allowedActions.join(", ")}.
coachBrief must follow exactly:
TODAY'S FOCUS:
<one sentence>

WORKOUT:
<clear prescription with duration, structure, and modifications>

WHY THIS TODAY:
- <2-4 concise bullet lines>

NUTRITION:
<targets if provided>

COACH NOTE:
<short, grounded note>`;

export const buildPlanAnalysisSystemPrompt = ({ currentWeek, currentWeekData, currentZones, logEntries, paceOverrides, weekNotes }) => `You are an AI running coach analyzing an athlete's training log to dynamically adjust their plan. Respond ONLY with valid JSON, no other text.

ATHLETE: 30yo, 6'1", 190lbs, half marathon goal 1:45 (8:01/mi) on July 19 2026.
CURRENT WEEK: ${currentWeek}, Phase: ${currentWeekData?.phase}
PRESCRIBED PACES: Easy ${currentZones.easy}/mi, Tempo ${currentZones.tempo}/mi, Intervals ${currentZones.int}/mi, Long ${currentZones.long}/mi

RECENT LOGS (newest last):
${logEntries.join("\n") || "No logs yet"}

CURRENT PACE OVERRIDES: ${JSON.stringify(paceOverrides)}
CURRENT WEEK NOTES: ${JSON.stringify(weekNotes)}

Analyze the logs and return JSON in this exact format:
{
 "paceAdjustments": {
 "PHASE_NAME": { "easy": "X:XX-X:XX", "tempo": "X:XX-X:XX", "int": "X:XX-X:XX", "long": "X:XX-X:XX" }
 },
 "weekNotes": {
 "WEEK_NUMBER": "note text"
 },
 "alerts": [
 { "id": "unique_id", "type": "upgrade|warning|info|makeup", "msg": "message text" }
 ],
 "noChange": true
}

RULES:
- Only include paceAdjustments if the athlete is CONSISTENTLY (3+ sessions) running faster or slower than prescribed by 20+ sec/mi. Don't adjust after 1-2 sessions.
- Only include weekNotes for weeks that are materially affected (missed workouts, makeup runs, schedule shifts).
- alerts should be short, direct, coach-like. Max 3 alerts total.
- If pace logged is 0:00 or missing, ignore it for pace analysis.
- If nothing needs changing, return { "noChange": true }
- NEVER adjust taper weeks (16-18) paces down - protect the taper.`;

export const buildTodayWhyNowSentence = ({ phase, lastSessionType, lastSessionFeel, daysToRace, weeklyIntensityLoad, isScheduledEasyDay, hadHardSessionYesterday }) => {
 const phaseText = String(phase || "CURRENT BLOCK").toUpperCase();
 const sessionType = String(lastSessionType || "recent session").replace(/\s+/g, " ").trim();
 const feelText = String(lastSessionFeel || "").toLowerCase();
 const feelHard = /hard|harder|rough|tough|1|2/.test(feelText);
 const raceSoon = Number(daysToRace || 0) > 0 && Number(daysToRace || 0) <= 21;
 const intensity = Number(weeklyIntensityLoad || 0);

 let sentence = "";
 if (hadHardSessionYesterday) {
 sentence = `Yesterday was hard, so today protects recovery to absorb that stress and keep ${phaseText} progression on track.`;
 } else if (isScheduledEasyDay) {
 sentence = raceSoon
 ? `With ${daysToRace} days to race, easy today locks in freshness so your next quality session lands sharp.`
 : `${phaseText} schedules easy today because ${sessionType} just taxed you, and recovery now protects this week's key sessions.`;
 } else if (feelHard || intensity >= 3) {
 sentence = `${phaseText} calls this today after ${sessionType} felt ${lastSessionFeel || "demanding"}, keeping load productive without compounding fatigue.`;
 } else {
 sentence = `${phaseText} places this here because ${sessionType} was controlled, so you're primed to convert this window into quality work.`;
 }

 const words = sentence.split(/\s+/).filter(Boolean).slice(0, 20);
 return words.join(" ");
};

export const buildMacroShiftLine = ({ yesterdayIntensity, todaySessionType, phase, weightTrend7day }) => {
 const yesterday = String(yesterdayIntensity || "moderate").toLowerCase();
 const today = String(todaySessionType || "session").toLowerCase();
 const phaseText = String(phase || "maintain").toLowerCase();
 const trend = Number(weightTrend7day || 0);
 const todayIsHard = /(tempo|interval|long|hard|race|otf)/.test(today);
 const todayIsRest = /(rest|recovery|easy)/.test(today);
 const todayIsStrength = /strength/.test(today);
 const yesterdayWasHard = /(hard|high|tempo|interval|long|race)/.test(yesterday);
 const inCut = /(cut|base|building)/.test(phaseText);

 let line = "";
 if (todayIsHard && !yesterdayWasHard) {
 line = "Carbs up today: yesterday stayed lighter, and this session needs full glycogen.";
 } else if (todayIsRest && inCut && trend <= -0.2) {
 line = "Calories trimmed: recovery day in cut phase, and your 7-day trend is already dropping.";
 } else if (todayIsStrength) {
 line = "Protein up today: strength workload is higher, so muscle retention takes priority.";
 } else if (todayIsRest) {
 line = "Carbs pulled back: today is lower intensity, so fuel is kept tighter.";
 } else if (trend >= 0.3) {
 line = "Calories tightened: 7-day weight trend rose, so we bias control without under-fueling training.";
 } else {
 line = "Targets shifted to match today's workload and your 7-day trend, not yesterday's demand.";
 }
 return line.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
};

export const buildTodaySupplementTimingLines = ({ sessionTime, sessionType, phase, supplementStack = [] }) => {
 const timeText = String(sessionTime || "today").toLowerCase();
 const session = String(sessionType || "session").toLowerCase();
 const phaseText = String(phase || "current block").toUpperCase();
 const isRest = /(rest|recovery)/.test(session);

 const bySupplement = {
 "Creatine": isRest
 ? "Creatine: Breakfast - rest day; saturation stays steady."
 : `Creatine: Breakfast - ${session} later; keep intramuscular stores topped.`,
 "Electrolytes": isRest
 ? "Electrolytes: Midday water - rest day hydration still supports recovery."
 : `Electrolytes: 30m pre-${timeText} session - hydration supports ${session} quality.`,
 "Magnesium": `Magnesium: Before bed - ${isRest ? "rest-day" : "post-session"} recovery tonight.`,
 "Omega-3": isRest
 ? "Omega-3: Lunch - rest day still benefits from inflammation control."
 : `Omega-3: Lunch - dampen inflammation from today's ${session}.`,
 "Vitamin D3": `Vitamin D3: First fat-containing meal - keep ${phaseText} recovery rhythm stable.`,
 "Protein powder": isRest
 ? "Protein powder: Mid-afternoon - rest day target still matters."
 : "Protein powder: Within 60m post-session - faster protein gap closure.",
 };

 return (supplementStack || []).map((raw) => {
 const name = String(raw || "").trim();
 const base = bySupplement[name] || `${name}: ${isRest ? "Lunch" : "Post-session"} - tied to today's ${session}.`;
 return base.split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
 });
};

export const buildEasierSessionsObservation = ({ feelRatingsLast5 = [], sessionTypes = [], currentPaceTargets = {}, phase, weeksToRace }) => {
 const ratings = (feelRatingsLast5 || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
 const easierCount = ratings.filter((n) => n >= 4).length;
 if (ratings.length < 3 || easierCount < 3) return null;

 const sessionText = (sessionTypes || []).slice(0, 3).join(", ") || "sessions";
 const isBase = String(phase || "").toUpperCase() === "BASE";
 const farFromRace = Number(weeksToRace || 0) >= 10;
 const hasIntervals = (sessionTypes || []).some((t) => /interval/i.test(String(t || "")));
 const hasStrength = (sessionTypes || []).some((t) => /strength/i.test(String(t || "")));
 const tempoTarget = currentPaceTargets?.tempo || currentPaceTargets?.int || currentPaceTargets?.easy || "current target";

 const firstSentence = "Your last three sessions came back easier than prescribed, and that trend is now clear.";
 let secondSentence = "";
 if (isBase && farFromRace) {
 secondSentence = `This is intentional base-building in ${phase}; hold current targets and keep execution smooth.`;
 } else if (hasIntervals) {
 secondSentence = "Shorten interval recoveries by 15 seconds next key session to restore the intended stimulus.";
 } else if (hasStrength) {
 secondSentence = "Add one set to your main strength movement this week to raise training demand.";
 } else {
 secondSentence = `Increase tempo pace target from ${tempoTarget} by 5-10 sec/mi for the next quality run.`;
 }
 return `${firstSentence} ${secondSentence}`.replace(/\s+/g, " ").trim();
};

export const buildSkippedQualityDecision = ({ skippedSessionType, dayOfWeek, remainingSessions, daysToRace, weekType, tomorrowSessionType }) => {
 const dayMap = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
 const dayIdx = Number(dayOfWeek);
 const dayName = Number.isFinite(dayIdx) ? (dayMap[dayIdx] || String(dayOfWeek)) : String(dayOfWeek || "");
 const remaining = Number(remainingSessions || 0);
 const raceDays = Number(daysToRace || 0);
 const tomorrowType = String(tomorrowSessionType || "").toLowerCase();
 const tomorrowIsQuality = /(tempo|interval|long|hard|race)/.test(tomorrowType);
 const skipType = skippedSessionType || "quality session";

 if (dayIdx >= 4) {
 return `Since it's ${dayName}, the skipped ${skipType} is absorbed and not rescheduled. Keep the week moving and execute the next planned session cleanly.`;
 }
 if (remaining > 2) {
 return `The skipped ${skipType} is absorbed; it will not be rescheduled this week. You still have enough quality exposure, so protect freshness for the remaining key days.`;
 }
 if (remaining <= 0) {
 if (tomorrowIsQuality) {
 return `The skipped ${skipType} will not move to tomorrow because tomorrow already carries quality load. Keep tomorrow as written and finish the week with stable execution.`;
 }
 return `The skipped ${skipType} shifts to tomorrow to preserve this week's quality stimulus. Tomorrow becomes the key day, then return to normal schedule immediately.`;
 }
 return `The skipped ${skipType} stays skipped; no reschedule is made. Hit the remaining ${remaining} quality session${remaining === 1 ? "" : "s"} on target to close the week.`;
};

export const buildLoadSpikeInlineWarning = ({ currentWeekLoad, avgLoadLast3weeks, injuryFlags = {}, daysToRace, thisWeekSessions = [] }) => {
 const current = Number(currentWeekLoad || 0);
 const baseline = Math.max(1, Number(avgLoadLast3weeks || 0));
 const spikePct = Math.round(((current - baseline) / baseline) * 100);
 if (!Number.isFinite(spikePct) || spikePct < 15) return null;

 const injuryArea = injuryFlags?.area || "Achilles";
 const injuryActive = String(injuryFlags?.level || "none") !== "none";
 const hasHistory = injuryFlags?.historyHit || injuryActive;
 const sessionHint = (thisWeekSessions || []).slice(0, 2).join(", ") || "key sessions";
 const raceText = Number(daysToRace || 0) > 0 ? `${daysToRace} days out` : "current block";

 const sentence1 = `This week is tracking ~${spikePct}% harder than your last three-week average.`;
 const sentence2 = hasHistory
 ? `Watch ${injuryArea} tightness as load stacks, especially after ${sessionHint}.`
 : `Watch sleep quality and next-day leg heaviness as load stacks after ${sessionHint}.`;
 const sentence3 = injuryActive
 ? `System response: recovery protection is active now, with reduced intensity on the next key day.`
 : `System response: flagging your next recovery day and protecting one session while you stay ${raceText}.`;
 return `${sentence1} ${sentence2} ${sentence3}`;
};

export const buildWeeklyConsistencyAnchor = ({ sessionsCompleted, sessionsPlanned, feelAvg, completionRateLast3weeks, nextWeekType }) => {
 const completed = Number(sessionsCompleted || 0);
 const planned = Math.max(1, Number(sessionsPlanned || 0));
 const rate = Math.round((completed / planned) * 100);
 const priorRate = Math.round(Number(completionRateLast3weeks || 0) * 100);
 const avgFeel = Number(feelAvg || 3);
 const weekType = String(nextWeekType || "consistency week");

 let context = "";
 if (rate === 100) context = "That full execution gives you room to progress without forcing extra volume.";
 else if (rate < 60) context = "This is below the consistency needed for stable adaptation, so execution reliability is the limiter.";
 else if (rate >= priorRate) context = "That trend is holding or improving versus your recent baseline, so momentum is still usable.";
 else context = "That is below your recent baseline, which raises drift risk if structure stays too ambitious.";

 const feelLine = avgFeel >= 4
 ? "Session feel was mostly manageable."
 : avgFeel <= 2.5
 ? "Perceived effort was heavy enough to warrant tighter recovery control."
 : "Perceived effort sat in a workable range.";

 const firstSentence = `${completed} of ${planned} sessions done. ${context} ${feelLine}`;
 const secondSentence = `Next week needs to be a ${weekType}: lock schedule first, then execute the key sessions in order.`;
 return `${firstSentence} ${secondSentence}`.replace(/\s+/g, " ").trim();
};

export const buildStreakSignalResponse = ({ streakLength, breakReason, phase, completionRateLast4weeks }) => {
 const streak = Number(streakLength || 0);
 const completion4w = Number(completionRateLast4weeks || 0);
 const cleanPhase = String(phase || "current block");
 const reason = String(breakReason || "execution miss").replace(/\s+/g, " ").trim();
 const isMilestone = [7, 14, 21, 30, 45, 60].includes(streak);
 const broke = streak === 0;

 if (broke) {
 const patternLine = completion4w < 0.6
 ? "This break matches a broader inconsistency pattern over the last four weeks."
 : "This break is an anomaly against your recent consistency baseline.";
 return `The streak broke today (${reason}). ${patternLine} Today's instruction: complete the 20-minute minimum session before dinner.`;
 }
 if (isMilestone) {
 return `Streak at ${streak} days, and this is building repeatable execution capacity for ${cleanPhase}. Keep tomorrow's start time fixed and protect the first key session.`;
 }
 return `Streak is ${streak} days; treat it as signal on execution stability in ${cleanPhase}. Today's instruction: log completion immediately after training.`;
};

export const buildBadWeekTriageResponse = ({ completionRateThisWeek, completionRateLast4weeks, feelAvg, checkInStress, nextWeekPlan }) => {
 const thisWeek = Number(completionRateThisWeek || 0);
 const history = Number(completionRateLast4weeks || 0);
 const feel = Number(feelAvg || 3);
 const stress = Number(checkInStress || 3);
 const plan = String(nextWeekPlan || "consistency week");
 const thisPct = Math.round(thisWeek * 100);
 const histPct = Math.round(history * 100);

 const sentence1 = `This week closed at ${thisPct}% completion.`;
 const disruption = history >= 0.7 && (history - thisWeek) >= 0.2 && stress >= 4;
 const sentence2 = disruption
 ? `Diagnosis: random life disruption this week, with a ${histPct}% four-week baseline behind it.`
 : `Diagnosis: this is a pattern, with a ${histPct}% four-week baseline that is still too low.`;
 const sentence3 = (stress >= 4 || feel <= 2.5)
 ? "Next week drops to 3 sessions, with no quality workouts until Wednesday."
 : "Next week holds 4 sessions, with one quality workout capped at controlled volume.";
 const sentence4 = `What does not change: ${plan} remains the direction, and long-term progression stays in place.`;
 return `${sentence1} ${sentence2} ${sentence3} ${sentence4}`;
};

export const buildDiscomfortProtocolResponse = ({ bodyPart, painDescription, todaySessionType, next7DaysSessions = [], injuryHistory }) => {
 const area = String(bodyPart || "affected area");
 const pain = String(painDescription || "discomfort").replaceAll("_", " ");
 const todayType = String(todaySessionType || "session");
 const upcoming = (next7DaysSessions || []).map((s) => String(s || "").toLowerCase());
 const hasLongRunSoon = upcoming.some((s) => /long/.test(s));
 const hasQualitySoon = upcoming.some((s) => /tempo|interval|hard/.test(s));
 const history = String(injuryHistory || "none").toLowerCase();

 const part1 = `Today: convert ${todayType} to a 20-30 minute easy effort, remove speed segments, and protect ${area} with controlled range only.`;
 const part2 = `Next 3 days: the system watches ${area} symptom trend and protects ${hasQualitySoon ? "quality sessions by downgrading intensity to aerobic work" : "load progression by capping volume and impact spikes"}.`;
 const threshold = hasLongRunSoon
 ? `Threshold: if ${pain} in ${area} is still present by Thursday, the long run converts to easy aerobic volume.`
 : `Threshold: if ${pain} in ${area} persists 72 hours, the next key session converts to easy aerobic volume.`;
 const historyLine = /repeat|recurr|chronic|streak/.test(history)
 ? `Because ${area} has repeated in your history, progression stays capped until symptoms trend down.`
 : "";

 return [part1, part2, threshold, historyLine].filter(Boolean).slice(0, 4).join(" ");
};

export const buildCompressedSessionPrescription = ({ originalSession, availableTime, phase, daysToRace, weeklyLoadSoFar, paceTargets = {} }) => {
 const session = String(originalSession || "").toLowerCase();
 const time = Number(String(availableTime || "30").replace("+", "")) || 30;
 const easy = paceTargets?.easy || "easy pace";
 const tempo = paceTargets?.tempo || paceTargets?.int || "tempo pace";
 const intervals = paceTargets?.int || tempo;
 const long = paceTargets?.long || easy;

 if (time < 18 && /(tempo|interval|long|hard)/.test(session)) {
 return `Primary stimulus cannot be preserved in ${time} minutes - 15 min easy @ ${easy} + 4 x 20s strides, walk 40s.`;
 }
 if (/tempo/.test(session)) {
 return `Preserves threshold stimulus, cuts warm-up/cool-down volume - 0.5 mi easy @ ${easy}, 2 x 8 min @ ${tempo} with 2 min easy, 0.25 mi cool.`;
 }
 if (/interval/.test(session) || /hard-run/.test(session)) {
 return `Preserves VO2 stimulus, cuts warm-up/cool-down first - 0.5 mi easy @ ${easy}, 5 x 2 min @ ${intervals} with 90s easy, 0.25 mi cool.`;
 }
 if (/long/.test(session)) {
 return `Preserves aerobic-long stimulus, cuts non-essential minutes - 35 min continuous @ ${long}, last 5 min steady @ ${tempo}.`;
 }
 if (/strength/.test(session)) {
 return "Preserves main strength stimulus, cuts accessory volume - squat 3x5, bench 3x5, row 2x8, 60-75s rest.";
 }
 return `Preserves aerobic continuity, cuts setup volume - 20-25 min continuous @ ${easy}, finish with 4 x 20s strides.`;
};

export const buildMinimumEffectiveTravelSession = ({ travelPresetEquipment, availableTime, plannedSession, phase, energyCheckIn, paceTargets = {} }) => {
 const equipment = String(travelPresetEquipment || "none").toLowerCase();
 const session = String(plannedSession || "").toLowerCase();
 const time = Number(String(availableTime || "20").replace("+", "")) || 20;
 const energy = Number(energyCheckIn || 3);
 const easy = paceTargets?.easy || "easy pace";
 const tempo = paceTargets?.tempo || paceTargets?.int || "tempo pace";

 const header = "This session's only job is to maintain the habit. Output is not the goal today.";
 const minimumLine = `Minimum = ${Math.min(time, 20)} minutes total, one movement pattern, zero optional work.`;

 if (/none|bodyweight/.test(equipment)) {
 if (/tempo|interval|hard/.test(session) && time >= 18 && energy >= 3) {
 return `${header}\n${minimumLine}\nWorkout: 4 min brisk walk + 8 min tempo effort @ ${tempo} + 6 min easy walk/jog @ ${easy}.`;
 }
 return `${header}\n${minimumLine}\nWorkout: 15-20 min brisk walk or easy jog @ ${easy} + 2 x 20s strides.`;
 }

 if (/basic_gym|db|dumbbell|hotel/.test(equipment)) {
 if (/strength/.test(session)) {
 return `${header}\n${minimumLine}\nWorkout: Goblet squat 2x8, DB row 2x8/side, push-up 2x8, 45s rest.`;
 }
 return `${header}\n${minimumLine}\nWorkout: 5 min easy + 10 min steady @ ${easy} + 4 min easy cool-down.`;
 }

 if (/full_gym/.test(equipment)) {
 if (/strength/.test(session)) {
 return `${header}\n${minimumLine}\nWorkout: Squat 2x5 @ moderate load, bench 2x5, row 2x6; stop 2 reps shy of failure.`;
 }
 return `${header}\n${minimumLine}\nWorkout: 5 min easy + 2 x 5 min @ tempo with 2 min easy + 3 min easy.`;
 }

 return `${header}\n${minimumLine}\nWorkout: 15-20 min easy continuous @ ${easy}, no extras.`;
};
