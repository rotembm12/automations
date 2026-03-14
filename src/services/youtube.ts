import { VideoMetadata } from "../types";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const MIN_SUBSCRIBERS = 1_000;
const ALLOWED_LANGUAGES = ["en", "iw", "he"]; // English, Hebrew (iw = legacy ISO code)

function isAllowedLanguage(lang: string | undefined): boolean {
  if (!lang) return true; // not set → assume English, include it
  const base = lang.toLowerCase().split("-")[0];
  return ALLOWED_LANGUAGES.includes(base);
}

async function ytFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body}`);
  }
  return res.json();
}

function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function fetchCreatorVideos(creator: string, query: string): Promise<VideoMetadata[]> {
  // 1. Find the creator's channel
  const channelSearch = await ytFetch("search", {
    part: "snippet",
    q: creator,
    type: "channel",
    maxResults: "1",
  });

  const channelItem = channelSearch.items?.[0];
  if (!channelItem) return [];

  const channelId: string = channelItem.id.channelId;
  const channelTitle: string = channelItem.snippet.title;

  // 2. Search latest 5 videos on that channel matching the query
  const searchData = await ytFetch("search", {
    part: "snippet",
    q: query,
    type: "video",
    channelId,
    order: "date",
    maxResults: "5",
  });

  const items: any[] = searchData.items ?? [];
  if (items.length === 0) return [];

  const videoIds = items.map((item: any) => item.id.videoId).join(",");

  // 3. Fetch video details + channel subscriber count in parallel
  const [videosData, channelsData] = await Promise.all([
    ytFetch("videos", { part: "statistics,contentDetails", id: videoIds }),
    ytFetch("channels", { part: "statistics", id: channelId }),
  ]);

  const subscriberCount = parseInt(channelsData.items?.[0]?.statistics?.subscriberCount ?? "0");

  const detailsMap = new Map<string, any>();
  for (const v of videosData.items ?? []) {
    detailsMap.set(v.id, v);
  }

  return items.map((item: any) => {
    const videoId: string = item.id.videoId;
    const details = detailsMap.get(videoId);
    const viewCount = parseInt(details?.statistics?.viewCount ?? "0");
    const duration = formatDuration(details?.contentDetails?.duration ?? "PT0S");
    const thumbnail =
      item.snippet.thumbnails?.maxres?.url ??
      item.snippet.thumbnails?.high?.url ??
      item.snippet.thumbnails?.default?.url ??
      "";

    return {
      id: videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId,
      channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: thumbnail,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      duration,
      viewCount,
      subscriberCount,
    };
  });
}

export async function fetchNewClaudeCodeVideos(
  publishedAfter: string,
  seenIds: Set<string>
): Promise<VideoMetadata[]> {
  // 1. Search for recent "claude code" videos
  const searchData = await ytFetch("search", {
    part: "snippet",
    q: "claude code",
    type: "video",
    order: "date",
    publishedAfter,
    maxResults: "25",
  });

  const items: any[] = searchData.items ?? [];
  const newItems = items.filter((item) => !seenIds.has(item.id.videoId));
  if (newItems.length === 0) return [];

  const videoIds = newItems.map((item) => item.id.videoId).join(",");
  const channelIds = [
    ...new Set(newItems.map((item) => item.snippet.channelId as string)),
  ].join(",");

  // 2. Fetch video details + channel subscriber counts in parallel
  const [videosData, channelsData] = await Promise.all([
    ytFetch("videos", { part: "statistics,contentDetails,snippet", id: videoIds }),
    ytFetch("channels", { part: "statistics", id: channelIds }),
  ]);

  const subscriberMap = new Map<string, number>();
  for (const ch of channelsData.items ?? []) {
    subscriberMap.set(ch.id, parseInt(ch.statistics.subscriberCount ?? "0"));
  }

  const detailsMap = new Map<string, any>();
  for (const v of videosData.items ?? []) {
    detailsMap.set(v.id, v);
  }

  const results: VideoMetadata[] = [];

  for (const item of newItems) {
    const videoId: string = item.id.videoId;
    const channelId: string = item.snippet.channelId;
    const subscriberCount = subscriberMap.get(channelId) ?? 0;

    // Filter out small channels
    if (subscriberCount < MIN_SUBSCRIBERS) continue;

    // Filter out non-English/Hebrew videos
    const details = detailsMap.get(videoId);
    const lang = details?.snippet?.defaultAudioLanguage ?? details?.snippet?.defaultLanguage;
    if (!isAllowedLanguage(lang)) continue;

    const viewCount = parseInt(details?.statistics?.viewCount ?? "0");
    const duration = formatDuration(details?.contentDetails?.duration ?? "PT0S");
    const thumbnail =
      item.snippet.thumbnails?.maxres?.url ??
      item.snippet.thumbnails?.high?.url ??
      item.snippet.thumbnails?.default?.url ??
      "";

    results.push({
      id: videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: thumbnail,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      duration,
      viewCount,
      subscriberCount,
    });
  }

  return results;
}
