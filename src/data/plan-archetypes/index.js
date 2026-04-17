import { ENDURANCE_PLAN_ARCHETYPES } from "./endurance.js";
import { STRENGTH_PLAN_ARCHETYPES } from "./strength.js";
import { PHYSIQUE_PLAN_ARCHETYPES } from "./physique.js";
import { GENERAL_FITNESS_PLAN_ARCHETYPES } from "./general-fitness.js";
import { RE_ENTRY_PLAN_ARCHETYPES } from "./re-entry.js";
import { HYBRID_PLAN_ARCHETYPES } from "./hybrid.js";

export * from "./common.js";

export const PLAN_ARCHETYPES = Object.freeze([
  ...ENDURANCE_PLAN_ARCHETYPES,
  ...STRENGTH_PLAN_ARCHETYPES,
  ...PHYSIQUE_PLAN_ARCHETYPES,
  ...GENERAL_FITNESS_PLAN_ARCHETYPES,
  ...RE_ENTRY_PLAN_ARCHETYPES,
  ...HYBRID_PLAN_ARCHETYPES,
]);

const PLAN_ARCHETYPE_MAP = new Map(PLAN_ARCHETYPES.map((archetype) => [archetype.id, archetype]));

export const listPlanArchetypes = ({ family = "", activeOnly = true } = {}) => {
  const normalizedFamily = String(family || "").trim().toLowerCase();
  return PLAN_ARCHETYPES
    .filter((archetype) => !normalizedFamily || archetype.family === normalizedFamily)
    .filter((archetype) => !activeOnly || archetype.active)
    .map((archetype) => JSON.parse(JSON.stringify(archetype)));
};

export const findPlanArchetypeById = (archetypeId = "") => {
  const match = PLAN_ARCHETYPE_MAP.get(String(archetypeId || "").trim().toLowerCase());
  return match ? JSON.parse(JSON.stringify(match)) : null;
};
