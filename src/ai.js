import Cerebras from "@cerebras/cerebras_cloud_sdk";

const MODEL = "gpt-oss-120b";

/**
 * Generate 3 commit message suggestions from the staged diff.
 * @param {string} apiKey - Cerebras API key
 * @param {{ stat: string, diff: string }} diffData - Staged diff info
 * @param {string} recentLog - Recent commit history for style context
 * @returns {Promise<string[]>} Array of 3 commit messages
 */
export async function generateCommitMessages(apiKey, diffData, recentLog) {
  const client = new Cerebras({ apiKey });

  const systemPrompt = `You are an expert at writing concise, meaningful git commit messages following the Conventional Commits specification.

Rules:
- Use format: <type>(<optional scope>): <description>
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Description must be lowercase, imperative mood, no period at end
- Keep under 72 characters
- Be specific about what changed and why
- Return EXACTLY 3 commit messages, one per line, numbered 1-3
- Do NOT include any explanation, just the 3 numbered messages`;

  const userPrompt = `Here are the staged changes:

--- Diff Stats ---
${diffData.stat}

--- Diff Details ---
${diffData.diff}

${recentLog ? `--- Recent Commits (for style context) ---\n${recentLog}` : ""}

Generate 3 commit messages for these changes:`;

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
}

/**
 * Parse the AI response into an array of 3 commit messages.
 * @param {string} raw
 * @returns {string[]}
 */
function parseMessages(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const messages = lines
    .map((line) => line.replace(/^\d+[\.\):\-]\s*/, "").trim())
    .filter((msg) => msg.length > 0 && msg.length < 200);

  // Ensure we always return exactly 3
  while (messages.length < 3) {
    messages.push("chore: update project files");
  }

  return messages.slice(0, 3);
}
