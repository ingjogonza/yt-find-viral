import { prisma } from "@/lib/prisma";
import { computeViewVelocity, isEvergreen, MAX_TRACKED_CHANNELS, type ViewSnapshotPoint } from "@/lib/tracker";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { AddChannelForm } from "./_components/AddChannelForm";
import { TrackedChannelCard } from "./_components/TrackedChannelCard";
import type { TrackedChannelView, TrackedVideoView } from "./types";

// Unlike the rest of the app's pages, /tracker doesn't read searchParams —
// nothing would otherwise force per-request rendering. Without this, Next
// would prerender the page once at build time, and it would never reflect
// scripts/track.ts's periodic snapshots (an external DB writer, not a
// Server Action, so revalidatePath("/tracker") never fires for it).
export const dynamic = "force-dynamic";

type VideoAccumulator = {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: Date;
  points: ViewSnapshotPoint[];
};

/**
 * Data layer for /tracker. Two queries total (tracked channels' Channel
 * metadata + ALL their TrackedVideoSnapshot rows), then everything else —
 * grouping snapshots by video, computing velocity/evergreen, picking each
 * channel's "most explosive"/"most evergreen" video — happens in memory in
 * one pass. Same "single fetch per request" approach as catalog.ts.
 */
async function loadTrackerData(): Promise<{ channels: TrackedChannelView[]; totalTracked: number }> {
  const trackedChannels = await prisma.trackedChannel.findMany({ orderBy: { addedAt: "desc" } });
  if (trackedChannels.length === 0) return { channels: [], totalTracked: 0 };

  const channelIds = trackedChannels.map((t) => t.channelId);

  const [channelMetas, snapshots] = await Promise.all([
    prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, title: true, thumbnailUrl: true, subscriberCount: true },
    }),
    prisma.trackedVideoSnapshot.findMany({
      where: { channelId: { in: channelIds } },
      orderBy: { capturedAt: "desc" },
    }),
  ]);

  const channelMetaById = new Map(channelMetas.map((c) => [c.id, c]));

  // Snapshots arrive sorted capturedAt desc, so the FIRST snapshot seen per
  // videoId is the most recent one — used for its current display fields.
  // `points` accumulates every snapshot for that video, which
  // computeViewVelocity/isEvergreen need (they sort internally too, so
  // accumulation order here doesn't matter).
  const videosByVideoId = new Map<string, VideoAccumulator>();
  for (const snapshot of snapshots) {
    let acc = videosByVideoId.get(snapshot.videoId);
    if (!acc) {
      acc = {
        channelId: snapshot.channelId,
        title: snapshot.title,
        thumbnailUrl: snapshot.thumbnailUrl,
        publishedAt: snapshot.publishedAt,
        points: [],
      };
      videosByVideoId.set(snapshot.videoId, acc);
    }
    acc.points.push({ viewCount: snapshot.viewCount, capturedAt: snapshot.capturedAt });
  }

  const videosByChannelId = new Map<string, TrackedVideoView[]>();
  for (const [videoId, acc] of videosByVideoId) {
    const video: TrackedVideoView = {
      videoId,
      title: acc.title,
      thumbnailUrl: acc.thumbnailUrl,
      publishedAt: acc.publishedAt,
      currentViewCount: acc.points[0].viewCount,
      velocityPer48h: computeViewVelocity(acc.points),
      evergreen: isEvergreen({ publishedAt: acc.publishedAt, snapshots: acc.points }),
    };
    const list = videosByChannelId.get(acc.channelId) ?? [];
    list.push(video);
    videosByChannelId.set(acc.channelId, list);
  }

  const channels: TrackedChannelView[] = trackedChannels.map((tracked) => {
    const meta = channelMetaById.get(tracked.channelId);
    const videos = (videosByChannelId.get(tracked.channelId) ?? []).sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
    );

    const mostExplosive = videos.reduce<TrackedVideoView | null>((best, video) => {
      if (video.velocityPer48h == null) return best;
      if (!best || best.velocityPer48h == null || video.velocityPer48h > best.velocityPer48h) return video;
      return best;
    }, null);

    const mostEvergreen = videos
      .filter((v) => v.evergreen)
      .reduce<TrackedVideoView | null>((best, video) => {
        if (!best || video.currentViewCount > best.currentViewCount) return video;
        return best;
      }, null);

    return {
      channelId: tracked.channelId,
      addedAt: tracked.addedAt,
      title: meta?.title ?? null,
      thumbnailUrl: meta?.thumbnailUrl ?? null,
      subscriberCount: meta?.subscriberCount ?? null,
      videos,
      mostExplosiveVideoId: mostExplosive?.videoId ?? null,
      mostEvergreenVideoId: mostEvergreen?.videoId ?? null,
    };
  });

  return { channels, totalTracked: trackedChannels.length };
}

export default async function TrackerPage() {
  const [{ channels, totalTracked }, favoriteChannelIds] = await Promise.all([
    loadTrackerData(),
    getFavoriteChannelIds(prisma),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Channel tracker</h1>
        <p className="mt-1 text-sm text-gray-600">
          Seguí canales específicos (por ejemplo, competidores) y mirá qué video está explotando ahora y
          cuál sigue sumando vistas de forma sostenida (&quot;evergreen&quot;).
        </p>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esta función depende de qué tan seguido corre el seguimiento (cada 3 horas) — las cifras son una
          aproximación, no vistas en tiempo real exacto.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-700">Agregar canal</h2>
          <span className="text-xs text-gray-500">
            {totalTracked}/{MAX_TRACKED_CHANNELS} canales en seguimiento
          </span>
        </div>
        <AddChannelForm />
      </section>

      {channels.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Todavía no estás siguiendo ningún canal. Agregá uno arriba.
        </p>
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <TrackedChannelCard
              key={channel.channelId}
              channel={channel}
              isFavorite={favoriteChannelIds.has(channel.channelId)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
