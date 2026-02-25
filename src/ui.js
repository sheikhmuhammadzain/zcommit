import { createInterface } from "node:readline";

// ─── Color helpers (no dependencies) ─────────────────────────────────────────

const esc = (code) => `\x1b[${code}m`;
const reset = esc(0);

export const c = {
  bold: (s) => `${esc(1)}${s}${reset}`,
  dim: (s) => `${esc(2)}${s}${reset}`,
  green: (s) => `${esc(32)}${s}${reset}`,
  yellow: (s) => `${esc(33)}${s}${reset}`,
  blue: (s) => `${esc(34)}${s}${reset}`,
  magenta: (s) => `${esc(35)}${s}${reset}`,
  cyan: (s) => `${esc(36)}${s}${reset}`,
  red: (s) => `${esc(31)}${s}${reset}`,
  bgBlue: (s) => `${esc(44)}${esc(37)}${esc(1)} ${s} ${reset}`,
  bgGreen: (s) => `${esc(42)}${esc(30)}${esc(1)} ${s} ${reset}`,
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(text) {
  let i = 0;
  let interval;

  return {
    start() {
      process.stdout.write("\x1b[?25l"); // hide cursor
      interval = setInterval(() => {
        const frame = c.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length]);
        process.stdout.write(`\r${frame} ${text}`);
        i++;
      }, 80);
    },
    stop(finalText) {
      clearInterval(interval);
      process.stdout.write(`\r\x1b[K`); // clear line
      if (finalText) process.stdout.write(`${finalText}\n`);
      process.stdout.write("\x1b[?25h"); // show cursor
    },
  };
}

// ─── Prompts (zero-dependency) ───────────────────────────────────────────────

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
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (str) {
      if (str.includes("\n") || str.includes("\r")) {
        originalWrite.call(rl, str);
      } else {
        // Only show the question, mask everything after
        const questionLen = question.length;
        if (str.length > questionLen) {
          originalWrite.call(rl, question + "*".repeat(str.length - questionLen));
        } else {
          originalWrite.call(rl, str);
        }
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      console.log(); // newline after masked input
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive select menu - user scrolls with arrow keys and presses Enter.
 * @param {string} title
 * @param {string[]} choices
 * @returns {Promise<number>} Selected index
 */
export function select(title, choices) {
  return new Promise((resolve) => {
    let selected = 0;

    function render() {
      // Move cursor up to re-render (clear previous render)
      if (render.drawn) {
        process.stdout.write(`\x1b[${choices.length + 1}A`);
      }

      console.log(`\n${title}`);
      choices.forEach((choice, i) => {
        const prefix = i === selected ? c.cyan("❯") : " ";
        const text = i === selected ? c.cyan(c.bold(choice)) : c.dim(choice);
        // Clear line before writing
        process.stdout.write(`\x1b[K  ${prefix} ${text}\n`);
      });
      render.drawn = true;
    }

    // Enable raw mode for arrow key detection
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    render();

    function onKeypress(key) {
      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        // Final render showing selection
        process.stdout.write(`\x1b[${choices.length + 1}A`);
        console.log(`\n${title}`);
        choices.forEach((choice, i) => {
          if (i === selected) {
            process.stdout.write(`\x1b[K  ${c.green("✔")} ${c.bold(choice)}\n`);
          } else {
            process.stdout.write(`\x1b[K  ${c.dim("  " + choice)}\n`);
          }
        });
        resolve(selected);
        return;
      }

      // Arrow keys come as escape sequences
      if (key === "\x1b[A" || key === "k") {
        // Up
        selected = (selected - 1 + choices.length) % choices.length;
        render();
      } else if (key === "\x1b[B" || key === "j") {
        // Down
        selected = (selected + 1) % choices.length;
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
 * Print the zcommit banner.
 */
export function banner() {
  console.log();
  console.log(
    c.bold(c.cyan("  ⚡ zcommit")) + c.dim(" — AI-powered git commits")
  );
  console.log(c.dim("  ─────────────────────────────────"));
  console.log();
}
