import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

// Match the model used elsewhere in the project (claude-client.ts).
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Sonnet 4 pricing per 1K tokens (USD), as of mid-2024.
const PRICING = { input: 0.003, output: 0.015 };

// Word-count bounds for every generation. Caller-supplied wordCount is clamped
// into this range in buildSystemPrompt.
const MIN_WORDS = 500;
const MAX_WORDS = 800;

// Hero image dimensions (Open Graph standard 1200x630).
const HERO_IMAGE_WIDTH = 1200;
const HERO_IMAGE_HEIGHT = 630;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Niche contexts ─────────────────────────────────────────────────────────

interface NicheContext {
  label: string;
  industry: string;
  defaultAudience: string;
  defaultBrandVoice: string;
  contentStyle: string;
  keyTopics: string[];
}

const NICHE_CONTEXTS: Record<string, NicheContext> = {
  reputation_sites: {
    label: "Good Reputation Sites & Reviews",
    industry: "Reputation Management",
    defaultAudience: "Business owners, consumers, marketers researching reviews",
    defaultBrandVoice: "professional and balanced, ethical consultant",
    contentStyle: "Balanced perspective addressing both business and consumer viewpoints, platform-specific details, ethical practices only",
    keyTopics: ["Trustpilot", "Yelp", "Google Reviews", "BBB", "G2", "review response", "fake reviews", "reputation management"],
  },
  peptides: {
    label: "Peptides & Performance Enhancement",
    industry: "Health & Performance",
    defaultAudience: "Bodybuilders, biohackers, anti-aging seekers, researchers, medical professionals",
    defaultBrandVoice: "scientific yet accessible, evidence-based",
    contentStyle: "Scientific credibility with E-A-T compliance, reference actual studies, acknowledge limitations, never recommend suppliers",
    keyTopics: ["BPC-157", "TB-500", "peptide protocols", "growth hormone", "tissue repair", "clinical research"],
  },
  gambling: {
    label: "Gambling & Sports Betting",
    industry: "Sports Betting",
    defaultAudience: "Casual bettors to sharp players seeking statistical analysis",
    defaultBrandVoice: "analytical, data-driven, responsible",
    contentStyle: "Statistical analysis over hot takes, acknowledge most bettors lose, responsible gambling framework, real odds examples",
    keyTopics: ["closing line value", "expected value", "bankroll management", "line movement", "betting strategy", "+EV spots"],
  },
  apps_marketing: {
    label: "Apps Marketing & Reviews",
    industry: "Mobile Apps & Software",
    defaultAudience: "App users, productivity seekers, buyers researching software",
    defaultBrandVoice: "honest reviewer, practical and helpful",
    contentStyle: "Test apps when possible, mention limitations honestly, real pricing, platform differences (iOS vs Android)",
    keyTopics: ["app reviews", "productivity apps", "app comparison", "mobile software", "app features", "user experience"],
  },
  exclusive_models: {
    label: "Creator Platforms & OnlyFans Business",
    industry: "Creator Economy",
    defaultAudience: "Aspiring creators, current creators, business researchers",
    defaultBrandVoice: "professional business advisor, entrepreneurial consultant",
    contentStyle: "Business-first framing not explicit content, frame as entrepreneurship, real numbers on fees and earnings, respect creator autonomy",
    keyTopics: ["OnlyFans", "Fansly", "creator monetization", "content marketing", "subscriber retention", "creator business", "platform fees"],
  },
  ecom_nails: {
    label: "Nails & Beauty E-commerce",
    industry: "Beauty & Cosmetics",
    defaultAudience: "Beginners to experienced home manicurists, beauty enthusiasts",
    defaultBrandVoice: "practical and experienced, helpful beauty enthusiast",
    contentStyle: "Correct product terminology, reference actual brands with real prices, include timing, describe looks specifically",
    keyTopics: ["gel polish", "nail art", "chrome powder", "builder gel", "manicure techniques", "nail products", "nail trends"],
  },
  soccer_jersey: {
    label: "Soccer Jerseys & Fan Merchandise",
    industry: "Sports Merchandise",
    defaultAudience: "Passionate fans, collectors, parents, gift buyers",
    defaultBrandVoice: "knowledgeable fan perspective, experienced collector",
    contentStyle: "Distinguish authentic vs replica vs counterfeit, use proper terminology (kit, strip), sizing by manufacturer, authentication methods",
    keyTopics: ["authentic jerseys", "replica jerseys", "soccer kits", "jersey sizing", "fan merchandise", "jersey collecting", "team jerseys"],
  },
  payment_processing: {
    label: "Payment Processing & Fintech",
    industry: "Financial Technology",
    defaultAudience: "Business owners, financial decision-makers, developers, e-commerce operators",
    defaultBrandVoice: "business consultant, fintech expert, technical advisor",
    contentStyle: "Use correct terminology (interchange, acquirer, PSP), real fee structures, include hidden costs, compliance requirements",
    keyTopics: ["Stripe", "Square", "payment gateway", "transaction fees", "PCI compliance", "merchant account", "payment integration"],
  },
  web_dev: {
    label: "Web Development",
    industry: "Software Development",
    defaultAudience: "Beginners to experienced developers evaluating tools and approaches",
    defaultBrandVoice: "experienced developer, pragmatic engineer",
    contentStyle: "Use current web standards, reference actual versions (React 18, Node 20), address trade-offs honestly, explain why not just how",
    keyTopics: ["React", "Next.js", "JavaScript", "web performance", "frameworks", "frontend development", "backend development"],
  },
  app_dev: {
    label: "App Development",
    industry: "Mobile Development",
    defaultAudience: "Entrepreneurs, business stakeholders, developers evaluating platforms",
    defaultBrandVoice: "realistic consultant, mobile development expert",
    contentStyle: "Balance business and technical perspectives, honest cost ranges and timelines, include ongoing costs, post-launch reality",
    keyTopics: ["React Native", "Flutter", "iOS development", "Android development", "app costs", "mobile development", "cross-platform"],
  },
  construction: {
    label: "Construction & B2B Services",
    industry: "Construction",
    defaultAudience: "Contractors, subcontractors, construction business owners, project managers",
    defaultBrandVoice: "industry veteran, construction business consultant",
    contentStyle: "Use correct construction terminology (GC, sub, bid process), real cost ranges, regulatory requirements, regional differences",
    keyTopics: ["commercial construction", "bidding strategy", "project management", "subcontractors", "construction business", "permits"],
  },
  loans: {
    label: "Loans & Lending",
    industry: "Financial Services",
    defaultAudience: "Borrowers researching options, credit rebuilders, financial education seekers",
    defaultBrandVoice: "responsible financial advisor, consumer advocate",
    contentStyle: "Use correct financial terminology (APR, LTV, DTI), show total cost not just monthly payment, address predatory lending red flags",
    keyTopics: ["personal loans", "mortgage", "APR", "interest rates", "credit score", "loan qualification", "debt consolidation"],
  },
};

const DEFAULT_NICHE: NicheContext = {
  label: "General",
  industry: "General",
  defaultAudience: "general audience",
  defaultBrandVoice: "professional and informative",
  contentStyle: "clear and engaging",
  keyTopics: [],
};

export function getNicheContext(niche: string | null | undefined): NicheContext {
  if (!niche) return DEFAULT_NICHE;
  return NICHE_CONTEXTS[niche] ?? DEFAULT_NICHE;
}

export function getAvailableNiches(): Array<{ key: string; label: string }> {
  return Object.entries(NICHE_CONTEXTS).map(([key, ctx]) => ({ key, label: ctx.label }));
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type Tone = "professional" | "casual" | "friendly" | "authoritative" | "technical" | "warm";

export interface GenerateOptions {
  topic: string;
  keywords: string[];
  wordCount: number;
  tone: Tone;
  niche?: string | null;
  brandVoice?: string;
  targetAudience?: string;
  seoOptimized?: boolean;
}

export interface GeneratedContent {
  title: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  wordCount: number;
}

export interface AnalysisScores {
  seoScore: number;
  readabilityScore: number;
  brandVoiceScore: number;
}

export interface GenerationResult extends GeneratedContent, AnalysisScores {
  tokensUsed: number;
  costUsd: number;
  heroImageUrl?: string;
}

// ─── Claude wrapper ─────────────────────────────────────────────────────────

async function callClaude(
  system: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number; expectJson?: boolean } = {},
): Promise<{ text: string; tokens: number }> {
  const { maxTokens = 4000, temperature = 0.7, expectJson = false } = options;

  const finalSystem = expectJson
    ? `${system}\n\nIMPORTANT: Respond with valid JSON only. Start with { and end with }. No prose before or after.`
    : system;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: finalSystem,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  let text = block.text.trim();
  if (expectJson && !text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) text = text.substring(start, end + 1);
  }

  return {
    text,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function convertMarkdownToHtml(content: string): string {
  return content
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
}

function sanitizeMetadata(html: string): string {
  return html
    .replace(/<p>\s*Created:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*Niche:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*Keywords?:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*<em>Discover\s+.+?<\/em>\s*<\/p>/gi, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip any Claude-emitted image tags (they'd have placeholder or hallucinated
 * URLs that 404). We'll inject our own real hero image afterwards.
 */
function stripClaudeImages(html: string): string {
  return html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, "")
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<source\b[^>]*\/?>/gi, "")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Soft word-count enforcement: if Claude ignored the upper bound, trim down to
 * the last word that still fits within MAX_WORDS. We never pad shorts — that's
 * the prompt's job.
 */
function capWordCount(html: string, max: number): string {
  const words = html.split(/(\s+)/);
  let count = 0;
  let i = 0;
  for (; i < words.length; i++) {
    if (words[i].trim()) {
      count++;
      if (count > max) break;
    }
  }
  if (count <= max) return html;
  const truncated = words.slice(0, i).join("");
  const openTags = (truncated.match(/<p>/gi) || []).length;
  const closeTags = (truncated.match(/<\/p>/gi) || []).length;
  return openTags > closeTags ? truncated + "</p>" : truncated;
}

function countWordsInHtml(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter((w) => w.length > 0).length : 0;
}

function generateExcerpt(content: string): string {
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.substring(0, 157) + "..." : text;
}

/**
 * Deterministic seed from a string — same input always returns the same seed
 * so the same post gets the same hero image on regeneration.
 */
function seedFromString(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").slice(0, 12);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a hero-image URL using Lorem Picsum. Deterministic per-title via the
 * seed param, free, no API key, reliable. 1200x630 is the Open Graph default
 * and renders cleanly in both WordPress and Shopify themes.
 */
function buildHeroImageUrl(title: string): string {
  const seed = seedFromString(title);
  return `https://picsum.photos/seed/${seed}/${HERO_IMAGE_WIDTH}/${HERO_IMAGE_HEIGHT}`;
}

/**
 * Prepend a hero image figure to the article body. Uses WordPress's default
 * block-image class so it also looks right in the block editor.
 */
function injectHeroImage(html: string, title: string, altText: string): { html: string; url: string } {
  const url = buildHeroImageUrl(title);
  const alt = escapeHtmlAttr(altText || title);
  const figure =
    `<figure class="wp-block-image size-large">` +
    `<img src="${url}" alt="${alt}" ` +
    `width="${HERO_IMAGE_WIDTH}" height="${HERO_IMAGE_HEIGHT}" loading="lazy" />` +
    `</figure>`;
  return { html: `${figure}\n\n${html}`, url };
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function getNicheRequirements(niche: string): string {
  const requirements: Record<string, string> = {
    peptides: `Reference actual published studies. Use proper terminology with explanations. Cite dosage ranges from research, not anecdotes. Acknowledge limitations and unknowns. Distinguish between animal studies, human trials, and theoretical applications. Include medical disclaimers. Never recommend sources or suppliers. Be clear about regulatory status.`,
    gambling: `Use real odds examples and specific numbers. Reference statistical concepts accurately (EV, variance, ROI, CLV). Acknowledge most bettors lose long-term. Include responsible gambling framework naturally. Never promote betting as guaranteed income. Quantify when possible.`,
    web_dev: `Reference actual tools and versions (React 18, Node 20 LTS). Address real trade-offs. Include both happy path and common issues. Compare modern vs legacy approaches honestly. Mention browser compatibility when relevant.`,
    payment_processing: `Use correct terminology (interchange, acquirer, PSP, basis points). Cite actual fee structures with real numbers. Include hidden fees and contract terms. Address compliance requirements (PCI DSS). Acknowledge regional regulatory differences.`,
    loans: `Use correct financial terminology (APR, LTV, DTI). Show total cost of loan, not just monthly payment. Address predatory lending red flags. Include qualification requirements honestly. Distinguish between loan types and their implications.`,
    construction: `Use correct construction terminology (GC, sub, bid process). Include real cost ranges by project scale. Reference regulatory requirements (permits, OSHA, prevailing wage). Acknowledge regional differences. Address business-side concerns (cash flow, payment terms).`,
    reputation_sites: `Reference actual platforms (Trustpilot, Yelp, Google Reviews, BBB, G2). Address both business and consumer viewpoints. Never promote fake review services or manipulation. Distinguish authentic reviews from suspicious patterns. Focus on ethical response strategies.`,
    apps_marketing: `Include actual pricing and version numbers. Acknowledge platform differences (iOS vs Android). Mention real limitations and bugs honestly. Reference actual user feedback. Compare based on what people care about: speed, reliability, cost, privacy.`,
    exclusive_models: `Frame as creator entrepreneurship, not explicit content. Focus on marketing, monetization, branding. Include real platform fees and earnings ranges. Respect creator autonomy. Address platform risks honestly. Never overpromise income potential.`,
    ecom_nails: `Use correct product terminology (gel polish vs builder gel). Reference actual brands with real prices. Include timing (cure times, wear duration). Describe looks specifically with shade names and finish types. Address nail health honestly.`,
    soccer_jersey: `Distinguish authentic vs replica vs counterfeit. Reference actual manufacturers (Nike, Adidas, Puma). Use proper terminology (kit, strip, home/away/third). Address sizing by manufacturer. Never promote counterfeit sources.`,
    app_dev: `Distinguish native (Swift/Kotlin), cross-platform (React Native/Flutter), hybrid. Include realistic cost ranges and timelines. Cover iOS and Android considerations. Address ongoing costs (hosting, APIs, maintenance). Acknowledge market saturation.`,
  };
  return requirements[niche] || "";
}

function buildSystemPrompt(opts: GenerateOptions): string {
  const niche = getNicheContext(opts.niche);
  const brandVoice = opts.brandVoice || niche.defaultBrandVoice;
  const audience = opts.targetAudience || niche.defaultAudience;
  // Clamp the caller's requested word count into [MIN_WORDS, MAX_WORDS].
  const targetWords = Math.max(MIN_WORDS, Math.min(MAX_WORDS, opts.wordCount));

  let prompt = `You are an expert content writer in the ${niche.industry} space. Write a comprehensive, original article that reads like it was written by someone with deep first-hand experience.

VOICE & STYLE:
- Brand voice: ${brandVoice}
- Audience: ${audience}
- Tone: ${opts.tone}
- Style: ${niche.contentStyle}

QUALITY BAR:
- Specific over generic — exact prices, real brand/tool names, concrete numbers
- Show your reasoning, don't just assert
- Mix sentence lengths; avoid the AI cadence of perfect 3-4 sentence paragraphs
- Include trade-offs and limitations honestly, not just upsides
- No filler transitions like "Moreover," "Furthermore," "In conclusion"

WORD COUNT (HARD LIMITS):
- Minimum ${MIN_WORDS} words — anything shorter will be rejected
- Maximum ${MAX_WORDS} words — anything longer will be truncated
- Target approximately ${targetWords} words
- Depth over padding; trim ruthlessly before exceeding the cap

IMAGES:
- Do NOT include any <img>, <figure>, <picture>, or <figcaption> tags in your
  output. A hero image is injected automatically at the top of the article by
  the publishing system using the post title — any images you emit will be
  stripped to avoid broken links.

STRUCTURE:
- Open with a substantive hook (no "In today's world..." openings)
- Use <h2> for major sections, <h3> for subsections
- Lists where useful, not where padding
- Close with concrete takeaways, not platitudes

OUTPUT FORMAT:
Return ONLY valid JSON:
{
  "title": "Title under 60 characters with primary keyword",
  "content": "Full HTML article between ${MIN_WORDS} and ${MAX_WORDS} words",
  "excerpt": "150-160 character summary",
  "metaTitle": "SEO title under 60 characters",
  "metaDescription": "150-160 character meta description",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

The "content" field is HTML ONLY, using this whitelist of tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>. Do not include "Created:", "Niche:", or "Keywords:" labels inline in the body.`;

  const nicheReqs = opts.niche ? getNicheRequirements(opts.niche) : "";
  if (nicheReqs) {
    prompt += `\n\nNICHE-SPECIFIC REQUIREMENTS:\n${nicheReqs}`;
  }

  if (opts.seoOptimized) {
    prompt += `\n\nSEO REQUIREMENTS:
- Primary keyword in title and first 100 words
- Related keywords in <h2> subheadings
- Natural keyword density 1-2% (no stuffing)`;
  }

  return prompt;
}

function buildUserPrompt(opts: GenerateOptions): string {
  return `Write the article.

Topic: ${opts.topic}
Target keywords: ${opts.keywords.join(", ") || "(infer from topic)"}

Begin now. Return only the JSON object.`;
}

// ─── Topic ideation (used by cron auto-publish) ─────────────────────────────

export async function ideateTopic(
  niche: string | null | undefined,
  recentTitles: string[],
): Promise<{ topic: string; keywords: string[] }> {
  const ctx = getNicheContext(niche);
  const recentList = recentTitles.length
    ? recentTitles.slice(0, 20).map((t) => `- ${t}`).join("\n")
    : "(none yet)";

  const system = `You generate fresh blog post topic ideas for a ${ctx.industry} niche site (${ctx.label}). Suggest topics that:
- Cover the niche's key topics: ${ctx.keyTopics.join(", ")}
- Do NOT overlap with recent titles
- Have clear search intent
- Are specific (not generic listicles)

Return JSON only:
{ "topic": "Specific topic for the article", "keywords": ["kw1", "kw2", "kw3"] }`;

  const user = `Recent titles on this site (avoid duplicating these):
${recentList}

Suggest the next post's topic.`;

  const { text } = await callClaude(system, user, {
    maxTokens: 300,
    temperature: 0.9,
    expectJson: true,
  });

  try {
    const parsed = JSON.parse(text);
    return {
      topic: String(parsed.topic || "").slice(0, 500),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    };
  } catch {
    throw new Error(`Topic ideation returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Analysis (combined SEO/readability/brand voice) ────────────────────────

async function analyzeContent(
  content: string,
  title: string,
  opts: GenerateOptions,
): Promise<{ scores: AnalysisScores; tokens: number }> {
  const truncated = content.length > 3000 ? content.substring(0, 3000) + "..." : content;
  let totalTokens = 0;
  const scores: AnalysisScores = { seoScore: 60, readabilityScore: 65, brandVoiceScore: 65 };

  const system = `You evaluate written content on three dimensions and return numeric scores 1-100.

SEO SCORE (1-100):
- Primary keyword in title, first paragraph, headings
- Natural keyword density 1-3%
- Heading hierarchy and content structure
- Search intent alignment
- Title length under 60 chars; meta description 150-160 chars

READABILITY SCORE (1-100):
- Average sentence length under 20 words
- Sentence length variety
- Active voice
- Clear paragraph structure and transitions
- Vocabulary appropriate to audience

BRAND VOICE SCORE (1-100):
- Maintains specified tone throughout
- Word choice matches brand voice
- Audience appropriateness
- Authority level matches positioning

Return ONLY JSON: { "seoScore": number, "readabilityScore": number, "brandVoiceScore": number }`;

  const user = `Evaluate this content.

TITLE: ${title}
TARGET KEYWORDS: ${opts.keywords.join(", ")}
SPECIFIED TONE: ${opts.tone}
BRAND VOICE: ${opts.brandVoice || "(use tone)"}
TARGET AUDIENCE: ${opts.targetAudience || "general audience"}

CONTENT:
${truncated}`;

  try {
    const { text, tokens } = await callClaude(system, user, {
      maxTokens: 200,
      temperature: 0.1,
      expectJson: true,
    });
    totalTokens += tokens;
    const parsed = JSON.parse(text);
    if (typeof parsed.seoScore === "number") {
      scores.seoScore = Math.max(1, Math.min(100, Math.round(parsed.seoScore)));
    }
    if (typeof parsed.readabilityScore === "number") {
      scores.readabilityScore = Math.max(1, Math.min(100, Math.round(parsed.readabilityScore)));
    }
    if (typeof parsed.brandVoiceScore === "number") {
      scores.brandVoiceScore = Math.max(1, Math.min(100, Math.round(parsed.brandVoiceScore)));
    }
  } catch (err) {
    console.warn("Content analysis failed, using fallback scores:", err);
  }

  return { scores, tokens: totalTokens };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function generateContent(opts: GenerateOptions): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const system = buildSystemPrompt(opts);
  const user = buildUserPrompt(opts);

  // 1. Generate
  const { text, tokens: genTokens } = await callClaude(system, user, {
    maxTokens: 4000,
    temperature: 0.7,
    expectJson: true,
  });

  // 2. Parse
  let parsed: Partial<GeneratedContent>;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err instanceof Error ? err.message : "parse error"}`);
  }

  if (!parsed.title || !parsed.content) {
    throw new Error("Claude response missing required fields (title, content)");
  }

  // 3. Format + sanitize, strip any Claude-emitted images (they'd be broken),
  //    then enforce word count on the prose only (before image injection).
  let body = parsed.content;
  if (body.includes("#")) body = convertMarkdownToHtml(body);
  body = sanitizeMetadata(body);
  body = stripClaudeImages(body);
  body = capWordCount(body, MAX_WORDS);

  const wordCount = countWordsInHtml(body);
  if (wordCount < MIN_WORDS) {
    throw new Error(
      `Generated content is ${wordCount} words, below the ${MIN_WORDS}-word minimum`,
    );
  }

  // 4. Compute the hero image URL. We DO NOT inject it into the body — the
  //    caller (content-generation-actions) passes it to the platform client
  //    which uploads it as the featured image, so the WP theme renders it
  //    naturally above the content and doesn't duplicate.
  const heroImageUrl = buildHeroImageUrl(parsed.title);

  // 5. Analyze (single combined call)
  const { scores, tokens: analyzeTokens } = await analyzeContent(body, parsed.title, opts);
  const totalTokens = genTokens + analyzeTokens;
  // Rough cost estimate (we don't split input/output).
  const costUsd = (totalTokens / 1000) * ((PRICING.input + PRICING.output) / 2);

  return {
    title: parsed.title,
    content: body,
    excerpt: parsed.excerpt || generateExcerpt(body),
    metaTitle: parsed.metaTitle || parsed.title,
    metaDescription: parsed.metaDescription || generateExcerpt(body),
    keywords: parsed.keywords && parsed.keywords.length > 0 ? parsed.keywords : opts.keywords,
    wordCount,
    seoScore: scores.seoScore,
    readabilityScore: scores.readabilityScore,
    brandVoiceScore: scores.brandVoiceScore,
    tokensUsed: totalTokens,
    costUsd: Number(costUsd.toFixed(6)),
    heroImageUrl,
  };
}