-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "country" TEXT,
    "defaultLanguage" TEXT,
    "subscriberCount" INTEGER NOT NULL,
    "totalViews" BIGINT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "channelPublishedAt" TIMESTAMP(3) NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "dominantCategoryId" TEXT,
    "firstDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSnapshot" (
    "id" SERIAL NOT NULL,
    "channelId" TEXT NOT NULL,
    "subscriberCount" INTEGER NOT NULL,
    "avgViewsRecent" DOUBLE PRECISION NOT NULL,
    "medianViewsRecent" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelSnapshot_channelId_idx" ON "ChannelSnapshot"("channelId");

-- AddForeignKey
ALTER TABLE "ChannelSnapshot" ADD CONSTRAINT "ChannelSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
