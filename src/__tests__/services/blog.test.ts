const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { generateHebrewBlogPost } from "../../services/blog";

const mockVideo = {
  title: "Claude Code Tutorial",
  channelTitle: "TechChannel",
  duration: "15:30",
  viewCount: 5000,
  description: "Learn how to use Claude Code.",
};

describe("generateHebrewBlogPost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("calls anthropic.messages.create once", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "פוסט בלוג" }] });
    await generateHebrewBlogPost(mockVideo);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns the text from the response", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "פוסט בלוג בעברית" }] });
    const result = await generateHebrewBlogPost(mockVideo);
    expect(result).toBe("פוסט בלוג בעברית");
  });

  it("uses claude-sonnet-4-6 model", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "blog" }] });
    await generateHebrewBlogPost(mockVideo);
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });

  it("includes video metadata in the prompt", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "blog" }] });
    await generateHebrewBlogPost(mockVideo);
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Claude Code Tutorial");
    expect(prompt).toContain("TechChannel");
    expect(prompt).toContain("15:30");
  });

  it("returns empty string for non-text response", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "image" }] });
    const result = await generateHebrewBlogPost(mockVideo);
    expect(result).toBe("");
  });
});
