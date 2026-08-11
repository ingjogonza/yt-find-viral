/**
 * Shared classification vocabulary — imported by BOTH scripts/classify.ts
 * (the Claude vision classifier) and the catalog UI (filters + table cells),
 * so the two never drift apart. Contains no Prisma/DB imports, so it's safe
 * to import from a standalone `tsx` script as well as Next.js components.
 */

export const CHANNEL_FORMATS = [
  "commentary",
  "documentary",
  "storytelling",
  "tutorial_explainer",
  "listicle_countdown",
  "compilation",
  "reaction",
  "other",
] as const;

export type ChannelFormat = (typeof CHANNEL_FORMATS)[number];

/** English descriptions used in the classification prompt sent to Claude. */
export const CHANNEL_FORMAT_DESCRIPTIONS_EN: Record<ChannelFormat, string> = {
  commentary: "The creator gives their own opinions/commentary on a topic, video, or event.",
  documentary: "An in-depth, factual or investigative video essay about a real subject.",
  storytelling: "A narrative-driven video that tells a story, real or fictional.",
  tutorial_explainer: "A step-by-step how-to, or a video that explains a concept or topic.",
  listicle_countdown: "A list-format or ranked countdown video (e.g. \"Top 10 ...\").",
  compilation: "Compiles clips or moments from other sources or the creator's own past content.",
  reaction: "The creator reacts to another video or piece of media while it plays.",
  other: "Doesn't clearly fit any of the formats above.",
};

/** Spanish display labels, for the catalog UI (format filter + table cell). */
export const CHANNEL_FORMAT_LABELS_ES: Record<ChannelFormat, string> = {
  commentary: "Comentario / opinión",
  documentary: "Documental",
  storytelling: "Narrativa",
  tutorial_explainer: "Tutorial / explicativo",
  listicle_countdown: "Listas / rankings",
  compilation: "Recopilación",
  reaction: "Reacción",
  other: "Otro",
};

export function isChannelFormat(value: unknown): value is ChannelFormat {
  return typeof value === "string" && (CHANNEL_FORMATS as readonly string[]).includes(value);
}

export function channelFormatLabel(format: string | null | undefined): string {
  if (!format) return "Sin clasificar todavía";
  return isChannelFormat(format) ? CHANNEL_FORMAT_LABELS_ES[format] : format;
}

export const CHANNEL_QUALITIES = ["low", "high"] as const;

export type ChannelQuality = (typeof CHANNEL_QUALITIES)[number];

export const CHANNEL_QUALITY_DESCRIPTION_EN =
  "low = simple/low-effort production: found-footage or static-camera footage, robotic/AI text-to-speech " +
  "narration, or a repeated, barely-varied template across videos. " +
  "high = professionally edited, careful graphics/motion design, and good cinematography or animation.";

export const CHANNEL_QUALITY_LABELS_ES: Record<ChannelQuality, string> = {
  low: "Baja",
  high: "Alta",
};

export function isChannelQuality(value: unknown): value is ChannelQuality {
  return value === "low" || value === "high";
}

export function channelQualityLabel(quality: string | null | undefined): string {
  if (!quality) return "Sin clasificar todavía";
  return isChannelQuality(quality) ? CHANNEL_QUALITY_LABELS_ES[quality] : quality;
}

/** Placeholder shown for classification-derived columns before classifiedAt is set. */
export const NOT_YET_CLASSIFIED_LABEL_ES = "Sin clasificar todavía";

/**
 * The exact JSON shape scripts/classify.ts asks Claude to return, and
 * validates the response against before saving anything.
 */
export type ClassificationResult = {
  format: ChannelFormat;
  quality: ChannelQuality;
  isFaceless: boolean;
  confidence: number;
};

/**
 * Strict runtime validator for a parsed classification JSON object. Returns
 * the narrowed, valid result or null — never fills in defaults for a
 * missing/invalid field, per spec ("no guardes nada... no inventes valores
 * por defecto").
 */
export function parseClassificationResult(value: unknown): ClassificationResult | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (!isChannelFormat(candidate.format)) return null;
  if (!isChannelQuality(candidate.quality)) return null;
  if (typeof candidate.isFaceless !== "boolean") return null;
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence)) return null;

  return {
    format: candidate.format,
    quality: candidate.quality,
    isFaceless: candidate.isFaceless,
    confidence: candidate.confidence,
  };
}
