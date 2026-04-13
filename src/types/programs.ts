export type SourceBasisTier =
  | "evidence_informed_default"
  | "coach_published_public_template"
  | "public_named_methodology"
  | "multi_source_public_reconstruction"
  | "cultural_inspiration";

export type SourceConfidence = "high" | "medium" | "low";

export type ProgramCategory =
  | "foundation_general_fitness"
  | "physique_aesthetics"
  | "strength"
  | "endurance"
  | "hybrid_athletic"
  | "travel_limited_equipment"
  | "public_coach_inspired"
  | "inspired_by_cultural_archetype";

export type StyleCategory =
  | "physique_aesthetics"
  | "strength"
  | "endurance"
  | "hybrid_athletic"
  | "travel_limited_equipment"
  | "inspired_by_cultural_archetype";

export type ProgramStatus = "draft" | "active" | "deprecated";

export type MinimumExperience = "beginner" | "novice" | "intermediate" | "advanced";

export type FidelityMode = "run_as_written" | "adapt_to_me" | "use_as_style";

export type CompatibilityOutcome = "compatible" | "caution" | "incompatible";

export type SourceReference = {
  sourceType: "url" | "internal_reference" | "publication" | "video" | "article" | "coach_site";
  title: string;
  reference: string;
  confidenceWeight: number;
  notes?: string;
};

export type WeeklyStructureSession = {
  label: string;
  focus: string;
  lockedInStrict?: boolean;
  optional?: boolean;
  notes?: string;
};

export type ProgressionModel = {
  type: string;
  summary: string;
  hardRules?: string[];
  softPreferences?: string[];
};

export type AdaptationPolicy = {
  scheduleFlexibility: "low" | "medium" | "high";
  equipmentFlexibility: "low" | "medium" | "high";
  experienceFloor: MinimumExperience;
  minSessionsForAdapted?: number;
  hardRules: string[];
  softPreferences: string[];
  blockedIf: string[];
};

export type ProgramDefinition = {
  id: string;
  slug: string;
  displayName: string;
  internalArchetype: string;
  category: ProgramCategory;
  summary: string;
  intendedOutcome: string;
  targetUser: string;
  contraindications: string[];
  requiredEquipment: string[];
  minimumExperience: MinimumExperience;
  typicalDurationWeeks: number;
  typicalSessionsPerWeek: { min: number; max: number; typical: number };
  sessionTypes: string[];
  weeklyStructureTemplate: WeeklyStructureSession[];
  progressionModel: ProgressionModel;
  adaptationPolicy: AdaptationPolicy;
  fidelityModeSupport: Record<FidelityMode, boolean>;
  sourceBasis: SourceBasisTier;
  sourceConfidence: SourceConfidence;
  sourceNotes: string;
  publicReferences: SourceReference[];
  evidenceNotes: string;
  brandSafetyFlags: string[];
  explanationTemplate: {
    cardSummary: string;
    activationSummary: string;
    adaptationSummary: string;
  };
  compatibleGoalTypes?: string[];
  incompatibleGoalTypes?: string[];
  goalsOptional?: boolean;
  tags: string[];
  status: ProgramStatus;
  version: string;
};

export type StyleDefinition = {
  id: string;
  slug: string;
  displayName: string;
  summary: string;
  internalArchetype: string;
  category: StyleCategory;
  styleBiases: {
    weeklyFeel: string;
    progressionFeel: string;
    recoveryPosture: string;
  };
  compatibleGoalTypes: string[];
  compatiblePrograms: string[];
  incompatiblePrograms: string[];
  exerciseSelectionBias: string[];
  volumeBias: string;
  intensityBias: string;
  cardioBias: string;
  aestheticsBias: string;
  coachToneBias: string;
  sourceBasis: SourceBasisTier;
  sourceConfidence: SourceConfidence;
  sourceNotes: string;
  explanationTemplate: {
    cardSummary: string;
    overlaySummary: string;
  };
  brandSafetyFlags?: string[];
  tags: string[];
  version: string;
  status?: ProgramStatus;
};

export type CompatibilityAssessment = {
  score: number;
  outcome: CompatibilityOutcome;
  reasons: string[];
  requiredChanges: string[];
  blockedConstraints: string[];
  equipmentMismatch?: string | null;
  scheduleMismatch?: string | null;
  experienceMismatch?: string | null;
  injuryMismatch?: string | null;
  goalMismatch?: string | null;
  selectedFidelityMode?: FidelityMode;
};

export type PlanBasisExplanation = {
  basisType:
    | "default_goal_driven"
    | "goal_driven_with_style"
    | "program_run_as_written"
    | "program_adapted"
    | "program_used_as_style"
    | "program_plus_style";
  basisSummary: string;
  personalizationSummary: string;
  sourceConfidence: SourceConfidence;
  caveats: string[];
  lastUpdatedAt: string;
};

export type ProgramInstance = {
  userId: string;
  programDefinitionId: string;
  frozenVersion: string;
  activationDate: string;
  selectedMode: "program" | "program_as_style";
  fidelityMode: FidelityMode;
  adaptationInputs: Record<string, unknown>;
  compatibilitySnapshot: CompatibilityAssessment;
  weeklyPlanSnapshotLinks: string[];
  status: "active" | "archived";
  archivedAt: string | null;
};

export type StyleSelection = {
  userId: string;
  styleDefinitionId: string;
  activationDate: string;
  compatibleWithCurrentPlan: boolean;
  influenceLevel: "light" | "standard" | "high";
  status: "active" | "archived";
};
