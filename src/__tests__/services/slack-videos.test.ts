const mockPostMessage = jest.fn();

jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

import { postVideoAlert } from "../../services/slack-videos";
import { VideoMetadata } from "../../types";

const baseVideo: VideoMetadata = {
  id: "abc123",
  title: "Claude Code Tutorial",
  description: "Learn how to use Claude Code effectively.",
  channelId: "channel1",
  channelTitle: "TechChannel",
  publishedAt: "2024-01-15T10:00:00.000Z",
  thumbnailUrl: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
  videoUrl: "https://www.youtube.com/watch?v=abc123",
  duration: "15:30",
  viewCount: 5000,
  subscriberCount: 50000,
};

describe("postVideoAlert", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SLACK_AI_VIDEOS_CHANNEL = "#ai-videos";
    mockPostMessage.mockResolvedValue({});
  });

  it("calls chat.postMessage once", async () => {
    await postVideoAlert(baseVideo);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
  });

  it("posts to the configured SLACK_AI_VIDEOS_CHANNEL", async () => {
    await postVideoAlert(baseVideo);
    expect(mockPostMessage.mock.calls[0][0].channel).toBe("#ai-videos");
  });

  it("includes video title in message text", async () => {
    await postVideoAlert(baseVideo);
    expect(mockPostMessage.mock.calls[0][0].text).toContain("Claude Code Tutorial");
  });

  it("disables link unfurling", async () => {
    await postVideoAlert(baseVideo);
    const msg = mockPostMessage.mock.calls[0][0];
    expect(msg.unfurl_links).toBe(false);
    expect(msg.unfurl_media).toBe(false);
  });

  describe("subscriber count formatting", () => {
    it("formats thousands as K (50.0K)", async () => {
      await postVideoAlert(baseVideo);
      const text = JSON.stringify(mockPostMessage.mock.calls[0][0].blocks);
      expect(text).toContain("50.0K subscribers");
    });

    it("formats millions as M (1.5M)", async () => {
      await postVideoAlert({ ...baseVideo, subscriberCount: 1_500_000 });
      const text = JSON.stringify(mockPostMessage.mock.calls[0][0].blocks);
      expect(text).toContain("1.5M subscribers");
    });

    it("shows exact number below 1000", async () => {
      await postVideoAlert({ ...baseVideo, subscriberCount: 999 });
      const text = JSON.stringify(mockPostMessage.mock.calls[0][0].blocks);
      expect(text).toContain("999 subscribers");
    });
  });

  describe("view count formatting", () => {
    it("formats view count in K", async () => {
      await postVideoAlert(baseVideo); // viewCount: 5000
      const text = JSON.stringify(mockPostMessage.mock.calls[0][0].blocks);
      expect(text).toContain("5.0K");
    });
  });

  it("includes thumbnail as image accessory", async () => {
    await postVideoAlert(baseVideo);
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const sectionWithImage = blocks.find((b) => b.accessory?.type === "image");
    expect(sectionWithImage).toBeDefined();
    expect(sectionWithImage.accessory.image_url).toBe(baseVideo.thumbnailUrl);
  });

  it("includes Watch on YouTube button linking to videoUrl", async () => {
    await postVideoAlert(baseVideo);
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const actionsBlock = blocks.find((b) => b.type === "actions");
    const btn = actionsBlock.elements[0];
    expect(btn.text.text).toBe("Watch on YouTube");
    expect(btn.url).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("includes Generate Blog button with action_id and video data as value", async () => {
    await postVideoAlert(baseVideo);
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const actionsBlock = blocks.find((b) => b.type === "actions");
    const btn = actionsBlock.elements.find((e: any) => e.action_id === "generate_blog");
    expect(btn).toBeDefined();
    expect(btn.text.text).toBe("Generate Blog");
    const value = JSON.parse(btn.value);
    expect(value.id).toBe("abc123");
    expect(value.title).toBe("Claude Code Tutorial");
    expect(value.channelTitle).toBe("TechChannel");
  });

  it("truncates description to 500 chars in the button value", async () => {
    const longDesc = "x".repeat(600);
    await postVideoAlert({ ...baseVideo, description: longDesc });
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const actionsBlock = blocks.find((b) => b.type === "actions");
    const btn = actionsBlock.elements.find((e: any) => e.action_id === "generate_blog");
    const value = JSON.parse(btn.value);
    expect(value.description.length).toBe(500);
  });

  it("truncates description longer than 200 chars and adds ellipsis", async () => {
    const longDesc = "x".repeat(250);
    await postVideoAlert({ ...baseVideo, description: longDesc });
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const descBlock = blocks.find((b) => b.text?.text?.includes("xxx"));
    expect(descBlock.text.text).toContain("…");
    // Should not exceed 200 chars of original content + ellipsis
    const rawContent = descBlock.text.text.replace(/^_|_$/g, "").replace("…", "");
    expect(rawContent.length).toBeLessThanOrEqual(200);
  });

  it("includes description block for non-empty descriptions", async () => {
    await postVideoAlert(baseVideo);
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const descBlock = blocks.find((b) => b.text?.text?.includes(baseVideo.description));
    expect(descBlock).toBeDefined();
  });
});
