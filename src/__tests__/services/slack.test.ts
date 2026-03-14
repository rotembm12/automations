const mockPostMessage = jest.fn();

jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

import { postLeadAlert } from "../../services/slack";
import { LeadFormSubmission } from "../../types";

const baseLead: LeadFormSubmission = {
  name: "Jane Smith",
  company: "TechCo",
  email: "jane@techco.com",
  submittedAt: "2024-01-01T00:00:00.000Z",
};

describe("postLeadAlert", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SLACK_CHANNEL = "#leads";
    mockPostMessage.mockResolvedValue({});
  });

  it("calls chat.postMessage once", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
  });

  it("posts to the configured SLACK_CHANNEL", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    expect(mockPostMessage.mock.calls[0][0].channel).toBe("#leads");
  });

  it("includes lead name and company in text", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    const text: string = mockPostMessage.mock.calls[0][0].text;
    expect(text).toContain("Jane Smith");
    expect(text).toContain("TechCo");
  });

  it("includes all lead fields in blocks", async () => {
    await postLeadAlert({ ...baseLead, phone: "555-0100", jobTitle: "CTO", companySize: "100+", source: "LinkedIn" }, "https://notion.so/page");
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const allText = JSON.stringify(blocks);
    expect(allText).toContain("555-0100");
    expect(allText).toContain("CTO");
    expect(allText).toContain("100+");
    expect(allText).toContain("LinkedIn");
  });

  it("links the Notion button to the notionUrl", async () => {
    await postLeadAlert(baseLead, "https://notion.so/mypage");
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const actionsBlock = blocks.find((b) => b.type === "actions");
    const notionBtn = actionsBlock.elements.find((e: any) => e.text.text === "Open in Notion");
    expect(notionBtn.url).toBe("https://notion.so/mypage");
  });

  it("links the email button to a mailto URL", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const actionsBlock = blocks.find((b) => b.type === "actions");
    const emailBtn = actionsBlock.elements.find((e: any) => e.text.text === "Send Email");
    expect(emailBtn.url).toBe("mailto:jane@techco.com");
  });

  it("includes interest block when interest is provided", async () => {
    await postLeadAlert({ ...baseLead, interest: "Cloud migration" }, "https://notion.so/page");
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const interestBlock = blocks.find((b) => b.text?.text?.includes("Interest"));
    expect(interestBlock).toBeDefined();
    expect(interestBlock.text.text).toContain("Cloud migration");
  });

  it("omits interest block when interest is not provided", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    const blocks: any[] = mockPostMessage.mock.calls[0][0].blocks;
    const interestBlock = blocks.find((b) => b.text?.text?.includes("Interest:"));
    expect(interestBlock).toBeUndefined();
  });

  it("shows dash for missing optional fields", async () => {
    await postLeadAlert(baseLead, "https://notion.so/page");
    const allText = JSON.stringify(mockPostMessage.mock.calls[0][0].blocks);
    expect(allText).toContain("—");
  });
});
