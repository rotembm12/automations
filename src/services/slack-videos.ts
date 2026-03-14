import { WebClient } from "@slack/web-api";
import { VideoMetadata } from "../types";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function postVideoAlert(video: VideoMetadata): Promise<void> {
  const descriptionPreview =
    video.description.length > 200
      ? video.description.slice(0, 200) + "…"
      : video.description;

  await slack.chat.postMessage({
    channel: process.env.SLACK_AI_VIDEOS_CHANNEL ?? "#ai-videos",
    text: video.title,
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${video.videoUrl}|${video.title}>*\n${video.channelTitle}  •  ${formatCount(video.subscriberCount)} subscribers`,
        },
        accessory: {
          type: "image",
          image_url: video.thumbnailUrl,
          alt_text: video.title,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Published:*\n${formatDate(video.publishedAt)}` },
          { type: "mrkdwn", text: `*Duration:*\n${video.duration}` },
          { type: "mrkdwn", text: `*Views:*\n${formatCount(video.viewCount)}` },
        ],
      },
      ...(descriptionPreview
        ? [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: `_${descriptionPreview}_` },
            },
          ]
        : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Watch on YouTube" },
            url: video.videoUrl,
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Generate Blog" },
            action_id: "generate_blog",
            value: JSON.stringify({
              id: video.id,
              title: video.title,
              channelTitle: video.channelTitle,
              duration: video.duration,
              viewCount: video.viewCount,
              description: video.description.slice(0, 500),
            }),
          },
        ],
      },
      { type: "divider" },
    ],
  });
}
