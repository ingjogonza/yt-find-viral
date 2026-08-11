import type { TrackedChannelView, TrackedVideoView } from "../types";
import { RemoveChannelButton } from "./RemoveChannelButton";
import { FavoriteButton } from "@/app/_components/FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatVelocity(value: number | null): string {
  if (value == null) return "sin datos suficientes todavía";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${formatNumber(rounded)} vistas/48h`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function VideoRow({ video, isMostExplosive }: { video: TrackedVideoView; isMostExplosive: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> avoids
          configuring next/image remote-domain allowlisting for YouTube's
          thumbnail hosts, same convention as ShortsResultsTable. */}
      <img
        src={video.thumbnailUrl}
        alt=""
        width={80}
        height={45}
        loading="lazy"
        className="h-[45px] w-20 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{video.title}</p>
        <p className="text-xs text-gray-500">
          Publicado {formatDate(video.publishedAt)} · {formatNumber(video.currentViewCount)} vistas
        </p>
        {(isMostExplosive || video.evergreen) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {isMostExplosive && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                🔥 Explosivo ahora
              </span>
            )}
            {video.evergreen && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Evergreen
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right text-sm tabular-nums text-gray-700">
        {formatVelocity(video.velocityPer48h)}
      </div>
    </li>
  );
}

type TrackedChannelCardProps = {
  channel: TrackedChannelView;
  isFavorite: boolean;
};

/** Expandable card (native <details>, no client JS) for one tracked channel:
 * its "most explosive" / "most evergreen" highlights up top, then the full
 * recent-uploads list. FavoriteButton sits OUTSIDE <summary> on purpose — a
 * button nested inside <summary> would also toggle the details open/closed
 * on every click (native browser behavior), which we don't want here. */
export function TrackedChannelCard({ channel, isFavorite }: TrackedChannelCardProps) {
  const mostExplosiveVideo = channel.videos.find((v) => v.videoId === channel.mostExplosiveVideoId) ?? null;
  const mostEvergreenVideo = channel.videos.find((v) => v.videoId === channel.mostEvergreenVideoId) ?? null;

  return (
    <details className="group relative rounded-lg border border-gray-200" open={channel.videos.length > 0}>
      <div className="absolute top-3 right-4 z-10">
        <FavoriteButton channelId={channel.channelId} isFavorite={isFavorite} />
      </div>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 pr-10">
        <div className="flex items-center gap-3">
          {channel.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- see VideoRow above
            <img
              src={channel.thumbnailUrl}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200" />
          )}
          <div>
            <p className="font-medium text-gray-900">{channel.title ?? channel.channelId}</p>
            <p className="text-xs text-gray-500">
              {channel.subscriberCount != null
                ? `${formatNumber(channel.subscriberCount)} suscriptores`
                : "Esperando la primera corrida del tracker"}
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-400 group-open:hidden">Ver videos ▾</span>
      </summary>

      <div className="border-t border-gray-100 px-4 py-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            {mostExplosiveVideo && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
                <p className="font-medium text-orange-800">🔥 Más explosivo ahora</p>
                <p className="truncate text-orange-900">{mostExplosiveVideo.title}</p>
                <p className="text-xs text-orange-700">{formatVelocity(mostExplosiveVideo.velocityPer48h)}</p>
              </div>
            )}
            {mostEvergreenVideo && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <p className="font-medium text-emerald-800">🌲 Más evergreen</p>
                <p className="truncate text-emerald-900">{mostEvergreenVideo.title}</p>
                <p className="text-xs text-emerald-700">
                  {formatNumber(mostEvergreenVideo.currentViewCount)} vistas totales
                </p>
              </div>
            )}
          </div>
          <RemoveChannelButton channelId={channel.channelId} />
        </div>

        {channel.videos.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no hay snapshots para este canal — esperá a la próxima corrida del tracker (cada 3 horas).
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {channel.videos.map((video) => (
              <VideoRow key={video.videoId} video={video} isMostExplosive={video.videoId === channel.mostExplosiveVideoId} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
