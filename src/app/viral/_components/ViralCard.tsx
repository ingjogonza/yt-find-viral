import { channelFormatLabel, channelQualityLabel } from "@/lib/classification";
import type { ViralChannel } from "@/lib/viral";
import { FavoriteButton } from "@/app/_components/FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

type ViralCardProps = {
  channel: ViralChannel;
  isFavorite: boolean;
};

export function ViralCard({ channel, isFavorite }: ViralCardProps) {
  return (
    <li className="relative overflow-hidden rounded-lg border border-gray-200">
      <div className="absolute top-2 right-2 z-10 rounded-full bg-white/90 px-1.5 py-0.5 shadow-sm">
        <FavoriteButton channelId={channel.id} isFavorite={isFavorite} />
      </div>
      <a
        href={
          channel.representativeVideoId
            ? `https://www.youtube.com/watch?v=${channel.representativeVideoId}`
            : `https://www.youtube.com/channel/${channel.id}`
        }
        target="_blank"
        rel="noopener noreferrer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>
            avoids configuring next/image remote-domain allowlisting for
            YouTube's thumbnail hosts, out of scope for this prompt. */}
        <img
          src={channel.thumbnailUrl}
          alt=""
          width={480}
          height={270}
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      </a>
      <div className="p-4">
        <a
          href={`https://www.youtube.com/channel/${channel.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-base font-semibold text-gray-900 hover:underline"
          title={channel.title}
        >
          {channel.title}
        </a>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">Suscriptores</dt>
          <dd className="text-right tabular-nums text-gray-900">{formatNumber(channel.subscriberCount)}</dd>
          <dt className="text-gray-500">Vistas prom.</dt>
          <dd className="text-right tabular-nums text-gray-900">{formatNumber(channel.avgViewsRecent)}</dd>
          <dt className="text-gray-500">Días desde inicio</dt>
          <dd className="text-right tabular-nums text-gray-900">{formatNumber(channel.daysSinceStart)}</dd>
        </dl>
        <p className="mt-3 text-xs text-gray-500">
          {channelFormatLabel(channel.format)} · {channelQualityLabel(channel.quality)}
        </p>
      </div>
    </li>
  );
}
