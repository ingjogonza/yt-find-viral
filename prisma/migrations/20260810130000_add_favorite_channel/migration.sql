-- CreateTable
CREATE TABLE "FavoriteChannel" (
    "channelId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteChannel_pkey" PRIMARY KEY ("channelId")
);
