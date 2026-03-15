import Anthropic from "@anthropic-ai/sdk";
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

const SYSTEM_PROMPT = `You are a world-class frontend developer and UI/UX designer with 15 years of experience at top agencies. Your websites win awards. You have deep mastery of:

- Visual design: color theory (60-30-10 rule), typographic hierarchy, whitespace, visual rhythm
- CSS: custom properties, Grid, Flexbox, clamp(), container queries, modern animations
- Copywriting: benefit-driven headlines, emotional triggers, social proof, strong CTAs
- UX: above-the-fold impact, trust signals, conversion patterns, mobile-first thinking

You never produce generic "template" output. Every design decision — font pairing, color palette, headline, CTA text — is made specifically for the business in front of you. You write copy that feels human and compelling, not like it came from a form.

When given a business to design for, you first think carefully about:
1. Who are their customers? What do they care about?
2. What emotion should the page evoke? (warmth, trust, excitement, prestige?)
3. What single action should a visitor take?
4. What visual language fits this business category?

Only then do you write code.`;

export async function generateLandingPage(biz: LandingPageData, details: BizDetails): Promise<string> {
  const businessType = biz.types
    .slice(0, 3)
    .map((t) => t.replace(/_/g, " "))
    .join(", ") || "local business";

  const hasImages = details.images.length > 0;
  const sourceContext = details.sources.length > 0
    ? `\nWEB RESEARCH:\n${details.sources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n")}`
    : "";

  const prompt = `Build a complete, single-file HTML landing page for this local business. This is a sales demo — the business owner has never had a website. It must be impressive enough that they say "I want this."

━━━ BUSINESS ━━━
Name: ${biz.name}
Type: ${businessType}
Address: ${biz.address}
Phone: ${biz.phone ?? "Not listed"}
Rating: ${biz.rating ? `${biz.rating}/5 (${biz.totalRatings ?? 0} reviews)` : "Not available"}
Maps: ${biz.mapsUrl}
${details.description ? `About: ${details.description}` : ""}
${hasImages ? `Real photos available:\n${details.images.map((u, i) => `  [${i + 1}] ${u}`).join("\n")}` : "No photos available — use gradient hero."}
${sourceContext}

━━━ DESIGN THINKING (apply before coding) ━━━
- Choose a color palette that fits the emotional register of this business type
  (e.g. greens/earth tones for food, deep navy/gold for professional services, warm terracotta for hospitality)
- Choose a Google Font pairing with strong personality contrast: one expressive display font for headings, one clean readable font for body
- Write the hero headline as a copywriter would — lead with the customer's desire or outcome, not the business name
- Every CTA should be specific (not "Submit" — use "Call Us Now", "Book a Table", "Get a Free Quote", etc.)

━━━ BILINGUAL REQUIREMENT (Hebrew + English) ━━━
The page MUST support both Hebrew (default) and English via a language toggle.

Implementation pattern:
1. <html lang="he" dir="rtl"> — Hebrew is the default
2. All visible text lives in a JS translations object:
   const t = {
     he: { nav_about: "אודות", nav_contact: "צור קשר", hero_title: "...", ... },
     en: { nav_about: "About",  nav_contact: "Contact",  hero_title: "...", ... }
   };
3. Every translatable element gets data-i18n="key" attribute
4. A setLang(lang) function loops over [data-i18n] elements, swaps text, and sets:
   document.documentElement.lang = lang
   document.documentElement.dir  = lang === "he" ? "rtl" : "ltr"
5. Language toggle button in the nav (right side on desktop). Shows "EN" when Hebrew active, "עב" when English active. Styled as a pill button with border.
6. Persist choice in localStorage.

Font rule: load BOTH a Hebrew-supporting font AND a Latin font.
- For Hebrew: use "Heebo" or "Rubik" (both support Hebrew + Latin well)
- Headings: Rubik (weight 700/800) | Body: Heebo (weight 400/500)
- This single pairing works beautifully for both languages — no font-switching needed.

RTL/LTR layout: use logical CSS properties where it helps (margin-inline-start, padding-inline-end, text-align: start) so the layout mirrors naturally on dir change. Flexbox row-reverse is NOT needed — logical properties handle it.

Write ALL content in both languages — every nav link, heading, paragraph, button, label, and placeholder. Hebrew copy should be native-quality, not a literal translation.

━━━ SECTIONS ━━━
1. NAV — sticky, 68px tall. Business name left (in current language). Nav links + lang toggle button right. On scroll: JS adds .scrolled → white bg + backdrop-filter:blur(16px) + subtle shadow. Nav links initially white, turn dark on .scrolled.

2. HERO — 100vh. ${hasImages ? `Hero image: ${details.images[0]} — cover, center. Overlay: linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%).` : "Full-bleed gradient background — pick 2-3 complementary colors, use a diagonal or radial gradient. No rainbows."}
   - h1: emotionally resonant tagline (not the business name). clamp(3rem,6vw,5rem), weight 800, white.
   - p: one-sentence value proposition, rgba(255,255,255,0.85), clamp(1.1rem,2vw,1.35rem).
   - CTA button: solid accent color, scrolls to #contact. Secondary ghost button linking to #about (optional).
   - Subtle scroll indicator arrow at bottom center.

3. ABOUT — two columns: left = copy (eyebrow label + h2 + 2-3 paragraphs written for this specific business), right = 2×2 grid of stat cards (use rating, review count, and 2 inferred stats like "Years Open", "Daily Customers").
   Stat cards: large bold number in --primary, label in muted text, subtle border, hover lift.

4. SERVICES — section with eyebrow + h2 + subtitle. 2×2 or 4-col card grid (pick based on count).
   Each card: inline SVG icon in a rounded icon box (bg: light primary tint), service name as h3, 1-2 sentence description. Cards lift on hover.
   Infer 3-4 realistic services from the business type — be specific.

5. WHY US — alternating or 3-col layout. 3 compelling differentiators with circle icon, bold label, copy.
   Make these genuinely persuasive — address real objections or desires for this business type.

${hasImages && details.images.length > 1 ? `6. GALLERY — CSS grid (3 cols desktop, 2 tablet, 1 mobile). Use images: ${details.images.join(", ")}. Each item: aspect-ratio 4/3, object-fit cover, border-radius, hover zoom (transform:scale(1.04) on img). Lightbox effect optional.` : ""}

7. CONTACT — two columns. Left: business name as h2, then contact details (address with map-pin SVG, phone with phone SVG as tel: link, maps link as styled button). Right: white card with form (name, phone, message — styled inputs, focus ring in primary color, submit button in primary). Form is visual only.

8. FOOTER — dark bg (--text or #111), business name in white, tagline, © 2025 ${biz.name}. All rights reserved.

━━━ CSS ARCHITECTURE ━━━
:root {
  --primary: [chosen color];
  --primary-dark: [10% darker];
  --accent: [complement — for CTAs];
  --text: #1a1a2e;
  --text-muted: #6b7280;
  --bg: #ffffff;
  --bg-soft: [primary at 4% opacity];
  --radius-sm: 6px;
  --radius: 14px;
  --radius-lg: 24px;
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow: 0 4px 20px rgba(0,0,0,0.08);
  --shadow-lg: 0 20px 60px rgba(0,0,0,0.12);
  --transition: 0.28s cubic-bezier(0.4,0,0.2,1);
  --font-heading: '[Display Font]', serif;
  --font-body: '[Body Font]', sans-serif;
}

━━━ MOTION & INTERACTION ━━━
Intersection Observer (20 lines max JS):
- Elements with .reveal: opacity:0, translateY(40px) initially
- On intersect: add .visible → opacity:1, translateY(0), transition 0.65s ease-out
- nth-child stagger: delay 0s, 0.1s, 0.2s, 0.3s on card grids
- Nav scroll class as above
- Smooth scroll: html { scroll-behavior: smooth }
- Button hover: translateY(-2px) + deeper shadow
- Card hover: translateY(-5px) + var(--shadow-lg)

━━━ RESPONSIVE ━━━
- Desktop: full layout as described
- Tablet (≤900px): 2-col grids → 1-col or 2-col reduced
- Mobile (≤480px): single column, reduced padding (section: 56px 0), smaller type

━━━ NON-NEGOTIABLE RULES ━━━
✗ No Lorem Ipsum — every word is written for this specific business
✗ No missing translations — every key in t.he must exist in t.en and vice versa
✗ Hebrew must be native-quality — not Google Translate word-for-word
✗ No Bootstrap, Tailwind, UIKit, or any CSS framework
✗ No external images other than the URLs provided above
✗ No childish clip-art SVGs — use clean, minimal line icons
✗ No rainbow gradients or neon colors
✗ No placeholder text like "Your business name here"
✗ The page must feel finished and shippable, not like a draft

OUTPUT: Return ONLY the complete HTML starting with <!DOCTYPE html>. Nothing before, nothing after.`;

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 30000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const message = await stream.finalMessage();

  // Extract only text blocks (skip thinking blocks)
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return raw.replace(/^```html\s*/i, "").replace(/\s*```$/, "").trim();
}
