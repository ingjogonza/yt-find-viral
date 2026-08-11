/**
 * Pure computation + parsing helpers for the channel tracker (/tracker,
 * Prompt 6). Mirrors rpm.ts's shape: no Prisma/YouTube API calls in here —
 * the page loader does ONE query per request and passes plain data into
 * these functions, same "single fetch, compute in memory" approach as
 * catalog.ts.
 */

/** Hard cap on how many channels a user can track at once (see /tracker's add-channel form). */
export const MAX_TRACKED_CHANNELS = 25;

/** A video counts as "evergreen" only once it's at least this old. */
export const EVERGREEN_MIN_AGE_DAYS = 14;

/** ...AND its most recent snapshot interval must have added at least this
 * share (1%) of its current total views. */
export const EVERGREEN_MIN_RECENT_SHARE = 0.01;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// channelId / URL parsing
// ---------------------------------------------------------------------------

// YouTube channel ids are always "UC" followed by 22 base64url-ish characters.
const CHANNEL_ID_PATTERN = /^UC[a-zA-Z0-9_-]{22}$/;
const CHANNEL_URL_PATTERN = /\/channel\/(UC[a-zA-Z0-9_-]{22})/;

/**
 * Extracts a YouTube channelId from either a raw id or a full channel URL
 * (".../channel/UC..."). Does NOT resolve @handles, /c/ custom URLs, or
 * legacy /user/ URLs to a channelId — that needs an extra YouTube API call
 * (channels.list?forHandle=...) this page deliberately doesn't spend quota
 * on for a "paste an id or a channel link" form. Returns null when the
 * input matches neither form, so the caller can show a clear error.
 */
export function parseChannelIdInput(input: string): string | null {
  const trimmed = input.trim();
  if (CHANNEL_ID_PATTERN.test(trimmed)) return trimmed;

  const match = trimmed.match(CHANNEL_URL_PATTERN);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// View velocity / evergreen
// ---------------------------------------------------------------------------

export type ViewSnapshotPoint = {
  viewCount: number;
  capturedAt: Date;
};

/** Sorts by capturedAt descending and returns [mostRecent, secondMostRecent], or null with fewer than 2 points. */
function latestSnapshotPair(
  snapshots: ViewSnapshotPoint[],
): [ViewSnapshotPoint, ViewSnapshotPoint] | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
  return [sorted[0], sorted[1]];
}

/**
 * Views gained between a video's two most recent TrackedVideoSnapshot rows,
 * normalized to a "per 48 hours" rate:
 *   (viewCount_actual - viewCount_anterior) / horas_transcurridas * 48
 *
 * Returns null when there aren't yet at least two snapshots for this video,
 * or when the two most recent snapshots share the same capturedAt (elapsed
 * hours would be 0 — no rate to compute). Negative results are possible if
 * a channel's viewCount ever appears to drop between runs (rare API
 * inconsistency) — callers decide how to display that, this function
 * doesn't clamp it.
 */
export function computeViewVelocity(snapshots: ViewSnapshotPoint[]): number | null {
  const pair = latestSnapshotPair(snapshots);
  if (!pair) return null;
  const [current, previous] = pair;

  const hoursElapsed = (current.capturedAt.getTime() - previous.capturedAt.getTime()) / MS_PER_HOUR;
  if (hoursElapsed <= 0) return null;

  return ((current.viewCount - previous.viewCount) / hoursElapsed) * 48;
}

export type EvergreenVideo = {
  publishedAt: Date;
  snapshots: ViewSnapshotPoint[];
};

/**
 * True when a video is BOTH old (published more than EVERGREEN_MIN_AGE_DAYS
 * ago) AND still meaningfully gaining views: the raw delta between its two
 * most recent snapshots is at least EVERGREEN_MIN_RECENT_SHARE (1%) of its
 * CURRENT total view count.
 *
 * Deliberately uses the RAW delta over whatever interval separates the two
 * most recent snapshots — not the 48h-normalized rate from
 * computeViewVelocity — because the question here is "is a meaningful share
 * of this video's lifetime views still recent", not a rate comparison.
 */
export function isEvergreen(video: EvergreenVideo, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - video.publishedAt.getTime();
  if (ageMs < EVERGREEN_MIN_AGE_DAYS * MS_PER_DAY) return false;

  const pair = latestSnapshotPair(video.snapshots);
  if (!pair) return false;
  const [current, previous] = pair;
  if (current.viewCount <= 0) return false;

  const recentGain = current.viewCount - previous.viewCount;
  return recentGain / current.viewCount >= EVERGREEN_MIN_RECENT_SHARE;
}
