const MODEL = "gpt-oss-120b";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS = [1000, 3000]; // backoff: 1s, 3s

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate 3 commit message suggestions from the staged diff.
 * Uses dynamic import for Cerebras SDK (lazy-loaded, not at startup).
 *
 * @param {string} apiKey - Cerebras API key
 * @param {{ stat: string, diff: string }} diffData - Staged diff info
 * @param {string} recentLog - Recent commit history for style context
 * @returns {Promise<string[]>} Array of 3 commit messages
 */
export async function generateCommitMessages(apiKey, diffData, recentLog) {
  // Lazy-load SDK so --help / --version stay instant
  const { default: Cerebras } = await import("@cerebras/cerebras_cloud_sdk");

  const client = new Cerebras({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const systemPrompt = `You are an expert at writing concise, meaningful git commit messages following the Conventional Commits specification.

Rules:
- Use format: <type>(<optional scope>): <description>
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Description must be lowercase, imperative mood, no period at end
- Keep under 72 characters
- Be specific about what changed and why
- Return EXACTLY 3 commit messages, one per line, numbered 1-3
- Do NOT include any explanation, just the 3 numbered messages`;

  const userPrompt = buildUserPrompt(diffData, recentLog);

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: MODEL,
        temperature: 0.7,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || "";
      return parseMessages(content);
    } catch (err) {
      lastError = err;

      // Don't retry on auth errors or invalid requests
      if (err.status === 401 || err.status === 403 || err.status === 400) {
        throw err;
      }

      // Retry on transient errors (429, 500, 502, 503, timeouts)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError;
}

/**
 * Build the user prompt from diff data and recent log.
 * @param {{ stat: string, diff: string }} diffData
 * @param {string} recentLog
 * @returns {string}
 */
function buildUserPrompt(diffData, recentLog) {
  let prompt = `Here are the staged changes:\n\n--- Diff Stats ---\n${diffData.stat}\n\n--- Diff Details ---\n${diffData.diff}`;

  if (recentLog) {
    prompt += `\n\n--- Recent Commits (for style context) ---\n${recentLog}`;
  }

  prompt += "\n\nGenerate 3 commit messages for these changes:";
  return prompt;
}

/**
 * Parse the AI response into an array of 3 commit messages.
 * Handles multiple AI output formats robustly.
 * @param {string} raw
 * @returns {string[]}
 */
function parseMessages(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const messages = [];

  for (const line of lines) {
    // Strip numbered prefixes: "1. ", "1) ", "1- ", "1: ", etc.
    const cleaned = line.replace(/^\d+[\.\):\-]\s*/, "").trim();

    // Strip surrounding quotes if present
    const unquoted = cleaned.replace(/^["'`]+|["'`]+$/g, "");

    if (unquoted.length > 0 && unquoted.length < 200) {
      messages.push(unquoted);
    }

    // Stop once we have 3
    if (messages.length >= 3) break;
  }

  // Fallback if AI returned fewer than 3
  while (messages.length < 3) {
    messages.push("chore: update project files");
  }

  return messages.slice(0, 3);
}
