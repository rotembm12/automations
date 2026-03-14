const mockFetch = jest.fn();
global.fetch = mockFetch as any;

process.env.YOUTUBE_API_KEY = "test-api-key";

import { fetchNewClaudeCodeVideos } from "../../services/youtube";

// ---- helpers ----

function okJson(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

function errorResponse(status: number, body = "error") {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

function searchItem(videoId: string, channelId: string) {
  return {
    id: { videoId },
    snippet: {
      title: `Video ${videoId}`,
      description: "A description",
      channelId,
      channelTitle: `Channel ${channelId}`,
      publishedAt: "2024-01-15T10:00:00.000Z",
      thumbnails: {
        maxres: { url: "https://img.youtube.com/maxres.jpg" },
        high: { url: "https://img.youtube.com/high.jpg" },
      },
    },
  };
}

function videoDetail(videoId: string, duration = "PT10M0S", viewCount = "1000", lang?: string) {
  return {
    id: videoId,
    statistics: { viewCount },
    contentDetails: { duration },
    snippet: lang ? { defaultAudioLanguage: lang } : {},
  };
}

function channelDetail(channelId: string, subscriberCount: string) {
  return { id: channelId, statistics: { subscriberCount } };
}

// 3-call setup: search → videos+channels (parallel)
function setupFetchMocks(searchItems: any[], videoItems: any[], channelItems: any[]) {
  mockFetch
    .mockResolvedValueOnce(okJson({ items: searchItems }))
    .mockResolvedValueOnce(okJson({ items: videoItems }))
    .mockResolvedValueOnce(okJson({ items: channelItems }));
}

describe("fetchNewClaudeCodeVideos", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty array when YouTube returns no items", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ items: [] }));
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("filters out already-seen video IDs", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ items: [searchItem("vid1", "ch1")] }));
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set(["vid1"]));
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("filters out channels with fewer than 1000 subscribers", async () => {
    setupFetchMocks(
      [searchItem("vid1", "ch1")],
      [videoDetail("vid1")],
      [channelDetail("ch1", "999")]
    );
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toEqual([]);
  });

  it("includes videos from channels with exactly 1000 subscribers", async () => {
    setupFetchMocks(
      [searchItem("vid1", "ch1")],
      [videoDetail("vid1")],
      [channelDetail("ch1", "1000")]
    );
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });

  it("returns correct VideoMetadata for a qualifying video", async () => {
    setupFetchMocks(
      [searchItem("vid1", "ch1")],
      [videoDetail("vid1", "PT15M30S", "5000")],
      [channelDetail("ch1", "50000")]
    );
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "vid1",
      title: "Video vid1",
      channelId: "ch1",
      channelTitle: "Channel ch1",
      duration: "15:30",
      viewCount: 5000,
      subscriberCount: 50000,
      videoUrl: "https://www.youtube.com/watch?v=vid1",
      thumbnailUrl: "https://img.youtube.com/maxres.jpg",
    });
  });

  it("throws when YouTube API returns an error status", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, "Quota exceeded"));
    await expect(
      fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set())
    ).rejects.toThrow("YouTube API 403");
  });

  it("handles multiple videos, filtering by seen IDs and subscriber count", async () => {
    setupFetchMocks(
      [searchItem("vid1", "ch1"), searchItem("vid2", "ch2"), searchItem("vid3", "ch1")],
      [videoDetail("vid1"), videoDetail("vid3")], // vid2 was seen
      [channelDetail("ch1", "5000"), channelDetail("ch2", "500")]
    );
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set(["vid2"]));
    // vid2 filtered by seenIds, ch2 has <1000 subs but it was already filtered
    // vid1 and vid3 both from ch1 (5000 subs) should pass
    expect(result.map((v) => v.id)).toEqual(["vid1", "vid3"]);
  });

  it("uses maxres thumbnail when available, falls back to high", async () => {
    const itemWithoutMaxres = {
      id: { videoId: "vid1" },
      snippet: {
        title: "Video vid1",
        description: "desc",
        channelId: "ch1",
        channelTitle: "Channel ch1",
        publishedAt: "2024-01-15T10:00:00.000Z",
        thumbnails: { high: { url: "https://img.youtube.com/high.jpg" } },
      },
    };
    mockFetch
      .mockResolvedValueOnce(okJson({ items: [itemWithoutMaxres] }))
      .mockResolvedValueOnce(okJson({ items: [videoDetail("vid1")] }))
      .mockResolvedValueOnce(okJson({ items: [channelDetail("ch1", "5000")] }));
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result[0].thumbnailUrl).toBe("https://img.youtube.com/high.jpg");
  });
});

describe("language filtering", () => {
  beforeEach(() => jest.clearAllMocks());

  it("includes English videos (en)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1", "PT5M", "100", "en")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });

  it("includes English videos with region tag (en-US)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1", "PT5M", "100", "en-US")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });

  it("includes Hebrew videos (he)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1", "PT5M", "100", "he")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });

  it("includes Hebrew videos with legacy code (iw)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1", "PT5M", "100", "iw")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });

  it("excludes videos in other languages (es, fr, de...)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1", "PT5M", "100", "es")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(0);
  });

  it("includes videos with no language set (assume English)", async () => {
    setupFetchMocks([searchItem("vid1", "ch1")], [videoDetail("vid1")], [channelDetail("ch1", "5000")]);
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    expect(result).toHaveLength(1);
  });
});

describe("formatDuration (via fetchNewClaudeCodeVideos)", () => {
  beforeEach(() => jest.clearAllMocks());

  async function getDuration(isoDuration: string): Promise<string> {
    setupFetchMocks(
      [searchItem("vid1", "ch1")],
      [videoDetail("vid1", isoDuration)],
      [channelDetail("ch1", "5000")]
    );
    const result = await fetchNewClaudeCodeVideos("2024-01-01T00:00:00.000Z", new Set());
    return result[0].duration;
  }

  it("formats PT1H30M45S as 1:30:45", async () => {
    expect(await getDuration("PT1H30M45S")).toBe("1:30:45");
  });

  it("formats PT15M30S as 15:30", async () => {
    expect(await getDuration("PT15M30S")).toBe("15:30");
  });

  it("formats PT5M3S as 5:03 (zero-pads seconds)", async () => {
    expect(await getDuration("PT5M3S")).toBe("5:03");
  });

  it("formats PT45S as 0:45 (seconds only)", async () => {
    expect(await getDuration("PT45S")).toBe("0:45");
  });

  it("formats PT1H0M0S as 1:00:00", async () => {
    expect(await getDuration("PT1H0M0S")).toBe("1:00:00");
  });
});
