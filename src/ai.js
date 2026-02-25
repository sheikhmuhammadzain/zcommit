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

  // Keep system prompt short and direct — reasoning models burn tokens on thinking.
  const systemPrompt =
    "Output exactly 3 git commit messages using conventional commits format (type(scope): description). " +
    "Lowercase, imperative mood, under 72 chars each. Numbered 1-3, one per line. Nothing else.";

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
        // Must be high enough for reasoning models that use internal thinking tokens.
        // gpt-oss-120b uses ~200-400 tokens for reasoning before outputting the answer.
        max_tokens: 2048,
      });

      const msg = response.choices[0]?.message;
      const content = msg?.content || "";

      // Try content first, then fall back to extracting from reasoning field
      let messages = parseMessages(content);
      if (messages.length < 3 && msg?.reasoning) {
        const fromReasoning = extractFromReasoning(msg.reasoning);
        // Fill missing slots from reasoning
        for (const m of fromReasoning) {
          if (messages.length >= 3) break;
          if (!messages.includes(m)) messages.push(m);
        }
      }

      if (messages.length === 0) {
        throw new Error("Could not parse commit messages from AI response.");
      }

      return messages.slice(0, 3);
    } catch (err) {
      lastError = err;

      // Don't retry on auth errors or invalid requests
      if (err.status === 401 || err.status === 403 || err.status === 400) {
        throw err;
      }

      // Retry on transient errors (429, 500, 502, 503, timeouts)
      if (attempt < MAX_RETRIES) {
        const retryAfter =
          err.response?.headers?.get?.("retry-after") ||
          err.headers?.["retry-after"];
        const retryMs = retryAfter
          ? Math.min(parseFloat(retryAfter) * 1000 || RETRY_DELAYS[attempt], 10_000)
          : RETRY_DELAYS[attempt];
        await sleep(retryMs);
      }
    }
  }

  throw lastError;
}

/**
 * Build the user prompt from diff data and recent log.
 * Kept concise to minimize reasoning token usage.
 * @param {{ stat: string, diff: string }} diffData
 * @param {string} recentLog
 * @returns {string}
 */
function buildUserPrompt(diffData, recentLog) {
  let prompt = `Diff stats:\n${diffData.stat}\n\nDiff:\n${diffData.diff}`;

  if (recentLog) {
    prompt += `\n\nRecent commits:\n${recentLog}`;
  }

  return prompt;
}

/**
 * Parse the AI response into commit messages.
 * Handles numbered lists, bullet points, bare lines, etc.
 * @param {string} raw
 * @returns {string[]}
 */
function parseMessages(raw) {
  if (!raw) return [];

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const messages = [];

  for (const line of lines) {
    // Strip numbered prefixes: "1. ", "1) ", "1- ", "1: ", "- ", "* "
    let cleaned = line
      .replace(/^\d+[\.\):\-]\s*/, "")
      .replace(/^[\-\*]\s+/, "")
      .trim();

    // Strip surrounding quotes
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, "");

    // Strip trailing whitespace artifacts like " \n" or multiple spaces
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Must look like a commit message (has a colon, reasonable length)
    if (cleaned.length > 5 && cleaned.length < 200 && cleaned.includes(":")) {
      messages.push(cleaned);
    }

    if (messages.length >= 3) break;
  }

  return messages;
}

/**
 * Extract commit messages from the reasoning field as a fallback.
 * Reasoning models sometimes draft messages in their thinking before
 * outputting a truncated response.
 * @param {string} reasoning
 * @returns {string[]}
 */
function extractFromReasoning(reasoning) {
  if (!reasoning) return [];

  const messages = [];

  // Look for numbered lines that contain conventional commit patterns
  const conventionalPattern = /\d+[\.\):\-]\s*(.+)/g;
  let match;

  while ((match = conventionalPattern.exec(reasoning)) !== null) {
    let candidate = match[1].trim();
    // Strip quotes
    candidate = candidate.replace(/^["'`]+|["'`]+$/g, "").trim();

    // Must have conventional commit format: type: or type(scope):
    if (/^(feat|fix|refactor|docs|style|test|chore|perf|ci|build)(\(.+?\))?:/.test(candidate)) {
      if (candidate.length > 5 && candidate.length < 200) {
        messages.push(candidate);
      }
    }

    if (messages.length >= 3) break;
  }

  return messages;
}
