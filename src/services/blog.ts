import Anthropic from "@anthropic-ai/sdk";
import { VideoMetadata } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateHebrewBlogPost(video: Pick<VideoMetadata, "title" | "channelTitle" | "duration" | "viewCount" | "description">): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `כתוב פוסט בלוג מקיף בעברית על סרטון היוטיוב הבא:

כותרת: ${video.title}
ערוץ: ${video.channelTitle}
משך: ${video.duration}
צפיות: ${video.viewCount.toLocaleString()}
תיאור: ${video.description}

הפוסט צריך:
- להיות כתוב בעברית בלבד
- לכלול כותרת מושכת
- לסכם את הנושאים העיקריים בסרטון
- לכלול נקודות מפתח עם כותרות משנה
- להיות בין 400-600 מילים
- להתאים לקהל מפתחים ואנשי טכנולוגיה`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}
