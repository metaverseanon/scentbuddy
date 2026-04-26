const OPENAI_BASE_URL = process.env.EXPO_PUBLIC_OPENAI_BASE_URL || '';
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export async function generateObject<T>(params: {
  messages: Message[];
  schema: { parse: (v: unknown) => T };
  systemPrompt?: string;
}): Promise<T> {
  const messages: Message[] = [];
  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push(...params.messages);

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      messages: messages.map((m) => {
        if (typeof m.content === 'string') return m;
        return {
          role: m.role,
          content: m.content.map((c: any) => {
            if (c.type === 'image') {
              return {
                type: 'image_url',
                image_url: { url: c.image },
              };
            }
            return c;
          }),
        };
      }),
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in AI response');

  const parsed = JSON.parse(content);
  return params.schema.parse(parsed);
}
