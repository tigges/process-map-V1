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

OUTPUT FORMAT — use EXACTLY this structure:
- Top-level items are numbered (1. 2. 3.) — these become CATEGORY blocks on the overview map
- Sub-items start with "- " dash prefix and a [type] tag — these become STEPS within each category's flow chart
- Aim for 5-12 top-level categories maximum
- Aim for 3-10 sub-items per category maximum

AVAILABLE TYPE TAGS (required on every sub-item):
[action] — A task someone performs (agent action, player action, system action)
[decision] — A yes/no or conditional branch point (use for checks, conditions, "if/then")
[subprocess] — A group of related steps that deserves its own detailed flow chart
[start] — Entry point (use sparingly, only for explicit flow starts)
[end] — Resolution/completion point (use sparingly)

CRITICAL RULES:
1. REMOVE all non-process content: page numbers, headers, footers, table of contents, formatting artifacts, introductory paragraphs, repeated titles
2. SUMMARIZE verbose text into concise action labels (max 6-8 words per label)
3. Use "Label: Description" format — short label before colon, details after
4. Group related items under logical categories (e.g. Account, Financial, Verification, Bonuses, Security)
5. For decision points, include the condition as the label (end with ?)
6. Identify the ACTOR (Player/Agent/SM/System) and mention in description
7. Detect sequential flow: items that follow each other in a process should be ordered correctly
8. Items that are clearly junk (single numbers, formatting artifacts, empty content) should be OMITTED entirely

EXAMPLE OUTPUT:
1. Account Management: Player registration, login and profile changes
- [action] Format error: Agent guides player to correct form fields
- [decision] Duplicate email detected?: Check if existing account — Yes: recover / No: proceed
- [subprocess] Login issues: Password reset via self-service or agent-assisted process
- [action] Email change: Agent escalates to SM via Slack for verification
2. Deposits: Funding the player account
- [action] Pending under 2 hours: Agent confirms deduction, advises wait
- [decision] Missing deposit?: Over 2hrs or declined — Agent screenshots, escalates to finance
- [subprocess] Noda methods: Special 2-day wait before escalation

Now convert the following document. Output ONLY the formatted text, no explanations:`;

export function getManualPrompt(): string {
  return SYSTEM_PROMPT + '\n\n[PASTE YOUR DOCUMENT TEXT HERE]';
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
