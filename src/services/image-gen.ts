import { fal } from "@fal-ai/client";

export async function generateBlogImage(video: {
  title: string;
  description: string;
}): Promise<string> {
  fal.config({ credentials: process.env.FAL_API_KEY });

  const prompt = buildPrompt(video.title, video.description);

  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: { prompt, image_size: "landscape_16_9" },
  });

  return (result.data as any).images[0].url;
}

function buildPrompt(title: string, description: string): string {
  const snippet = description.slice(0, 200).replace(/\n/g, " ").trim();
  return (
    `Professional tech blog cover image for an article titled "${title}". ` +
    (snippet ? `Topic context: ${snippet}. ` : "") +
    "Style: modern, clean, flat illustration. Vibrant accent colors on a dark background. " +
    "Abstract digital/AI theme with geometric shapes or circuit patterns. No text, no letters."
  );
}
