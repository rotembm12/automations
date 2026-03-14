jest.mock("../services/notion", () => ({
  createLeadCard: jest.fn(),
}));

jest.mock("../services/slack", () => ({
  postLeadAlert: jest.fn(),
}));

import request from "supertest";
import app from "../app";
import { createLeadCard } from "../services/notion";
import { postLeadAlert } from "../services/slack";

const mockCreateLeadCard = jest.mocked(createLeadCard);
const mockPostLeadAlert = jest.mocked(postLeadAlert);

const SECRET = "test-secret";

const validLead = {
  name: "John Doe",
  company: "Acme Corp",
  email: "john@acme.com",
  phone: "555-0100",
  jobTitle: "CEO",
  companySize: "50-100",
  source: "Website",
};

describe("GET /health", () => {
  it("returns 200 with { status: ok }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("POST /webhook/lead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_SECRET = SECRET;
    mockCreateLeadCard.mockResolvedValue("https://notion.so/page123");
    mockPostLeadAlert.mockResolvedValue(undefined);
  });

  describe("authentication", () => {
    it("returns 401 when x-webhook-secret header is missing", async () => {
      const res = await request(app).post("/webhook/lead").send(validLead);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("returns 401 when x-webhook-secret is incorrect", async () => {
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", "wrong-secret")
        .send(validLead);
      expect(res.status).toBe(401);
    });

    it("does not call downstream services on unauthorized requests", async () => {
      await request(app).post("/webhook/lead").send(validLead);
      expect(mockCreateLeadCard).not.toHaveBeenCalled();
      expect(mockPostLeadAlert).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send({ company: "Acme", email: "john@acme.com" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });

    it("returns 400 when company is missing", async () => {
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send({ name: "John", email: "john@acme.com" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when email is missing", async () => {
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send({ name: "John", company: "Acme" });
      expect(res.status).toBe(400);
    });
  });

  describe("happy path", () => {
    it("returns 200 with success and notionUrl", async () => {
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, notionUrl: "https://notion.so/page123" });
    });

    it("calls createLeadCard with the submitted lead data", async () => {
      await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      const lead = mockCreateLeadCard.mock.calls[0][0];
      expect(lead.name).toBe("John Doe");
      expect(lead.company).toBe("Acme Corp");
      expect(lead.email).toBe("john@acme.com");
      expect(lead.phone).toBe("555-0100");
      expect(lead.jobTitle).toBe("CEO");
    });

    it("calls postLeadAlert with the lead and notionUrl", async () => {
      await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      expect(mockPostLeadAlert).toHaveBeenCalledWith(
        expect.objectContaining({ name: "John Doe", email: "john@acme.com" }),
        "https://notion.so/page123"
      );
    });

    it("sets submittedAt to current time when not provided", async () => {
      const before = Date.now();
      await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      const after = Date.now();
      const lead = mockCreateLeadCard.mock.calls[0][0];
      const ts = new Date(lead.submittedAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("uses provided submittedAt when present", async () => {
      await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send({ ...validLead, submittedAt: "2024-06-01T12:00:00.000Z" });
      const lead = mockCreateLeadCard.mock.calls[0][0];
      expect(lead.submittedAt).toBe("2024-06-01T12:00:00.000Z");
    });
  });

  describe("error handling", () => {
    beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
    afterEach(() => jest.restoreAllMocks());

    it("returns 500 when createLeadCard throws", async () => {
      mockCreateLeadCard.mockRejectedValue(new Error("Notion unavailable"));
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("returns 500 when postLeadAlert throws", async () => {
      mockPostLeadAlert.mockRejectedValue(new Error("Slack unavailable"));
      const res = await request(app)
        .post("/webhook/lead")
        .set("x-webhook-secret", SECRET)
        .send(validLead);
      expect(res.status).toBe(500);
    });
  });
});
