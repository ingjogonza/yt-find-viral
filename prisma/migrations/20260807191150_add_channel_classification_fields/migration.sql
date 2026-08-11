-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN     "classifiedAt" TIMESTAMP(3),
ADD COLUMN     "containsSyntheticMedia" BOOLEAN,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "isFaceless" BOOLEAN,
ADD COLUMN     "madeForKids" BOOLEAN,
ADD COLUMN     "quality" TEXT,
ADD COLUMN     "representativeVideoThumbnailUrl" TEXT;
