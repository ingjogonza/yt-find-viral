import { toggleFavoriteChannel } from "@/lib/favorites-actions";

type FavoriteButtonProps = {
  channelId: string;
  isFavorite: boolean;
};

/**
 * Reusable star toggle, wired into every catalog view (main, viral,
 * recientes, shorts, keywords, tracker) plus /favoritos, where the SAME
 * button (always isFavorite=true there) doubles as the "quitar de
 * favoritos" action — no separate remove button needed.
 *
 * Plain server-action form, no client JS, same convention as
 * RemoveChannelButton (tracker).
 */
export function FavoriteButton({ channelId, isFavorite }: FavoriteButtonProps) {
  const toggle = toggleFavoriteChannel.bind(null, channelId, isFavorite);

  return (
    <form action={toggle} className="inline-block">
      <button
        type="submit"
        aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        aria-pressed={isFavorite}
        title={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={
          isFavorite
            ? "text-lg leading-none text-amber-500 hover:text-amber-600"
            : "text-lg leading-none text-gray-300 hover:text-amber-500"
        }
      >
        {isFavorite ? "★" : "☆"}
      </button>
    </form>
  );
}
