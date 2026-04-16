const freezeRecord = (record = {}) => Object.freeze({ ...(record || {}) });

const toScenario = (id, scenario, tags = []) => freezeRecord({
  id,
  scenario,
  tags: Object.freeze([...(Array.isArray(tags) ? tags : [])]),
});

const toGateRequirement = (id, label, evidence = []) => freezeRecord({
  id,
  label,
  evidence: Object.freeze([...(Array.isArray(evidence) ? evidence : [])]),
});

export const ADVERSARIAL_USER_FLOW_STEPS = Object.freeze([
  "account access",
  "intake",
  "first week",
  "logging",
  "plan change",
  "degraded state",
]);

export const ADVERSARIAL_USER_TEST_MATRIX = Object.freeze([
  toScenario("AU-01", "Former athlete returning after 10 years off.", ["re_entry", "detrained"]),
  toScenario("AU-02", "Morbidly obese beginner afraid of gyms.", ["beginner", "body_comp", "home_only"]),
  toScenario("AU-03", "Competitive swimmer with limited strength experience.", ["swim", "strength_support"]),
  toScenario("AU-04", "Recreational runner who needs strength support.", ["running", "strength_support"]),
  toScenario("AU-05", "Busy parent with 20-minute windows.", ["time_crunched", "schedule_constraints"]),
  toScenario("AU-06", "Traveling consultant with hotel gyms only.", ["travel", "equipment_constraints"]),
  toScenario("AU-07", "Home-gym user with bands and dumbbells only.", ["home_gym", "equipment_constraints"]),
  toScenario("AU-08", "Lifters wanting aesthetic improvement and bench progress.", ["strength", "body_comp"]),
  toScenario("AU-09", "Marathon trainee who also wants to lose 15 pounds.", ["running", "body_comp", "conflicting_priorities"]),
  toScenario("AU-10", "User with recurring Achilles pain.", ["injury", "running"]),
  toScenario("AU-11", "User training around poor sleep and shift work.", ["recovery", "shift_work"]),
  toScenario("AU-12", "User who hates calorie tracking.", ["nutrition", "tracking_aversion"]),
  toScenario("AU-13", "User who wants general health but no hard target date.", ["general_fitness", "open_ended"]),
  toScenario("AU-14", "User with three correlated goals and one conflicting goal.", ["multi_goal", "goal_conflict"]),
  toScenario("AU-15", "User who signs in on phone, then laptop, then tablet.", ["cross_device", "auth"]),
  toScenario("AU-16", "User who deletes account and recreates it.", ["auth_lifecycle", "delete_account"]),
  toScenario("AU-17", "User who continues with local data, then later signs in.", ["local_first", "auth_handoff"]),
  toScenario("AU-18", "User whose cloud sync times out for three sessions.", ["sync", "timeouts"]),
  toScenario("AU-19", "User who misses an entire week.", ["adaptation", "adherence_drop"]),
  toScenario("AU-20", "User who logs partial workouts only.", ["logging", "partial_completion"]),
  toScenario("AU-21", "User who changes priorities mid-block.", ["goal_management", "reprioritization"]),
  toScenario("AU-22", "User who adds a swim goal after a running plan already exists.", ["multi_sport", "goal_addition"]),
  toScenario("AU-23", "User who wants a custom goal the library does not cover.", ["custom_goal", "goal_library_gap"]),
  toScenario("AU-24", "User who never enters optional metrics.", ["low_friction", "optional_inputs"]),
  toScenario("AU-25", "User who enters wildly inconsistent metrics and needs correction.", ["data_quality", "validation"]),
  toScenario("AU-26", "User who trains only outdoors.", ["environment", "outdoors"]),
  toScenario("AU-27", "User with no pool access half the week.", ["swim", "schedule_constraints"]),
  toScenario("AU-28", "User who wants strength and mobility but no bodybuilding language.", ["strength", "copy_sensitivity"]),
  toScenario("AU-29", "User who wants bodybuilding and hates endurance work.", ["bodybuilding", "preference_constraints"]),
  toScenario("AU-30", "User who wants aesthetics plus cardiovascular health.", ["body_comp", "general_health"]),
  toScenario("AU-31", "User who only trains twice per week.", ["low_frequency", "schedule_constraints"]),
  toScenario("AU-32", "User who trains six days per week.", ["high_frequency", "recovery_balance"]),
  toScenario("AU-33", "User who changes available equipment frequently.", ["equipment_variability", "adaptation"]),
  toScenario("AU-34", "User who cares deeply about theme and aesthetics.", ["theme", "polish"]),
  toScenario("AU-35", "User on light mode all the time.", ["theme", "light_mode"]),
  toScenario("AU-36", "User on dark mode all the time.", ["theme", "dark_mode"]),
  toScenario("AU-37", "User with color-vision deficiency.", ["accessibility", "contrast"]),
  toScenario("AU-38", "User on a low-end laptop with slow network.", ["performance", "slow_network"]),
  toScenario("AU-39", "User with intermittent mobile connectivity.", ["mobile", "sync_instability"]),
  toScenario("AU-40", "User who wants all data local-first.", ["local_first", "privacy"]),
  toScenario("AU-41", "User who wants coach help but never allows plan mutation.", ["coach", "mutation_guardrails"]),
  toScenario("AU-42", "User who frequently asks open-ended fitness questions.", ["coach", "open_ended"]),
  toScenario("AU-43", "User who accepts many coach plan changes.", ["coach", "adaptation"]),
  toScenario("AU-44", "User who distrusts AI and uses only guided options.", ["guided_only", "ai_boundary"]),
  toScenario("AU-45", "User who loves AI and writes everything in custom text.", ["custom_text", "ai_heavy"]),
  toScenario("AU-46", "User who wants goals without end dates.", ["open_ended", "goal_timing"]),
  toScenario("AU-47", "User in injury-return rebuild mode.", ["injury_return", "re_entry"]),
  toScenario("AU-48", "User who starts conservative, then flips aggressive.", ["preference_change", "intensity"]),
  toScenario("AU-49", "User who prints or exports screens regularly.", ["export", "print_preview"]),
  toScenario("AU-50", "User who compares Today, Program, Log, and Coach for contradictions.", ["cross_surface", "trust"]),
  toScenario("AU-51", "Hostile trainer who thinks the app is trying to replace him and uses it to ridicule the logic and prescribed workouts to clients.", ["trainer_hostility", "trust", "adversarial"]),
]);

export const RELEASE_GATE_REQUIREMENTS = Object.freeze([
  toGateRequirement("RG-01", "clean auth lifecycle behavior", ["manual", "automated"]),
  toGateRequirement("RG-02", "accessible account access screens", ["manual", "automated"]),
  toGateRequirement("RG-03", "reduced intake click count", ["manual", "automated"]),
  toGateRequirement("RG-04", "working delete-account behavior or honest environment-gated messaging", ["manual", "automated"]),
  toGateRequirement("RG-05", "no cross-surface plan contradictions", ["manual", "automated"]),
  toGateRequirement("RG-06", "no domain label leakage", ["manual", "automated"]),
  toGateRequirement("RG-07", "coherent goals management and auditability", ["manual", "automated"]),
  toGateRequirement("RG-08", "stable degraded-state handling", ["manual", "automated"]),
  toGateRequirement("RG-09", "adversarial e2e pass", ["automated"]),
  toGateRequirement("RG-10", "expanded persona-lab pass", ["automated"]),
  toGateRequirement("RG-11", "manual browser/device/export pass", ["manual"]),
]);

export const RELEASE_GATE_POLICY = freezeRecord({
  summary: "Do not call the app release-ready on unit tests alone or on the synthetic lab alone.",
  requiredFlowPerScenario: ADVERSARIAL_USER_FLOW_STEPS,
  scenarioCount: ADVERSARIAL_USER_TEST_MATRIX.length,
  gateRequirementCount: RELEASE_GATE_REQUIREMENTS.length,
});

export const buildReleaseGateChecklistModel = () => ({
  policy: RELEASE_GATE_POLICY,
  adversarialFlowSteps: [...ADVERSARIAL_USER_FLOW_STEPS],
  scenarios: ADVERSARIAL_USER_TEST_MATRIX.map((scenario) => ({
    id: scenario.id,
    scenario: scenario.scenario,
    tags: [...scenario.tags],
  })),
  gateRequirements: RELEASE_GATE_REQUIREMENTS.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    evidence: [...requirement.evidence],
  })),
});
