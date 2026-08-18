/**
 * Scout has no live search-volume or competition data source — CLAUDE.md
 * only authorizes external paid API calls when explicitly stated there,
 * and none is stated for Scout. So competition/angle signals here are
 * transparent, deterministic heuristics derived from the theme text
 * itself, not fabricated stand-ins for real market data. Every report
 * says so explicitly.
 */

export const KNOWN_SATURATED_NICHES = [
  "mandala",
  "unicorn",
  "dinosaur",
  "flower",
  "animal",
  "ocean",
  "dog",
  "cat",
  "butterfly",
  "christmas",
  "halloween",
  "fairy",
  "princess",
  "dragon",
  "alphabet",
  "numbers",
  "garden",
  "forest",
] as const;

export const SPECIFICITY_MODIFIERS = [
  "gothic",
  "steampunk",
  "art deco",
  "art nouveau",
  "folk art",
  "botanical",
  "geometric",
  "line art",
  "cottagecore",
  "victorian",
  "minimalist",
  "vintage",
  "retro",
  "nordic",
  "japanese",
  "celtic",
] as const;

const ANGLE_TEMPLATES = [
  "Pair \"{theme}\" with a large-print, single-sided page format aimed at readers who want less bleed-through.",
  "Narrow \"{theme}\" to one specific art style (e.g. Art Nouveau or geometric line work) instead of a generic treatment.",
  "Cross \"{theme}\" with a specific hobby or fandom audience rather than targeting colorists broadly.",
  "Split \"{theme}\" into a themed series (3-5 short volumes) instead of one large general volume.",
  "Target a specific skill level for \"{theme}\" — e.g. beginner-friendly bold outlines, or highly detailed for experienced colorists.",
  "Add a seasonal or gift-occasion framing to \"{theme}\" to capture time-boxed search intent.",
  "Combine \"{theme}\" with a specific regional or cultural motif to differentiate from generic listings.",
  "Offer \"{theme}\" as a themed gift set framing (e.g. paired affirmations or quotes per page).",
] as const;

export type CompetitionLevel = "low" | "medium" | "high";

export interface CompetitionSignals {
  wordCount: number;
  matchesKnownSaturatedNiche: boolean;
  matchedSaturatedTerms: string[];
  hasSpecificityModifier: boolean;
  matchedModifiers: string[];
}

export interface CompetitionAssessment {
  level: CompetitionLevel;
  rationale: string;
  signals: CompetitionSignals;
}

function normalize(theme: string): string {
  return theme.trim().toLowerCase();
}

function findMatches(haystack: string, terms: readonly string[]): string[] {
  return terms.filter((term) => haystack.includes(term));
}

export function assessCompetition(theme: string): CompetitionAssessment {
  const normalized = normalize(theme);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const matchedSaturatedTerms = findMatches(normalized, KNOWN_SATURATED_NICHES);
  const matchedModifiers = findMatches(normalized, SPECIFICITY_MODIFIERS);

  const signals: CompetitionSignals = {
    wordCount,
    matchesKnownSaturatedNiche: matchedSaturatedTerms.length > 0,
    matchedSaturatedTerms,
    hasSpecificityModifier: matchedModifiers.length > 0,
    matchedModifiers,
  };

  let level: CompetitionLevel;
  let rationale: string;

  if (signals.matchesKnownSaturatedNiche && !signals.hasSpecificityModifier) {
    level = "high";
    rationale = `Theme matches well-known saturated KDP coloring niche term(s): ${matchedSaturatedTerms.join(", ")}, with no differentiating style/audience modifier.`;
  } else if (signals.hasSpecificityModifier || wordCount >= 3) {
    level = "low";
    rationale = signals.hasSpecificityModifier
      ? `Theme includes a differentiating style/audience modifier: ${matchedModifiers.join(", ")}.`
      : `Theme is specific (${wordCount} words) rather than a single broad noun.`;
  } else {
    level = "medium";
    rationale = "Theme is neither a known saturated niche nor clearly differentiated — moderate estimated competition.";
  }

  return { level, rationale, signals };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function suggestAngle(theme: string): string {
  const index = hashString(normalize(theme)) % ANGLE_TEMPLATES.length;
  const template = ANGLE_TEMPLATES[index]!;
  return template.replace("{theme}", theme.trim());
}

export function generateKeywordVariants(theme: string): string[] {
  const t = theme.trim();
  const variants = [
    `${t} coloring book`,
    `${t} coloring pages`,
    `adult ${t} coloring book`,
    `${t} coloring book for kids`,
    `easy ${t} coloring book`,
    `detailed ${t} coloring pages`,
  ];
  return Array.from(new Set(variants.map((v) => v.trim())));
}
