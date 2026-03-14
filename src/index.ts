import "dotenv/config";
import express, { Request, Response } from "express";
import { createLeadCard } from "./services/notion";
import { postLeadAlert } from "./services/slack";
import { LeadFormSubmission } from "./types";

const app = express();
app.use(express.json());

app.post("/webhook/lead", async (req: Request, res: Response) => {
  // Validate shared secret to ensure requests come from your Google Apps Script
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const lead: LeadFormSubmission = {
    name: req.body.name,
    company: req.body.company,
    email: req.body.email,
    phone: req.body.phone,
    jobTitle: req.body.jobTitle,
    companySize: req.body.companySize,
    source: req.body.source,
    interest: req.body.interest,
    submittedAt: req.body.submittedAt ?? new Date().toISOString(),
  };

  if (!lead.name || !lead.company || !lead.email) {
    res.status(400).json({ error: "name, company, and email are required" });
    return;
  }

  try {
    const notionUrl = await createLeadCard(lead);
    await postLeadAlert(lead, notionUrl);
    console.log(`Lead created: ${lead.name} (${lead.company}) → ${notionUrl}`);
    res.status(200).json({ success: true, notionUrl });
  } catch (err) {
    console.error("Error processing lead:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
