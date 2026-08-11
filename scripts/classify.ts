/**
 * Classification script.
 *
 * Picks channels that haven't been classified yet (classifiedAt IS NULL),
 * sends each one's representative thumbnail + title/description to Claude
 * Haiku 4.5 (vision), and saves format/quality/isFaceless/confidence when
 * (and only when) Claude returns a valid classify_channel tool call —
 * forced via tool_choice, so format/quality are enum-validated by the API
 * itself before we ever see the response.
 *
 * Run directly with: npx tsx scripts/classify.ts
 *
 * Designed to run once a day (see .github/workflows/classify.yml). Already-
 * classified channels (classifiedAt set) are never touched again — this
 * script only ever selects classifiedAt IS NULL.
 */

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import {
  CHANNEL_FORMATS,
  CHANNEL_FORMAT_DESCRIPTIONS_EN,
  CHANNEL_QUALITIES,
  CHANNEL_QUALITY_DESCRIPTION_EN,
  parseClassificationResult,
  type ClassificationResult,
} from "../src/lib/classification";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How many not-yet-classified channels to process in a single run. */
export const MAX_CHANNELS_PER_CLASSIFY_RUN = 150;

/**
 * Per spec: NO model more expensive than Haiku for this task. Vision-capable,
 * cheapest current Claude model.
 */
const CLASSIFICATION_MODEL = "claude-haiku-4-5";

/** Generous but bounded — this is a small structured-JSON classification, not an essay. */
const MAX_OUTPUT_TOKENS = 300;

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const formatList = CHANNEL_FORMATS.map(
    (format) => `- "${format}": ${CHANNEL_FORMAT_DESCRIPTIONS_EN[format]}`,
  ).join("\n");

  return [
    "You classify a YouTube channel from one representative video thumbnail plus its title and description.",
    "",
    "Call the classify_channel tool with your classification. Do not respond with any other text.",
    "",
    "format — pick the single best-fitting value:",
    formatList,
    "",
    `quality — ${CHANNEL_QUALITY_DESCRIPTION_EN}`,
    "",
    "isFaceless — true if the channel's content style does not center on a visible on-camera presenter/host (e.g. voiceover-only, screen recordings, stock/AI footage, animation without a host); false if a visible host/presenter is a core part of the content.",
    "",
    "confidence — your confidence in this classification, as a number from 0 to 1.",
  ].join("\n");
}

/**
 * Tool definition forcing Claude to return the classification as validated,
 * structured tool input instead of free-text JSON. The API validates
 * `format`/`quality` against the enum before the call ever reaches us, which
 * is what eliminates the "Claude picked a value outside the allowed list"
 * failure mode this replaces.
 */
const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_channel",
  description:
    "Record the classification for a YouTube channel based on its representative thumbnail and title/description.",
  input_schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: [...CHANNEL_FORMATS],
        description: "The channel's single best-fitting content format.",
      },
      quality: {
        type: "string",
        enum: [...CHANNEL_QUALITIES],
        description: CHANNEL_QUALITY_DESCRIPTION_EN,
      },
      isFaceless: {
        type: "boolean",
        description:
          "True if the channel's content does not center on a visible on-camera presenter/host.",
      },
      confidence: {
        type: "number",
        description: "Confidence in this classification, from 0 to 1.",
      },
    },
    required: ["format", "quality", "isFaceless", "confidence"],
  },
};

function buildUserContent(
  title: string,
  description: string,
  imageBase64: string,
  imageMediaType: "image/jpeg" | "image/png" | "image/webp",
): Anthropic.MessageParam["content"] {
  return [
    {
      type: "image",
      source: { type: "base64", media_type: imageMediaType, data: imageBase64 },
    },
    {
      type: "text",
      text: `Channel title: ${title || "(no title)"}\n\nChannel description: ${
        description || "(no description)"
      }`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Image download
// ---------------------------------------------------------------------------

type DownloadedImage = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

function inferMediaType(contentType: string | null): DownloadedImage["mediaType"] {
  if (contentType?.includes("png")) return "image/png";
  if (contentType?.includes("webp")) return "image/webp";
  return "image/jpeg"; // YouTube thumbnails are jpeg by default
}

async function downloadImageAsBase64(url: string): Promise<DownloadedImage | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString("base64"),
      mediaType: inferMediaType(response.headers.get("content-type")),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

type ChannelToClassify = {
  id: string;
  title: string;
  description: string;
  representativeVideoThumbnailUrl: string;
};

type RunSummary = {
  candidateCount: number;
  classifiedCount: number;
  failedCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

async function run(prisma: PrismaClient, anthropic: Anthropic): Promise<RunSummary> {
  const candidates = (await prisma.channel.findMany({
    where: {
      classifiedAt: null,
      representativeVideoThumbnailUrl: { not: null },
    },
    orderBy: { firstDiscoveredAt: "asc" },
    take: MAX_CHANNELS_PER_CLASSIFY_RUN,
    select: {
      id: true,
      title: true,
      description: true,
      representativeVideoThumbnailUrl: true,
    },
  })) as ChannelToClassify[];

  const systemPrompt = buildSystemPrompt();

  let classifiedCount = 0;
  let failedCount = 0;
  let estimatedInputTokens = 0;
  let estimatedOutputTokens = 0;

  for (const channel of candidates) {
    const image = await downloadImageAsBase64(channel.representativeVideoThumbnailUrl);
    if (!image) {
      console.warn(`[skip] ${channel.id}: could not download thumbnail image`);
      failedCount++;
      continue;
    }

    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: CLASSIFICATION_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: "classify_channel" },
        messages: [
          {
            role: "user",
            content: buildUserContent(channel.title, channel.description, image.base64, image.mediaType),
          },
        ],
      });
    } catch (error) {
      console.warn(`[skip] ${channel.id}: Claude API request failed — ${String(error)}`);
      failedCount++;
      continue;
    }

    estimatedInputTokens += response.usage.input_tokens;
    estimatedOutputTokens += response.usage.output_tokens;

    const toolUseBlock = response.content.find((block) => block.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      console.warn(`[skip] ${channel.id}: no tool_use block in Claude's response`);
      failedCount++;
      continue;
    }

    const result: ClassificationResult | null = parseClassificationResult(toolUseBlock.input);
    if (!result) {
      console.warn(
        `[skip] ${channel.id}: tool_use input missing/invalid fields — ${JSON.stringify(toolUseBlock.input).slice(0, 200)}`,
      );
      failedCount++;
      continue;
    }

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        format: result.format,
        quality: result.quality,
        isFaceless: result.isFaceless,
        classificationConfidence: result.confidence,
        classifiedAt: new Date(),
      },
    });
    classifiedCount++;
  }

  return {
    candidateCount: candidates.length,
    classifiedCount,
    failedCount,
    estimatedInputTokens,
    estimatedOutputTokens,
  };
}

function printSummary(summary: RunSummary): void {
  console.log("=== Channel classification run summary ===");
  console.log(`Candidates selected:     ${summary.candidateCount} (cap: ${MAX_CHANNELS_PER_CLASSIFY_RUN})`);
  console.log(`Successfully classified: ${summary.classifiedCount}`);
  console.log(`Failed / skipped:        ${summary.failedCount}`);
  console.log(`Estimated input tokens:  ${summary.estimatedInputTokens}`);
  console.log(`Estimated output tokens: ${summary.estimatedOutputTokens}`);
  console.log(`Model used:              ${CLASSIFICATION_MODEL}`);
  console.log("============================================");
}

async function main(): Promise<void> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
  }

  const prisma = new PrismaClient();
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  try {
    const summary = await run(prisma, anthropic);
    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Classification run failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});
