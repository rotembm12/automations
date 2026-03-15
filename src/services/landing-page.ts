import Anthropic from "@anthropic-ai/sdk";
import { LocalBusiness } from "./google-places";
import { BizDetails } from "./biz-details";

const anthropic = new Anthropic();

export interface LandingPageData {
  name: string;
  address: string;
  phone?: string;
  types: string[];
  mapsUrl: string;
  rating?: number;
  totalRatings?: number;
}

export async function generateLandingPage(biz: LandingPageData, details: BizDetails): Promise<string> {
  const businessType = biz.types
    .slice(0, 3)
    .map((t) => t.replace(/_/g, " "))
    .join(", ") || "local business";

  const gallerySection = details.images.length > 0
    ? `6. Gallery — responsive CSS grid of these real photos (use as <img src> directly):
   ${details.images.join("\n   ")}
   Max 3 images. No placeholder images.`
    : "";

  const sourceContext = details.sources.length > 0
    ? `\nADDITIONAL CONTEXT FROM WEB:\n${details.sources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n")}`
    : "";

  const prompt = `You are a senior frontend developer and UI/UX designer at a top-tier web agency. Your job is to build a stunning single-file HTML landing page for a local business that has no website. This page will be shown to the business owner as a demo of what we can build for them — it must immediately impress.

BUSINESS INFORMATION:
- Name: ${biz.name}
- Type: ${businessType}
- Address: ${biz.address}
- Phone: ${biz.phone ?? "Not listed"}
- Rating: ${biz.rating ? `${biz.rating}/5 (${biz.totalRatings ?? 0} reviews)` : "Not available"}
- Google Maps: ${biz.mapsUrl}
${details.description ? `- Description: ${details.description}` : ""}
${sourceContext}

SECTIONS (in this order):
1. Navigation — sticky header, business name (left), 2 nav links (right: "About", "Contact"), adds backdrop-blur + shadow class via JS on scroll
2. Hero — full viewport height. ${details.images.length > 0 ? `Use the first gallery image as background with a dark overlay (rgba 0,0,0,0.5).` : `Use a rich CSS gradient background appropriate for this business type.`} Large, punchy headline (write a real tagline for this specific business — not generic). One-sentence subheadline. Solid CTA button "Get in Touch" that smooth-scrolls to #contact.
3. About — 2-3 sentences of real, warm copy based on the business type and description. Two-column layout (copy left, a styled accent box or stat cards right showing e.g. rating, years open, reviews).
4. Services — infer 3–4 services from business type. Card grid: each card has an inline SVG icon (simple, on-brand), a service name, and 1-sentence description.
5. Why Us — 3 differentiators (icon + bold label + 1-sentence copy). Horizontal row on desktop, stack on mobile.
${gallerySection}
7. Contact — business name as heading, address, phone as <a href="tel:..."> link, Google Maps link as a button. A simple styled contact form (name, phone, message fields — HTML/CSS only, no backend).
8. Footer — business name, short tagline, "© 2025 ${biz.name}. All rights reserved."

TYPOGRAPHY:
- Choose 2 Google Fonts that match the business vibe. Examples:
  • Restaurant/café: "Playfair Display" (headings) + "Lato" (body)
  • Salon/spa/beauty: "Cormorant Garamond" (headings) + "Nunito Sans" (body)
  • Hardware/trades: "Barlow Condensed" (headings) + "Barlow" (body)
  • Medical/professional: "Merriweather" (headings) + "Source Sans 3" (body)
  • Retail/fashion: "DM Serif Display" (headings) + "DM Sans" (body)
  • General/default: "Plus Jakarta Sans" (headings) + "Inter" (body)
- Import via Google Fonts @import at top of <style>

CSS DESIGN TOKENS (define in :root):
--primary        (main brand color — pick one intentional color for this business type)
--primary-dark   (10–15% darker variant for hover states)
--accent         (warm or cool complement — use sparingly)
--text           (#1a1a2e or similar dark)
--text-muted     (#6b7280)
--bg             (#ffffff or off-white)
--bg-soft        (very light tint of --primary at ~4% opacity, for section backgrounds)
--radius-sm: 6px
--radius: 12px
--radius-lg: 20px
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)
--shadow:    0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.05)
--shadow-lg: 0 20px 60px rgba(0,0,0,0.10)
--transition: 0.25s cubic-bezier(0.4,0,0.2,1)

LAYOUT & SPACING:
- Container: max-width 1200px, centered, padding 0 24px
- Section vertical padding: 96px top/bottom on desktop, 56px on mobile
- Hero h1: font-size clamp(2.8rem, 6vw, 4.5rem), font-weight 800
- Section h2: font-size clamp(1.8rem, 3.5vw, 2.75rem), font-weight 700
- Body: 1.125rem, line-height 1.7

COMPONENT RULES:
- Nav: height 70px, transition background on .scrolled class (white + shadow + blur)
- Buttons: height 52px, padding 0 32px, border-radius var(--radius-sm), font-weight 600, letter-spacing 0.01em, transition with transform: translateY(-1px) on hover
- Cards: background white, border-radius var(--radius), box-shadow var(--shadow), padding 32px, hover: box-shadow var(--shadow-lg) + translateY(-4px), transition var(--transition)
- Section headers: centered, --primary color for a small eyebrow label above the h2 (e.g., <span class="eyebrow">What We Offer</span>)

ANIMATIONS (JS — Intersection Observer, ~20 lines):
- Add class "visible" when element enters viewport
- Animate: opacity 0→1, transform translateY(32px)→translateY(0), duration 0.6s, ease-out
- Apply to: section headings, cards, about text blocks, contact items
- Stagger delay for card grids using nth-child

HARD RULES:
- NO Lorem Ipsum anywhere — every word must be real and relevant
- NO Bootstrap, Tailwind, or any external CSS framework
- NO external images except the provided URLs above (if any)
- NO garish multi-color gradients
- NO excessive drop shadows or neon colors
- Single HTML file: all CSS in <style>, all JS in <script> at body end
- Fully responsive: test breakpoints at 768px and 480px
- Form inputs: styled with border, focus ring using --primary color at 30% opacity

OUTPUT: Return ONLY the complete HTML document starting with <!DOCTYPE html>. No markdown code fences, no explanation before or after.`;

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 22000,
    messages: [{ role: "user", content: prompt }],
  });

  const message = await stream.finalMessage();
  const raw = (message.content[0] as Anthropic.TextBlock).text;

  // Strip accidental markdown fences
  return raw.replace(/^```html\s*/i, "").replace(/\s*```$/, "").trim();
}
