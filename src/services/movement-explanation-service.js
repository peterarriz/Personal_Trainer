import { sanitizeDisplayCopy } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 240) => sanitizeDisplayCopy(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxLength);

const normalizeLookupLabel = (value = "") => sanitizeText(value, 160).toLowerCase();

const DEMO_WORTHY_LABEL = /\b(bench|press|dip|row|squat|deadlift|hinge|rdl|lunge|split squat|step-up|step up|leg press|leg curl|hamstring curl|push-up|pushup|push up|pull-up|pull up|chin-up|chin up|pulldown|pull-down|pull down|raise|lateral|fly|curl|extension|tricep|bicep|pressdown|pushdown|skull crusher|face pull|pull-apart|external rotation|wall slide|carry|plank|dead bug|bird dog|hollow body|hollow hold|bridge|thrust|calf|heel drop|leg raise|crunch|ab wheel|pallof|swing|clean|snatch|get-up|get up|march|hop|jump|sled|farmer|suitcase|tempo|interval|run|swim|bike|rower|ski|circuit|prehab|durability)\b/i;

const buildMovementDemoUrl = (label = "", { force = false } = {}) => {
  const safeLabel = sanitizeText(label, 120);
  if (!safeLabel || (!force && !DEMO_WORTHY_LABEL.test(safeLabel))) return "";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${safeLabel} exercise tutorial`)}`;
};

const createExplanation = ({
  canonicalLabel = "",
  matchedLabel = "",
  whatItIs = "",
  howToDoIt = "",
  repCountsAs = "",
  commonSubstitutions = [],
  cautionNotes = "",
  setupNotes = "",
} = {}) => ({
  canonicalLabel: sanitizeText(canonicalLabel, 120),
  matchedLabel: sanitizeText(matchedLabel || canonicalLabel, 120),
  whatItIs: sanitizeText(whatItIs, 220),
  howToDoIt: sanitizeText(howToDoIt, 220),
  repCountsAs: sanitizeText(repCountsAs, 180),
  commonSubstitutions: (Array.isArray(commonSubstitutions) ? commonSubstitutions : [])
    .map((option) => sanitizeText(option, 80))
    .filter(Boolean)
    .slice(0, 4),
  cautionNotes: sanitizeText(cautionNotes, 180),
  setupNotes: sanitizeText(setupNotes, 180),
  demoSearchUrl: buildMovementDemoUrl(matchedLabel || canonicalLabel, { force: true }),
});

const MOVEMENT_EXPLANATIONS = [
  {
    key: "incline-press",
    patterns: [/^incline (?:db|dumbbell|barbell )?press$/i, /^incline db press$/i, /^incline dumbbell press$/i, /^incline bench press$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Incline Press",
      matchedLabel: label,
      whatItIs: "An angled press that trains upper chest, shoulders, and pressing support.",
      howToDoIt: "Set the bench to a low incline, keep the shoulder blades tucked, and press up without shrugging.",
      repCountsAs: "Each clean press from the chest-side start to a locked or nearly locked finish counts as one rep.",
      commonSubstitutions: ["Low-incline machine press", "Landmine press", "Push-up variation"],
      cautionNotes: "Do not let the elbows flare wildly or the shoulders roll forward at the bottom.",
      setupNotes: "Use an incline angle that still lets you press through the upper chest instead of turning it into a strict shoulder press.",
    }),
  },
  {
    key: "bench-press",
    patterns: [/^bench press$/i, /^barbell bench press$/i, /^dumbbell bench press$/i, /^db bench press$/i, /^flat db press$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Bench Press",
      matchedLabel: label,
      whatItIs: "A horizontal press that trains chest, triceps, shoulders, and pressing strength.",
      howToDoIt: "Set the shoulders down and back, plant the feet, lower the bar or dumbbells under control, then press back up in a straight strong path.",
      repCountsAs: "One rep is a full controlled lower plus one clean press to the top position.",
      commonSubstitutions: ["Dumbbell bench press", "Push-up", "Machine chest press"],
      cautionNotes: "Keep the shoulder position stable and do not bounce the bar or lose wrist position.",
      setupNotes: "Feet planted, upper back tight, and a repeatable touch point on the chest matter more than forcing a huge arch.",
    }),
  },
  {
    key: "push-up",
    patterns: [/^push-up$/i, /^pushup$/i, /^push up$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Push-Up",
      matchedLabel: label,
      whatItIs: "A bodyweight horizontal press that trains chest, shoulders, triceps, and trunk control.",
      howToDoIt: "Start in a straight plank, lower the chest and hips together, then press back up without letting the midline sag.",
      repCountsAs: "One clean lower and press back to a straight-arm plank is one rep.",
      commonSubstitutions: ["Incline push-up", "Knee push-up", "DB bench press"],
      cautionNotes: "Stop the set when the hips start sagging or the range of motion shrinks badly.",
      setupNotes: "Hands just outside shoulder width usually gives the cleanest line.",
    }),
  },
  {
    key: "shoulder-press",
    patterns: [/^overhead press$/i, /^strict press$/i, /^shoulder press$/i, /^dumbbell shoulder press$/i, /^db shoulder press$/i, /^landmine press$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Shoulder Press",
      matchedLabel: label,
      whatItIs: "A vertical press that trains shoulders, triceps, and overhead control.",
      howToDoIt: "Brace the trunk, keep the ribs down, press overhead in a smooth line, and finish with the biceps near the ears.",
      repCountsAs: "One controlled press from shoulder height to the overhead finish is one rep.",
      commonSubstitutions: ["Landmine press", "Seated dumbbell press", "Machine shoulder press"],
      cautionNotes: "Do not lean back and turn the press into a standing incline bench.",
      setupNotes: "A slightly staggered stance or seated setup is fine if it keeps the trunk cleaner.",
    }),
  },
  {
    key: "row",
    patterns: [/^row$/i, /^cable row$/i, /^barbell row$/i, /^dumbbell row$/i, /^db row$/i, /^chest-supported row$/i, /^band bent-over row$/i, /row$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Row",
      matchedLabel: label,
      whatItIs: "A pulling movement that trains upper back, lats, and shoulder stability.",
      howToDoIt: "Set the torso, pull the handle or weight toward the lower ribs, and lower it back without shrugging or twisting.",
      repCountsAs: "Each full pull plus controlled lower is one rep.",
      commonSubstitutions: ["Chest-supported row", "Cable row", "Band row"],
      cautionNotes: "Keep the neck relaxed and avoid yanking the weight with momentum.",
      setupNotes: "Think elbows back and shoulder blades moving smoothly instead of cranking the traps up.",
    }),
  },
  {
    key: "vertical-pull",
    patterns: [/^pull-up$/i, /^pull up$/i, /^chin-up$/i, /^chin up$/i, /^lat pulldown$/i, /^pulldown$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Vertical Pull",
      matchedLabel: label,
      whatItIs: "A vertical pulling movement that trains lats, upper back, biceps, and shoulder control.",
      howToDoIt: "Start from a long hang or long reach, pull the elbows down toward the ribs, then lower under control to full range.",
      repCountsAs: "One full pull plus a controlled return to the start is one rep.",
      commonSubstitutions: ["Assisted pull-up", "Lat pulldown", "Band-assisted chin-up"],
      cautionNotes: "Do not turn every rep into a kip or half-rep shrug.",
      setupNotes: "Use the grip and assistance level that lets you move through clean full range.",
    }),
  },
  {
    key: "push-up-complex",
    patterns: [/^push-up complex$/i, /^pushup complex$/i, /^push up complex$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Push-Up Complex",
      matchedLabel: label,
      whatItIs: "A push-up variation cluster done back-to-back before you rest.",
      howToDoIt: "Move through the listed push-up variations in order and keep the body rigid the whole set.",
      repCountsAs: "One full pass through the listed variations usually counts as one rep or one round.",
      commonSubstitutions: ["Incline push-up series", "Knee push-up series", "DB floor press"],
      cautionNotes: "Stop if your lower back sags or your shoulders lose position.",
      setupNotes: "Know the order before you start so the set stays continuous.",
    }),
  },
  {
    key: "strength-a",
    patterns: [/^strength a$/i, /^full-body strength a$/i, /^short full-body strength a$/i, /^strength priority a$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Strength A",
      matchedLabel: label,
      whatItIs: "The first full-body strength template in an A/B rotation.",
      howToDoIt: "Run the main lifts and accessories in the written order with controlled working sets.",
      repCountsAs: "A rep is one clean lift; finish all prescribed reps before moving on.",
      commonSubstitutions: ["Goblet squat for barbell squat", "DB bench for barbell bench", "DB RDL for barbell hinge"],
      cautionNotes: "Use loads you can move with full range and repeatable form.",
      setupNotes: "Expect a squat, press, pull, and hinge emphasis in some mix.",
    }),
  },
  {
    key: "strength-b",
    patterns: [/^strength b$/i, /^full-body strength b$/i, /^short full-body strength b$/i, /^strength priority b$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Strength B",
      matchedLabel: label,
      whatItIs: "The second full-body strength template in an A/B rotation.",
      howToDoIt: "Run the alternate lift order or movement pairings so you train the same patterns without repeating the exact same session.",
      repCountsAs: "A rep is one clean lift; finish all prescribed reps before moving on.",
      commonSubstitutions: ["Front squat for back squat", "Landmine press for overhead press", "Chest-supported row for barbell row"],
      cautionNotes: "Keep the session crisp instead of turning every set into a max effort.",
      setupNotes: "B days usually shift the main lifts, angles, or loading from A day.",
    }),
  },
  {
    key: "circuit",
    patterns: [/^circuit$/i, /(^| )circuit($| )/i, /^hiit circuit$/i, /^strength circuit [ab]$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Circuit",
      matchedLabel: label,
      whatItIs: "A sequence of exercises done with short transitions and limited rest.",
      howToDoIt: "Move station to station at the written pace, then rest after the full round.",
      repCountsAs: "One completed round through every station counts as one circuit.",
      commonSubstitutions: ["Pair lifts as supersets", "Reduce stations", "Swap cardio tool or implement"],
      cautionNotes: "Do not rush form just to keep the clock moving.",
      setupNotes: "Set up all stations first if space or equipment is limited.",
    }),
  },
  {
    key: "tempo-run",
    patterns: [/^tempo run$/i, /^tempo$/i, /^threshold run$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Tempo Run",
      matchedLabel: label,
      whatItIs: "A sustained comfortably-hard run near threshold effort.",
      howToDoIt: "Settle into a pace you can hold steadily while breathing hard but staying in control.",
      repCountsAs: "The full continuous tempo block or each written tempo segment counts as the work.",
      commonSubstitutions: ["Cruise intervals", "Hill tempo", "Bike or row threshold intervals"],
      cautionNotes: "If pace falls apart early, back off slightly instead of forcing it.",
      setupNotes: "Warm up first and know whether the workout is continuous or broken into segments.",
    }),
  },
  {
    key: "intervals",
    patterns: [/^intervals$/i, /^interval session$/i, /^conditioning intervals$/i, /^tempo intervals$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Intervals",
      matchedLabel: label,
      whatItIs: "Repeated hard efforts separated by easy recoveries.",
      howToDoIt: "Hit the target effort on each work segment, then actually ease off during recovery so quality stays consistent.",
      repCountsAs: "One hard segment plus its recovery is one interval unless the template says otherwise.",
      commonSubstitutions: ["Time-based repeats", "Track repeats", "Bike, rower, or incline treadmill repeats"],
      cautionNotes: "Keep the early reps under control so the last reps still look the same.",
      setupNotes: "Know the work and recovery durations before you start.",
    }),
  },
  {
    key: "prehab",
    patterns: [/^prehab$/i, /(^| )prehab($| )/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Prehab",
      matchedLabel: label,
      whatItIs: "Low-load accessory work meant to keep common problem areas moving and tolerating load.",
      howToDoIt: "Use smooth, controlled reps and stop before pain or compensation takes over.",
      repCountsAs: "A rep is one slow controlled repetition or one completed hold if the drill is timed.",
      commonSubstitutions: ["Band work", "Bodyweight control drills", "Single-leg balance or calf work"],
      cautionNotes: "Treat this as quality tissue work, not a conditioning test.",
      setupNotes: "Pick the issue-specific drills that match the written focus area.",
    }),
  },
  {
    key: "durability-work",
    patterns: [/^durability work$/i, /(^| )durability($| )/i, /^strength \+ durability$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Durability Work",
      matchedLabel: label,
      whatItIs: "Accessory strength and mobility work that helps joints and tissues tolerate the main training load.",
      howToDoIt: "Use light to moderate loading, clean range of motion, and controlled tempo.",
      repCountsAs: "A rep is one smooth controlled repetition; timed carries or holds count by distance or time.",
      commonSubstitutions: ["Single-leg accessory work", "Carries", "Mobility plus stability drills"],
      cautionNotes: "This should leave you feeling better, not cooked.",
      setupNotes: "Good for weak links like calves, hips, trunk, shoulders, and feet.",
    }),
  },
  {
    key: "squat",
    patterns: [/^squat$/i, /^back squat$/i, /^front squat$/i, /^goblet squat$/i, /^box squat$/i, /back squat/i, /front squat/i, /goblet squat/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Squat",
      matchedLabel: label,
      whatItIs: "A squat pattern that trains legs, hips, trunk stiffness, and lower-body strength.",
      howToDoIt: "Brace before the descent, sit down between the hips with balanced foot pressure, then stand up by driving through the floor.",
      repCountsAs: "One full lower to the planned depth and one clean stand back up is one rep.",
      commonSubstitutions: ["Goblet squat", "Box squat", "Leg press"],
      cautionNotes: "Do not chase depth by collapsing the trunk or losing foot pressure.",
      setupNotes: "Pick the stance and squat variation that lets you keep the chest and pelvis organized.",
    }),
  },
  {
    key: "hinge",
    patterns: [/^deadlift$/i, /^trap bar deadlift$/i, /^romanian deadlift$/i, /^rdl$/i, /^hinge$/i, /deadlift/i, /romanian deadlift/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Hinge / Deadlift",
      matchedLabel: label,
      whatItIs: "A hip-dominant pull that trains glutes, hamstrings, trunk stiffness, and posterior-chain strength.",
      howToDoIt: "Set the ribs and hips, push the hips back for the hinge, keep the weight close, and stand tall without overextending at the top.",
      repCountsAs: "One clean pull from the floor or hinge start to lockout and back down is one rep.",
      commonSubstitutions: ["Trap bar deadlift", "DB RDL", "Hip hinge pattern with kettlebells"],
      cautionNotes: "Do not let the lower back round just to squeeze out extra reps.",
      setupNotes: "If the floor start is ugly, use blocks, dumbbells, or a trap bar and keep the hinge clean.",
    }),
  },
  {
    key: "single-leg",
    patterns: [/^split squat$/i, /^bulgarian split squat$/i, /^walking lunge$/i, /^reverse lunge$/i, /^lunge$/i, /^step-up$/i, /^step up$/i, /split squat/i, /lunge/i, /step-up/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Single-Leg Lower Body",
      matchedLabel: label,
      whatItIs: "A single-leg pattern that builds leg strength, balance, and pelvis control side to side.",
      howToDoIt: "Keep the front foot rooted, lower under control, and drive through the working leg without folding the trunk.",
      repCountsAs: "One full rep per side counts when the set alternates legs; otherwise each rep is counted on the working side.",
      commonSubstitutions: ["Split squat", "Reverse lunge", "Step-up"],
      cautionNotes: "Do not rush the bottom if the knee or hip loses alignment.",
      setupNotes: "Shorten the range or reduce load if control disappears before the target reps.",
    }),
  },
  {
    key: "lateral-raise",
    patterns: [/^lateral raise$/i, /^db lateral raise$/i, /^dumbbell lateral raise$/i, /^rear delt fly$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Lateral Raise",
      matchedLabel: label,
      whatItIs: "A shoulder accessory that builds the side delts and supports pressing balance.",
      howToDoIt: "Raise the weights out to the side with soft elbows, stop around shoulder height, and lower them without swinging.",
      repCountsAs: "One controlled raise and lower is one rep.",
      commonSubstitutions: ["Cable lateral raise", "Machine lateral raise", "Rear-delt fly"],
      cautionNotes: "If you have to heave the weight, it is too heavy for the point of the exercise.",
      setupNotes: "A small torso lean is fine if the motion stays shoulder-led instead of trap-led.",
    }),
  },
  {
    key: "bridge-thrust",
    patterns: [/^glute bridge$/i, /^hip thrust$/i, /glute bridge/i, /hip thrust/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Glute Bridge / Hip Thrust",
      matchedLabel: label,
      whatItIs: "A hip-extension movement that builds glutes and supports hinge and sprint mechanics.",
      howToDoIt: "Drive through the heels, lift the hips until the trunk and thighs line up, and lower with control.",
      repCountsAs: "One full lift and lower is one rep.",
      commonSubstitutions: ["Bodyweight glute bridge", "Hip thrust", "Single-leg bridge"],
      cautionNotes: "Do not crank the lower back at the top to fake extra range.",
      setupNotes: "Keep the ribs stacked and finish with the hips, not the low back.",
    }),
  },
  {
    key: "carry",
    patterns: [/^carry$/i, /^farmer carry$/i, /^farmer's carry$/i, /^suitcase carry$/i, /carry$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Carry",
      matchedLabel: label,
      whatItIs: "A loaded carry that trains grip, trunk stiffness, posture, and conditioning support.",
      howToDoIt: "Stand tall, brace the midline, and walk under control without letting the weight pull you out of position.",
      repCountsAs: "The full written distance or time counts as one carry set.",
      commonSubstitutions: ["Farmer carry", "Suitcase carry", "Trap-bar carry"],
      cautionNotes: "Do not turn it into a sloppy sprint or a side bend contest.",
      setupNotes: "Choose a load that makes you work without making the posture collapse.",
    }),
  },
  {
    key: "calf-raise",
    patterns: [/^calf raise$/i, /^standing calf raise$/i, /^seated calf raise$/i, /calf raise/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Calf Raise",
      matchedLabel: label,
      whatItIs: "A lower-leg accessory that builds calves, ankle stiffness, and run-support durability.",
      howToDoIt: "Lower under control, drive up through the ball of the foot, and finish tall without bouncing every rep.",
      repCountsAs: "One full controlled lower and raise is one rep.",
      commonSubstitutions: ["Standing calf raise", "Seated calf raise", "Eccentric heel drop"],
      cautionNotes: "Do not rush the bottom if the Achilles or arch starts to feel sketchy.",
      setupNotes: "A brief pause at the bottom and top usually makes the set more honest.",
    }),
  },
  {
    key: "trunk-stability",
    patterns: [/^plank$/i, /^side plank$/i, /^dead bug$/i, /^hollow body hold$/i, /plank/i, /dead bug/i, /hollow body/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Trunk Stability Drill",
      matchedLabel: label,
      whatItIs: "A trunk-control drill that teaches position, bracing, and clean force transfer.",
      howToDoIt: "Hold or move slowly while keeping the ribs down, pelvis controlled, and breathing calm.",
      repCountsAs: "Timed drills count by seconds; dynamic drills count one full controlled rep per side or rep.",
      commonSubstitutions: ["Plank", "Side plank", "Dead bug"],
      cautionNotes: "Stop if you can only hold the position by arching the lower back.",
      setupNotes: "Short, high-quality sets usually teach the position better than ugly long ones.",
    }),
  },
];

const FALLBACK_EXPLANATIONS = [
  {
    pattern: /complex/i,
    build: ({ label }) => createExplanation({
      canonicalLabel: label || "Complex",
      matchedLabel: label,
      whatItIs: "A complex links multiple movements together before you rest.",
      howToDoIt: "Keep moving through the listed sequence without dropping the flow unless the template tells you to reset.",
      repCountsAs: "One full sequence counts as one rep or one round.",
      commonSubstitutions: ["Simplify to fewer moves", "Use lighter load", "Swap to a similar pattern"],
      cautionNotes: "Choose a load you can control through the hardest step.",
    }),
  },
  {
    pattern: /interval/i,
    build: ({ label }) => createExplanation({
      canonicalLabel: label || "Intervals",
      matchedLabel: label,
      whatItIs: "Intervals alternate work and recovery blocks.",
      howToDoIt: "Match the target effort on the work and truly recover between repeats.",
      repCountsAs: "One work block plus one recovery block is usually one rep.",
      commonSubstitutions: ["Time-based repeats", "Bike or rower repeats"],
      setupNotes: "Check work and recovery times before you start.",
    }),
  },
];

const buildGenericMovementExplanation = (label = "") => {
  const safeLabel = sanitizeText(label, 120);
  const normalizedLabel = normalizeLookupLabel(safeLabel);
  if (!safeLabel || !DEMO_WORTHY_LABEL.test(safeLabel)) return null;

  if (/\btempo|interval|run|bike|rower|ski|swim\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A conditioning block that should feel purposeful, repeatable, and tied to the session goal instead of random suffering.",
      howToDoIt: "Warm up first, hit the written effort honestly, and let the recoveries do their job so the last rep still looks organized.",
      repCountsAs: "Each written repeat or the full continuous block counts as the work, depending on the session.",
      commonSubstitutions: ["Bike or rower version", "Time-based version", "Lower-impact conditioning tool"],
      cautionNotes: "If mechanics fall apart early, back off slightly before the whole session turns into survival mode.",
      setupNotes: "Know the target effort, work duration, and recovery before you start.",
    });
  }

  if (/\bplank|dead bug|bird dog|hollow|leg raise|crunch|ab wheel|pallof|march\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A trunk-control drill that teaches bracing, position, and cleaner force transfer through the whole body.",
      howToDoIt: "Move slowly or hold the position while keeping the ribs down, pelvis controlled, and breathing steady.",
      repCountsAs: "Timed drills count by seconds; dynamic drills count one full controlled rep or one rep per side.",
      commonSubstitutions: ["Plank variation", "Dead bug variation", "Side plank or Pallof press"],
      cautionNotes: "Stop before you have to arch the lower back or hold your breath to fake the position.",
      setupNotes: "Short, honest sets teach the position better than long sloppy ones.",
    });
  }

  if (/\bcarry|sled|farmer|suitcase\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A loaded locomotion drill that builds posture, trunk stiffness, grip, and useful conditioning support.",
      howToDoIt: "Stand tall, brace first, and keep each step controlled instead of letting the load drag you out of position.",
      repCountsAs: "The full written distance or time counts as one set.",
      commonSubstitutions: ["Farmer carry", "Suitcase carry", "Sled push or drag"],
      cautionNotes: "Do not turn it into a race if the posture or breathing falls apart.",
      setupNotes: "Pick a load that challenges you without collapsing the line from ribs to pelvis.",
    });
  }

  if (/\bclean|snatch|swing|get-up|get up|hop|jump\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "An explosive movement that should train speed, coordination, and crisp positions more than grinding effort.",
      howToDoIt: "Own the start position, move fast through the intent of the rep, and reset before the next one if the quality slips.",
      repCountsAs: "One full explosive effort with a clean catch, landing, or finish counts as one rep.",
      commonSubstitutions: ["Medicine-ball throw", "Kettlebell swing", "Lower-impact jump or power drill"],
      cautionNotes: "Stop the set when the movement loses snap or the landing gets noisy.",
      setupNotes: "Explosive work is usually better with lower reps and cleaner rest than with fatigue chasing.",
    });
  }

  if (/\bcurl|extension|tricep|bicep|pressdown|pushdown|skull crusher|lateral|fly|face pull|pull-apart|external rotation|wall slide|raise\b/i.test(normalizedLabel)) {
    const substitutions = /\bcurl|bicep\b/i.test(normalizedLabel)
      ? ["Cable curl", "DB curl", "Hammer curl"]
      : /\bpressdown|pushdown|extension|tricep|skull crusher\b/i.test(normalizedLabel)
      ? ["Cable pressdown", "DB triceps extension", "Close-grip push-up"]
      : /\bface pull|pull-apart|external rotation|wall slide\b/i.test(normalizedLabel)
      ? ["Face pull", "Band pull-apart", "External rotation"]
      : ["Cable variation", "Dumbbell variation", "Machine variation"];
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A focused accessory lift that builds the target muscle without asking for much total-system fatigue.",
      howToDoIt: "Set the working joint first, move through the fullest range you can control, and keep momentum out of the rep.",
      repCountsAs: "One full controlled curl, raise, fly, pressdown, or extension is one rep.",
      commonSubstitutions: substitutions,
      cautionNotes: "If the torso starts swinging or the shoulder loses position, the load is too heavy for the point of the movement.",
      setupNotes: "Use a load that lets you feel the target area working instead of chasing numbers with sloppy form.",
    });
  }

  if (/\bbench|press|push-up|push up|dip\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A pressing pattern that trains chest, shoulders, triceps, and stable upper-body force production.",
      howToDoIt: "Set the shoulders first, keep the ribs organized, and press through a full controlled range without bouncing or shrugging.",
      repCountsAs: "One controlled lower plus one clean press or push back to the finish counts as one rep.",
      commonSubstitutions: ["Dumbbell press", "Machine press", "Push-up variation"],
      cautionNotes: "Stop the set before the shoulders roll forward or the rep turns into a bounce.",
      setupNotes: "Feet, trunk, and shoulder position should stay organized before you worry about load.",
    });
  }

  if (/\brow|pull|chin|pulldown|pull-down|pull down\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A pulling pattern that trains upper back, lats, biceps, and shoulder control.",
      howToDoIt: "Set the torso, pull with the elbows instead of jerking with the hands, and lower under control to full range.",
      repCountsAs: "Each full pull plus the controlled return counts as one rep.",
      commonSubstitutions: ["Chest-supported row", "Lat pulldown", "Band row"],
      cautionNotes: "Do not yank the rep with momentum or turn it into a shrug.",
      setupNotes: "Choose the grip and support that lets you feel the upper back moving cleanly.",
    });
  }

  if (/\bsquat|leg press|split squat|lunge|step-up|step up|calf\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A lower-body pattern that builds leg strength, balance, and cleaner force through the hips, knees, and feet.",
      howToDoIt: "Brace first, keep the foot pressure honest, and move through the deepest clean range you can control today.",
      repCountsAs: "One full controlled lower and one clean stand or drive back up counts as one rep.",
      commonSubstitutions: ["Goblet squat", "Leg press", "Step-up or split squat"],
      cautionNotes: "Do not chase extra depth or load if the trunk and foot pressure stop cooperating.",
      setupNotes: "Pick the stance and range that let the knee and hip track cleanly instead of forcing a shape.",
    });
  }

  if (/\bdeadlift|hinge|rdl|bridge|thrust\b/i.test(normalizedLabel)) {
    return createExplanation({
      canonicalLabel: safeLabel,
      matchedLabel: safeLabel,
      whatItIs: "A hinge-dominant pattern that builds glutes, hamstrings, and trunk stiffness.",
      howToDoIt: "Set ribs over hips, push the hips back, keep the load close, and finish tall without overextending.",
      repCountsAs: "One clean hinge or pull plus the controlled return counts as one rep.",
      commonSubstitutions: ["Trap-bar deadlift", "DB RDL", "Hip thrust or bridge"],
      cautionNotes: "Do not round the lower back or chase the lockout by leaning back.",
      setupNotes: "If the floor start or bottom position gets ugly, shorten the range and keep the hinge pattern clean.",
    });
  }

  return createExplanation({
    canonicalLabel: safeLabel,
    matchedLabel: safeLabel,
    whatItIs: "A planned movement that should look controlled, repeatable, and specific to the goal of the session.",
    howToDoIt: "Set the start position first, move through a clean range, and stop before the rep turns into improvisation.",
    repCountsAs: "One full controlled repetition or one written work interval counts as the work.",
    commonSubstitutions: ["Nearest similar pattern", "Easier variation", "Supported variation"],
    cautionNotes: "Keep the quality of the movement higher than the urge to add load or speed.",
    setupNotes: "If the label is broad, pick the cleanest stable version you can execute today.",
  });
};

const resolveLabelFromInput = (input = "") => {
  if (typeof input === "string") return sanitizeText(input, 160);
  if (input && typeof input === "object") {
    return sanitizeText(
      input.label
      || input.sessionLabel
      || input.name
      || input.title
      || input.type
      || "",
      160
    );
  }
  return "";
};

export const getMovementExplanation = (input = "") => {
  const label = resolveLabelFromInput(input);
  const normalizedLabel = normalizeLookupLabel(label);

  if (!normalizedLabel) {
    return {
      found: false,
      label: "",
      canonicalLabel: "",
      matchedLabel: "",
      whatItIs: "",
      howToDoIt: "",
      repCountsAs: "",
      commonSubstitutions: [],
      cautionNotes: "",
      setupNotes: "",
      demoSearchUrl: "",
    };
  }

  const directMatch = MOVEMENT_EXPLANATIONS.find((entry) => entry.patterns.some((pattern) => pattern.test(label)));
  const explanation = directMatch?.build({ label })
    || FALLBACK_EXPLANATIONS.find((entry) => entry.pattern.test(label))?.build({ label })
    || buildGenericMovementExplanation(label);

  if (!explanation) {
    return {
      found: false,
      label,
      canonicalLabel: "",
      matchedLabel: label,
      whatItIs: "",
      howToDoIt: "",
      repCountsAs: "",
      commonSubstitutions: [],
      cautionNotes: "",
      setupNotes: "",
      demoSearchUrl: buildMovementDemoUrl(label),
    };
  }

  return {
    found: true,
    label,
    ...explanation,
  };
};

