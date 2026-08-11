/** View-model types shared between /tracker's page.tsx and its _components. */

export type TrackedVideoView = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: Date;
  currentViewCount: number;
  velocityPer48h: number | null;
  evergreen: boolean;
};

export type TrackedChannelView = {
  channelId: string;
  addedAt: Date;
  title: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videos: TrackedVideoView[];
  mostExplosiveVideoId: string | null;
  mostEvergreenVideoId: string | null;
};
