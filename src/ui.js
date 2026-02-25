import { createInterface } from "node:readline";

// ─── Color support detection ─────────────────────────────────────────────────
// Respects NO_COLOR (https://no-color.org/), FORCE_COLOR, and dumb terminals.

const isTTY = process.stdout.isTTY === true;
const forceColor = "FORCE_COLOR" in process.env;
const noColor =
  "NO_COLOR" in process.env ||
  process.env.TERM === "dumb" ||
  (!isTTY && !forceColor);

const esc = (code) => (noColor ? "" : `\x1b[${code}m`);
const reset = esc(0);

function wrap(code) {
  return noColor ? (s) => s : (s) => `${esc(code)}${s}${reset}`;
}

export const c = {
  bold: wrap(1),
  dim: wrap(2),
  green: wrap(32),
  yellow: wrap(33),
  cyan: wrap(36),
  red: wrap(31),
};

// ─── Terminal safety helpers ─────────────────────────────────────────────────

/** Restore cursor visibility — safe to call multiple times. */
export function restoreCursor() {
  if (isTTY) {
    process.stdout.write("\x1b[?25h");
  }
}

/** Ensure stdin is properly cleaned up if it was in raw mode. */
export function restoreStdin() {
  try {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  } catch {
    // Already closed — safe to ignore
  }
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(text) {
  let i = 0;
  let interval;

  return {
    start() {
      if (!isTTY) {
        // Non-interactive: just print once
        process.stdout.write(`  ${text}\n`);
        return;
      }
      process.stdout.write("\x1b[?25l"); // hide cursor
      interval = setInterval(() => {
        const frame = c.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length]);
        process.stdout.write(`\r\x1b[K${frame} ${text}`);
        i++;
      }, 80);
    },
    stop(finalText) {
      if (!isTTY) {
        if (finalText) process.stdout.write(`${finalText}\n`);
        return;
      }
      clearInterval(interval);
      process.stdout.write("\r\x1b[K"); // clear line
      if (finalText) process.stdout.write(`${finalText}\n`);
      process.stdout.write("\x1b[?25h"); // show cursor
    },
  };
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

/**
 * Ask a simple text question.
 * @param {string} question
 * @returns {Promise<string>}
 */
export function ask(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ask a yes/no question.
 * @param {string} question
 * @returns {Promise<boolean>}
 */
export async function confirm(question) {
  const answer = await ask(`${question} ${c.dim("(y/n)")} `);
  return answer.toLowerCase().startsWith("y");
}

/**
 * Password-style input (masked).
 * @param {string} question
 * @returns {Promise<string>}
 */
export function askSecret(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Override _writeToOutput to mask input
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = function (str) {
      if (str.includes("\n") || str.includes("\r")) {
        originalWrite(str);
      } else {
        // Mask everything after the question text
        const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
        const qStripped = question.replace(/\x1b\[[0-9;]*m/g, "");
        if (stripped.length > qStripped.length) {
          originalWrite(question + "*".repeat(stripped.length - qStripped.length));
        } else {
          originalWrite(str);
        }
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      console.log();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive select menu — arrow keys to scroll, Enter to confirm.
 * Falls back to numbered input if not a TTY.
 *
 * @param {string} title
 * @param {string[]} choices
 * @returns {Promise<number>} Selected index
 */
export function select(title, choices) {
  // Non-TTY fallback: numbered list + text input
  if (!process.stdin.isTTY) {
    return selectFallback(title, choices);
  }

  return new Promise((resolve) => {
    let selected = 0;
    const totalLines = 1 + choices.length; // title + options
    let firstDraw = true;
    const out = process.stdout;

    function render() {
      if (!firstDraw) {
        out.write(`\x1b[${totalLines}A`);
      }
      firstDraw = false;

      out.write("\x1b[?25l"); // hide cursor

      // Title line
      out.write(`\x1b[2K${title}\n`);

      // Choice lines
      for (let i = 0; i < choices.length; i++) {
        const isActive = i === selected;
        const prefix = isActive ? c.cyan("❯") : " ";
        const text = isActive ? c.cyan(c.bold(choices[i])) : c.dim(choices[i]);
        out.write(`\x1b[2K  ${prefix} ${text}\n`);
      }

      out.write("\x1b[?25h"); // show cursor
    }

    out.write("\n");
    render();

    // Enable raw mode
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    function onKeypress(key) {
      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        restoreCursor();
        out.write("\n");
        process.exit(0);
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();

        // Final render with checkmark
        out.write(`\x1b[${totalLines}A`);
        out.write("\x1b[?25l");
        out.write(`\x1b[2K${title}\n`);

        for (let i = 0; i < choices.length; i++) {
          if (i === selected) {
            out.write(`\x1b[2K  ${c.green("✔")} ${c.bold(choices[i])}\n`);
          } else {
            out.write(`\x1b[2K    ${c.dim(choices[i])}\n`);
          }
        }

        out.write("\x1b[?25h");
        resolve(selected);
        return;
      }

      // Up arrow or k
      if (key === "\x1b[A" || key === "k") {
        selected = (selected - 1 + choices.length) % choices.length;
        render();
      }
      // Down arrow or j
      else if (key === "\x1b[B" || key === "j") {
        selected = (selected + 1) % choices.length;
        render();
      }
      // Number keys 1-9 for direct selection
      else if (key >= "1" && key <= String(choices.length)) {
        selected = parseInt(key, 10) - 1;
        render();
      }
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onKeypress);
    }

    process.stdin.on("data", onKeypress);
  });
}

/**
 * Fallback selection for non-TTY environments (piped input).
 * @param {string} title
 * @param {string[]} choices
 * @returns {Promise<number>}
 */
async function selectFallback(title, choices) {
  console.log(`\n${title}`);
  choices.forEach((choice, i) => {
    console.log(`  ${i + 1}) ${choice}`);
  });
  const answer = await ask(`  Enter choice (1-${choices.length}): `);
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < choices.length) return idx;
  return 0; // default to first
}

/**
 * Print the zcommit banner.
 */
export function banner() {
  console.log();
  console.log(
    c.bold(c.cyan("  ⚡ zcommit")) + c.dim(" — AI-powered git commits")
  );
  console.log(c.dim("  ─────────────────────────────────────────"));
  console.log(
    c.dim("  Created by ") +
      c.bold("Muhammad Zain") +
      c.dim(" · ") +
      c.cyan("zainafzal.dev")
  );
  console.log(
    c.dim("  Run ") +
      c.cyan("zcommit --help") +
      c.dim(" for all commands & flags")
  );
  console.log();
}
