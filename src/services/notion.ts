import { Client } from "@notionhq/client";
import { LeadFormSubmission } from "../types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function createLeadCard(lead: LeadFormSubmission): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: process.env.NOTION_DATABASE_ID! },
    properties: {
      Name: {
        title: [{ text: { content: lead.name } }],
      },
      Company: {
        rich_text: [{ text: { content: lead.company } }],
      },
      Email: {
        email: lead.email,
      },
      Phone: {
        phone_number: lead.phone ?? null,
      },
      "Job Title": {
        rich_text: [{ text: { content: lead.jobTitle ?? "" } }],
      },
      "Company Size": {
        select: lead.companySize ? { name: lead.companySize } : null,
      },
      Source: {
        select: lead.source ? { name: lead.source } : null,
      },
      Interest: {
        rich_text: [{ text: { content: lead.interest ?? "" } }],
      },
      Status: {
        select: { name: "New" },
      },
      "Submitted At": {
        date: { start: lead.submittedAt },
      },
    },
  });

  return `https://notion.so/${response.id.replace(/-/g, "")}`;
}
