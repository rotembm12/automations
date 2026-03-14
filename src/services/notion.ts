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
        rich_text: [{ text: { content: lead.companySize ?? "" } }],
      },
      Source: {
        rich_text: [{ text: { content: lead.source ?? "" } }],
      },
      Interest: {
        rich_text: [{ text: { content: lead.interest ?? "" } }],
      },
      Status: {
        status: { name: "New" },
      },
    },
  });

  return `https://notion.so/${response.id.replace(/-/g, "")}`;
}
