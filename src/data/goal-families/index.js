const createFamily = ({
  id,
  label,
  helper,
  discoveryLabel,
  featuredIntentIds = [],
} = {}) => Object.freeze({
  id,
  label,
  helper,
  discoveryLabel: discoveryLabel || label,
  featuredIntentIds: [...featuredIntentIds],
});

export const GOAL_DISCOVERY_FAMILIES = Object.freeze([
  createFamily({
    id: "all",
    label: "All goals",
    helper: "Browse every structured path without dropping into Custom first.",
  }),
  createFamily({
    id: "endurance",
    label: "Endurance",
    helper: "Race prep, aerobic base, swimming, cycling, and cardio capacity.",
    featuredIntentIds: [
      "train_for_run_race",
      "build_endurance",
      "return_to_running",
      "swim_better",
      "ride_stronger",
    ],
  }),
  createFamily({
    id: "strength",
    label: "Strength",
    helper: "General strength, muscle gain, lift focus, and limited-equipment work.",
    featuredIntentIds: [
      "get_stronger",
      "build_muscle",
      "improve_big_lifts",
      "train_with_limited_equipment",
      "maintain_strength",
    ],
  }),
  createFamily({
    id: "physique",
    label: "Physique",
    helper: "Fat loss, leaning out, recomposition, and event-driven cuts.",
    featuredIntentIds: [
      "lose_body_fat",
      "get_leaner",
      "recomp",
      "cut_for_event",
      "keep_strength_while_cutting",
    ],
  }),
  createFamily({
    id: "general_fitness",
    label: "General fitness",
    helper: "Getting back in shape, building consistency, and feeling more athletic.",
    featuredIntentIds: [
      "get_back_in_shape",
      "build_consistency",
      "feel_more_athletic",
      "improve_work_capacity",
      "healthy_routine_fitness",
    ],
  }),
  createFamily({
    id: "re_entry",
    label: "Re-entry",
    helper: "Safe restarts, low-capacity rebuilds, and conservative returns.",
    featuredIntentIds: [
      "restart_safely",
      "ease_back_in",
      "rebuild_routine",
      "conservative_return",
      "low_impact_restart",
    ],
  }),
  createFamily({
    id: "hybrid",
    label: "Hybrid",
    helper: "Run-and-lift, stronger-plus-fitter, and sport-support blends.",
    featuredIntentIds: [
      "run_and_lift",
      "stronger_and_fitter",
      "aesthetic_plus_endurance",
      "sport_support",
      "tactical_fitness",
    ],
  }),
]);

const FAMILY_MAP = new Map(GOAL_DISCOVERY_FAMILIES.map((family) => [family.id, family]));

export const listGoalDiscoveryFamilies = () => GOAL_DISCOVERY_FAMILIES.map((family) => ({
  ...family,
  featuredIntentIds: [...family.featuredIntentIds],
}));

export const findGoalDiscoveryFamilyById = (familyId = "") => {
  const match = FAMILY_MAP.get(String(familyId || "").trim().toLowerCase());
  return match
    ? {
        ...match,
        featuredIntentIds: [...match.featuredIntentIds],
      }
    : null;
};
