-- CreateTable
CREATE TABLE "TrackedChannel" (
    "channelId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "TrackedVideoSnapshot" (
    "id" SERIAL NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedVideoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedVideoSnapshot_channelId_idx" ON "TrackedVideoSnapshot"("channelId");

-- CreateIndex
CREATE INDEX "TrackedVideoSnapshot_videoId_idx" ON "TrackedVideoSnapshot"("videoId");
