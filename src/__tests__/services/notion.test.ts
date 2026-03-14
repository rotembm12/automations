const mockCreate = jest.fn();

jest.mock("@notionhq/client", () => ({
  Client: jest.fn().mockImplementation(() => ({
    pages: { create: mockCreate },
  })),
}));

import { createLeadCard } from "../../services/notion";
import { LeadFormSubmission } from "../../types";

const baseLead: LeadFormSubmission = {
  name: "John Doe",
  company: "Acme Corp",
  email: "john@acme.com",
  submittedAt: "2024-01-01T00:00:00.000Z",
};

describe("createLeadCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTION_DATABASE_ID = "test-db-id";
  });

  it("calls notion.pages.create once", async () => {
    mockCreate.mockResolvedValue({ id: "abc-123" });
    await createLeadCard(baseLead);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns a notion URL with dashes stripped from the page ID", async () => {
    mockCreate.mockResolvedValue({ id: "abc-123-def-456" });
    const url = await createLeadCard(baseLead);
    expect(url).toBe("https://notion.so/abc123def456");
  });

  it("passes required fields to Notion", async () => {
    mockCreate.mockResolvedValue({ id: "test-id" });
    await createLeadCard(baseLead);
    const props = mockCreate.mock.calls[0][0].properties;
    expect(props.Name.title[0].text.content).toBe("John Doe");
    expect(props.Company.rich_text[0].text.content).toBe("Acme Corp");
    expect(props.Email.email).toBe("john@acme.com");
    expect(props.Status.status.name).toBe("New");
  });

  it("passes optional fields when provided", async () => {
    mockCreate.mockResolvedValue({ id: "test-id" });
    await createLeadCard({ ...baseLead, phone: "555-0100", jobTitle: "CEO", companySize: "50-100", source: "Website", interest: "Cloud" });
    const props = mockCreate.mock.calls[0][0].properties;
    expect(props.Phone.phone_number).toBe("555-0100");
    expect(props["Job Title"].rich_text[0].text.content).toBe("CEO");
    expect(props["Company Size"].rich_text[0].text.content).toBe("50-100");
    expect(props.Source.rich_text[0].text.content).toBe("Website");
    expect(props.Interest.rich_text[0].text.content).toBe("Cloud");
  });

  it("passes null for phone when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "test-id" });
    await createLeadCard(baseLead);
    const props = mockCreate.mock.calls[0][0].properties;
    expect(props.Phone.phone_number).toBeNull();
  });

  it("uses the correct database_id from env", async () => {
    mockCreate.mockResolvedValue({ id: "test-id" });
    await createLeadCard(baseLead);
    expect(mockCreate.mock.calls[0][0].parent.database_id).toBe("test-db-id");
  });
});
