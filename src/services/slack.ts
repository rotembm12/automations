import { WebClient } from "@slack/web-api";
import { LeadFormSubmission } from "../types";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function postLeadAlert(lead: LeadFormSubmission, notionUrl: string): Promise<void> {
  await slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL ?? "#leads",
    text: `New lead: ${lead.name} from ${lead.company}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🆕 New Lead Submitted",
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Name:*\n${lead.name}` },
          { type: "mrkdwn", text: `*Company:*\n${lead.company}` },
          { type: "mrkdwn", text: `*Email:*\n${lead.email}` },
          { type: "mrkdwn", text: `*Phone:*\n${lead.phone ?? "—"}` },
          { type: "mrkdwn", text: `*Job Title:*\n${lead.jobTitle ?? "—"}` },
          { type: "mrkdwn", text: `*Company Size:*\n${lead.companySize ?? "—"}` },
          { type: "mrkdwn", text: `*Source:*\n${lead.source ?? "—"}` },
        ],
      },
      ...(lead.interest
        ? [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: `*Interest:*\n${lead.interest}` },
            },
          ]
        : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open in Notion" },
            url: notionUrl,
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Send Email" },
            url: `mailto:${lead.email}`,
          },
        ],
      },
    ],
  });
}
