/**
 * Static map of YouTube's official video category IDs to human-readable
 * names. These are fixed by YouTube (same set across regions, rarely
 * change) — no need to call videoCategories.list at request time.
 *
 * Source: YouTube Data API v3 `videoCategories` (region "US", which covers
 * every category ID YouTube currently issues). IDs are numeric strings
 * because that's the type snippet.categoryId comes back as from the API.
 */
export const YOUTUBE_CATEGORY_NAMES: Record<string, string> = {
  "1": "Film & Animation",
  "2": "Autos & Vehicles",
  "10": "Music",
  "15": "Pets & Animals",
  "17": "Sports",
  "18": "Short Movies",
  "19": "Travel & Events",
  "20": "Gaming",
  "21": "Videoblogging",
  "22": "People & Blogs",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News & Politics",
  "26": "Howto & Style",
  "27": "Education",
  "28": "Science & Technology",
  "29": "Nonprofits & Activism",
  "30": "Movies",
  "31": "Anime/Animation",
  "32": "Action/Adventure",
  "33": "Classics",
  "34": "Comedy",
  "35": "Documentary",
  "36": "Drama",
  "37": "Family",
  "38": "Foreign",
  "39": "Horror",
  "40": "Sci-Fi/Fantasy",
  "41": "Thriller",
  "42": "Shorts",
  "43": "Shows",
  "44": "Trailers",
};

/**
 * Human-readable name for a YouTube category ID, falling back to the raw
 * ID (or a placeholder when null/undefined) when unrecognized.
 */
export function youtubeCategoryName(categoryId: string | null | undefined): string {
  if (!categoryId) return "Sin categoría";
  return YOUTUBE_CATEGORY_NAMES[categoryId] ?? categoryId;
}
