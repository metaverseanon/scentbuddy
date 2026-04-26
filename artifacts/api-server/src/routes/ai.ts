import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const OPENAI_BASE_URL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] || "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] || "";

async function callOpenAI(messages: unknown[]): Promise<unknown> {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      messages,
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in AI response");
  return JSON.parse(content);
}

router.post("/ai/identify-fragrance", async (req, res) => {
  try {
    const { imageBase64 } = req.body as { imageBase64?: string };
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: 'Look at this image of a perfume bottle. Identify the perfume name and brand from any text, labels, or design you can see on the bottle. If you cannot identify a specific perfume, make your best guess based on what you see. Return a JSON object with fields: name (string), brand (string), confidence ("high"|"medium"|"low").',
          },
        ],
      },
    ];

    const result = await callOpenAI(messages);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Error identifying fragrance");
    res.status(500).json({ error: "Failed to identify fragrance" });
  }
});

router.get("/ai/social-trends", async (req, res) => {
  try {
    const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const messages = [
      {
        role: "user",
        content: `You are a fragrance industry expert. List the top 10 perfumes currently trending on social media platforms (TikTok, Instagram, Reddit, YouTube) in ${month}. Include viral fragrances, newly launched popular ones, and ones getting lots of attention from fragrance communities. For each perfume, specify which platform it's trending on most, why it's trending, and a hotness score from 1-5. Be specific and accurate with real perfume names and brands. Do NOT include any URLs. Return a JSON object with a "perfumes" array where each item has: name, brand, platform, reason, hotness (1-5 number).`,
      },
    ];

    const result = await callOpenAI(messages);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Error fetching social trends");
    res.status(500).json({ error: "Failed to fetch social trends" });
  }
});

export default router;
