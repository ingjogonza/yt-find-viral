-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "avgShortsViews" DOUBLE PRECISION,
ADD COLUMN     "hasShorts" BOOLEAN,
ADD COLUMN     "medianShortsViews" DOUBLE PRECISION,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalLongInSample" INTEGER,
ADD COLUMN     "totalShortsInSample" INTEGER;
