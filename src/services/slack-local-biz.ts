import { WebClient } from "@slack/web-api";
import { LocalBusiness } from "./google-places";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export const LOCAL_BIZ_CHANNEL = process.env.SLACK_LOCAL_BIZ_CHANNEL ?? "#local-biz-opportunities";

function formatTypes(types: string[]): string {
  return types
    .slice(0, 3)
    .map((t) => t.replace(/_/g, " "))
    .join(", ");
}

function buildBusinessBlock(biz: LocalBusiness): any[] {
  const ratingText = biz.rating
    ? `⭐ ${biz.rating}${biz.totalRatings ? ` (${biz.totalRatings} reviews)` : ""}`
    : "No rating";
  const typeText = biz.types.length ? `_${formatTypes(biz.types)}_` : "";
  const phoneText = biz.phone ? `📞 ${biz.phone}` : "📞 No phone listed";
  const lines = [typeText, `📍 ${biz.address}`, phoneText, ratingText].filter(Boolean);

  const detailsValue = JSON.stringify({ name: biz.name, address: biz.address });
  const landingValue = JSON.stringify({
    name: biz.name,
    address: biz.address,
    phone: biz.phone,
    types: biz.types,
    mapsUrl: biz.mapsUrl,
    rating: biz.rating,
    totalRatings: biz.totalRatings,
  });

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${biz.mapsUrl}|${biz.name}>*\n${lines.join("  ·  ")}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔍 Get Details", emoji: true },
          action_id: "biz_details",
          value: detailsValue,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🌐 Build Landing Page", emoji: true },
          action_id: "biz_landing_page",
          value: landingValue,
          style: "primary",
        },
      ],
    },
  ];
}

export async function postLocalBizResults(
  channel: string,
  city: string,
  country: string,
  businesses: LocalBusiness[]
): Promise<void> {
  if (businesses.length === 0) {
    await slack.chat.postMessage({
      channel,
      text: `No businesses without a website found in ${city}, ${country}. Try a different city or broaden your search.`,
    });
    return;
  }

  const headerBlocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🌐 Website Opportunities — ${city}, ${country}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Found *${businesses.length}* local businesses with no website. Each is a potential web design / development client.`,
      },
    },
    { type: "divider" },
  ];

  // Slack limits blocks to 50 per message — batch if needed
  const BATCH_SIZE = 10;
  for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
    const batch = businesses.slice(i, i + BATCH_SIZE);

    // Interleave dividers between business blocks
    const interleaved: any[] = [];
    for (let j = 0; j < batch.length; j++) {
      interleaved.push(...buildBusinessBlock(batch[j]));
      if (j < batch.length - 1) interleaved.push({ type: "divider" });
    }

    const blocks = i === 0 ? [...headerBlocks, ...interleaved] : interleaved;

    await slack.chat.postMessage({
      channel,
      text: `Website opportunities in ${city}, ${country}`,
      blocks,
    });
  }
}
