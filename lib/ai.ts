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

export async function classifyRequest(description: string): Promise<RequestClassification> {
  if (!description.trim()) {
    throw new ValidationError("Describe what you're looking for first.");
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
