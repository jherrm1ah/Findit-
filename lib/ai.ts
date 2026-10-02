import { GoogleGenAI, Type } from "@google/genai";
import { listCategories } from "./categoryCatalog";
import { ValidationError } from "./repo";

// Server-only — never import this from a "use client" component. Turns a
// buyer's free-text description into a suggested title/category/budget so
// they don't have to know the exact product name or pick a category
// themselves. Replaces the old fake Photo/Voice/Link "attachment" buttons,
// which didn't actually do anything.

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ValidationError(
      "AI classification isn't configured yet (missing GEMINI_API_KEY). Get a key from " +
        "https://ai.google.dev and add it to .env.local."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export type RequestClassification = {
  title: string;
  category: string;
  categoryLabel: string;
  estimatedBudgetMin: number | null;
  estimatedBudgetMax: number | null;
};

const MAX_DESCRIPTION_INPUT_LENGTH = 2000;
const MAX_NAME_INPUT_LENGTH = 200;
const MAX_SHORT_FIELD_INPUT_LENGTH = 60;

export async function classifyRequest(description: string): Promise<RequestClassification> {
  if (!description.trim()) {
    throw new ValidationError("Describe what you're looking for first.");
  }
  // No length cap existed before this — every field sent to the AI API
  // gets billed per token, and the rate limiter above caps call COUNT, not
  // payload size, so an uncapped field is a real cost/abuse vector distinct
  // from the "flood the DB with text" gap already closed elsewhere.
  if (description.length > MAX_DESCRIPTION_INPUT_LENGTH) {
    throw new ValidationError(`Keep your description under ${MAX_DESCRIPTION_INPUT_LENGTH} characters.`);
  }

  const ai = getClient();
  // Live, admin-editable categories (lib/categoryCatalog.ts) — a category an
  // admin adds is usable by the classifier on the very next call, no deploy.
  const categories = await listCategories();
  if (categories.length === 0) {
    throw new ValidationError("No categories are configured yet — an admin needs to add at least one.");
  }
  const categoryKeys = categories.map((c) => c.id);
  const categoryLabels = new Map(categories.map((c) => [c.id, c.label]));
  const categoryList = categories.map((c) => `${c.id}: ${c.label}`).join("\n");

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        "A buyer on a Nigerian marketplace describes something they can't find. Turn their " +
        "description into a clean, short product title, the best-fit category, and (only if the " +
        "description gives you a real signal — brand, item type, typical market price — a rough " +
        "budget range in Naira; otherwise leave the budget fields null rather than guessing).\n\n" +
        `Categories (use the key, not the label):\n${categoryList}\n\n` +
        `Buyer's description: "${description.trim()}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A short, clean product title (max ~8 words)" },
            category: { type: Type.STRING, enum: categoryKeys },
            estimatedBudgetMin: { type: Type.NUMBER, nullable: true },
            estimatedBudgetMax: { type: Type.NUMBER, nullable: true },
          },
          required: ["title", "category"],
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message)) {
      throw new ValidationError("AI classification is rate-limited right now — try again in a moment.");
    }
    throw new ValidationError("Couldn't reach the AI classifier — try again.");
  }

  const text = response.text;
  if (!text) {
    throw new ValidationError("The AI classifier didn't return anything usable — try rephrasing.");
  }

  let parsed: {
    title?: unknown;
    category?: unknown;
    estimatedBudgetMin?: unknown;
    estimatedBudgetMax?: unknown;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("The AI classifier returned something unexpected — try again.");
  }

  const category = typeof parsed.category === "string" && categoryKeys.includes(parsed.category)
    ? parsed.category
    : categoryKeys[0];

  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : description.trim(),
    category,
    categoryLabel: categoryLabels.get(category) as string,
    estimatedBudgetMin: typeof parsed.estimatedBudgetMin === "number" ? parsed.estimatedBudgetMin : null,
    estimatedBudgetMax: typeof parsed.estimatedBudgetMax === "number" ? parsed.estimatedBudgetMax : null,
  };
}

// A seller's "Generate with AI" button on the listing form's Description
// field — a suggestion the seller edits or discards, never auto-submitted
// (same trust boundary as classifyRequest above: AI drafts, the seller
// decides). Given only what the seller has already entered, not invented
// details — the prompt is explicit about not claiming a condition, color
// or feature that wasn't supplied. Also asks for a sentence or two of
// generic how-to-use/care guidance (how this kind of product is normally
// used or maintained) — there's no separate "usage instructions" field
// anywhere in the schema, so this is the one place that guidance lives.
export async function generateProductDescription(input: {
  name: string;
  categoryLabel: string;
  condition?: string | null;
  color?: string | null;
  variation?: string | null;
}): Promise<string> {
  if (!input.name.trim()) {
    throw new ValidationError("Add a product name first.");
  }
  // Same reasoning as classifyRequest's cap above — every field here is
  // billed per token and rides straight into the prompt.
  if (input.name.length > MAX_NAME_INPUT_LENGTH) {
    throw new ValidationError(`Product name must be under ${MAX_NAME_INPUT_LENGTH} characters.`);
  }
  if (input.categoryLabel.length > MAX_NAME_INPUT_LENGTH) {
    throw new ValidationError(`Category must be under ${MAX_NAME_INPUT_LENGTH} characters.`);
  }
  if (input.condition != null && input.condition.length > MAX_SHORT_FIELD_INPUT_LENGTH) {
    throw new ValidationError(`Condition must be under ${MAX_SHORT_FIELD_INPUT_LENGTH} characters.`);
  }
  if (input.color != null && input.color.length > MAX_SHORT_FIELD_INPUT_LENGTH) {
    throw new ValidationError(`Color must be under ${MAX_SHORT_FIELD_INPUT_LENGTH} characters.`);
  }
  if (input.variation != null && input.variation.length > MAX_SHORT_FIELD_INPUT_LENGTH) {
    throw new ValidationError(`Size/variation must be under ${MAX_SHORT_FIELD_INPUT_LENGTH} characters.`);
  }

  const ai = getClient();
  const knownFacts = [
    `Category: ${input.categoryLabel}`,
    input.condition ? `Condition: ${input.condition}` : null,
    input.color ? `Color: ${input.color}` : null,
    input.variation ? `Size/variation: ${input.variation}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        "Write a short, honest product description (3-5 sentences) for a listing on a Nigerian " +
        "marketplace app, in a plain, trustworthy tone — no hype, no emoji, no claims the seller " +
        "didn't provide (never invent a brand, feature, condition, or specification not given " +
        "below). After describing the item itself, add one or two sentences of general how-to-use " +
        "or care guidance that's genuinely true for this kind of product (e.g. how it's typically " +
        "worn/applied/operated, or how to clean/store/maintain it) — keep this generic to the " +
        "product category, never inventing a model-specific instruction you weren't given.\n\n" +
        `Product name: "${input.name.trim()}"\n${knownFacts}`,
      config: { responseMimeType: "text/plain" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message)) {
      throw new ValidationError("AI generation is rate-limited right now — try again in a moment.");
    }
    throw new ValidationError("Couldn't reach the AI generator — try again.");
  }

  const text = response.text?.trim();
  if (!text) {
    throw new ValidationError("The AI generator didn't return anything usable — try again.");
  }
  return text;
}

// The search bar's camera button (Browse.jsx) — a buyer photographs
// something they want and this turns it into the same text+category filter
// typing would have produced, rather than any real image-similarity search
// (no vector index/embeddings exist in this schema — see FINDIT_FULL_AUDIT.md
// for that general class of gap). Deliberately returns an empty query
// instead of guessing when the photo doesn't clearly show a real item, same
// "don't invent a signal that isn't there" principle as classifyRequest's
// budget fields above.
export type VisualSearchResult = {
  query: string;
  category: string | null;
  categoryLabel: string | null;
};

export async function classifyProductPhoto(buffer: Buffer, mimeType: string): Promise<VisualSearchResult> {
  if (buffer.length === 0) {
    throw new ValidationError("That photo looks empty — try another.");
  }

  const ai = getClient();
  const categories = await listCategories();
  if (categories.length === 0) {
    throw new ValidationError("No categories are configured yet — an admin needs to add at least one.");
  }
  const categoryKeys = categories.map((c) => c.id);
  const categoryLabels = new Map(categories.map((c) => [c.id, c.label]));
  const categoryList = categories.map((c) => `${c.id}: ${c.label}`).join("\n");

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          text:
            "A buyer on a Nigerian marketplace app photographed something they want to find similar " +
            "listings for. Identify the main physical item shown and turn it into a short search phrase " +
            '(2-5 words, just the item itself — e.g. "wireless earbuds", "blue ceramic mug", "men\'s ' +
            'leather wallet") and, only if one clearly fits, the best-matching category (leave it null ' +
            "rather than guessing). If the photo doesn't clearly show a real, sellable item, return an " +
            "empty query rather than inventing one.\n\n" +
            `Categories (use the key, not the label):\n${categoryList}`,
        },
        { inlineData: { mimeType, data: buffer.toString("base64") } },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
            category: { type: Type.STRING, enum: categoryKeys, nullable: true },
          },
          required: ["query"],
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message)) {
      throw new ValidationError("Visual search is rate-limited right now — try again in a moment.");
    }
    throw new ValidationError("Couldn't read that photo — try again.");
  }

  const text = response.text;
  if (!text) {
    throw new ValidationError("Couldn't make sense of that photo — try a clearer shot.");
  }

  let parsed: { query?: unknown; category?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("Couldn't make sense of that photo — try again.");
  }

  const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
  if (!query) {
    throw new ValidationError("Couldn't recognize a product in that photo — try a clearer, closer shot.");
  }

  const category = typeof parsed.category === "string" && categoryKeys.includes(parsed.category) ? parsed.category : null;

  return {
    query,
    category,
    categoryLabel: category ? (categoryLabels.get(category) as string) : null,
  };
}
