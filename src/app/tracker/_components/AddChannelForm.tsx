"use client";

import { useActionState } from "react";
import { addTrackedChannel, type AddChannelState } from "../actions";

const initialState: AddChannelState = { error: null };

/** Add-channel form — client component only because useActionState needs to
 * read/display the server action's validation error (duplicate, over cap,
 * unparseable input). */
export function AddChannelForm() {
  const [state, formAction, pending] = useActionState(addTrackedChannel, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[260px] flex-1">
        <label htmlFor="channelIdOrUrl" className="block text-sm font-medium text-gray-700">
          Canal a seguir (ID o URL de YouTube)
        </label>
        <input
          type="text"
          id="channelIdOrUrl"
          name="channelIdOrUrl"
          placeholder="UCxxxxxxxxxxxxxxxxxxxxxx o https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {pending ? "Agregando..." : "Agregar"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
