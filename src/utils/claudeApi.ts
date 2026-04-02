const STORAGE_KEY = 'processmap-claude-api-key';
const MODEL = 'claude-haiku-4-5-20251001';

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

export function estimateCost(text: string): { tokens: number; cost: string } {
  const tokens = Math.ceil(text.length / 4);
  const inputCost = (tokens / 1_000_000) * 1.0;
  const outputCost = (tokens / 1_000_000) * 5.0;
  const total = inputCost + outputCost;
  return { tokens, cost: total < 0.01 ? '<$0.01' : `~$${total.toFixed(2)}` };
}

const SYSTEM_PROMPT = `You are a process map structuring assistant. Convert raw text into a clean hierarchical format for a flow chart import tool.

OUTPUT RULES:
- Top-level items: numbered (1. 2. 3.) — these become CATEGORY blocks
- Sub-items: start with "- " dash prefix and a [type] tag
- Aim for 5-12 top-level categories, 3-10 sub-items per category
- Tags: [action] [decision] [subprocess] [start] [end]
- Use "Label: Description" format with concise labels (max 6-8 words)
- Identify ACTOR (Player/Agent/SM/System) in descriptions
- REMOVE all non-process content, page numbers, headers, formatting
- OMIT junk items (single numbers, formatting artifacts)
- For decisions, end label with ?
- Output ONLY the formatted numbered list — absolutely NO explanations, NO preamble, NO commentary about the format, NO repeating of these instructions

EXAMPLE:
1. Account Management: Player registration and profile changes
- [action] Format error: Agent guides player to correct form fields
- [decision] Duplicate email?: Yes: recover account / No: proceed
- [subprocess] Login issues: Password reset via self-service or agent
2. Deposits: Funding the player account
- [action] Pending under 2 hours: Agent confirms deduction, advises wait
- [decision] Missing deposit?: Over 2hrs — Agent escalates to finance

IMPORTANT: Your response must start with "1." — do not include ANY text before the first numbered item.

Now convert this document:`;

export function getManualPrompt(): string {
  return `Copy this prompt into Claude, then paste your document after the line that says "PASTE DOCUMENT BELOW":

---
${SYSTEM_PROMPT}

--- PASTE DOCUMENT BELOW ---
[Replace this line with your document text]`;
}

export async function smartParse(text: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Claude API key not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = (err as Record<string, Record<string, string>>)?.error?.message || response.statusText;
    throw new Error(`Claude API error: ${msg}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const textBlock = data.content.find((c) => c.type === 'text');
  if (!textBlock) throw new Error('No text in Claude response');
  return textBlock.text;
}
