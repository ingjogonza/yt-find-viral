import { removeTrackedChannel } from "../actions";

type RemoveChannelButtonProps = {
  channelId: string;
};

/** Plain server-action form (no client JS needed) that unfollows one channel. */
export function RemoveChannelButton({ channelId }: RemoveChannelButtonProps) {
  const removeThisChannel = removeTrackedChannel.bind(null, channelId);

  return (
    <form action={removeThisChannel}>
      <button type="submit" className="text-sm text-red-600 hover:text-red-800 hover:underline">
        Dejar de seguir
      </button>
    </form>
  );
}
