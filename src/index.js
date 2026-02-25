#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Load version from package.json (fast, sync) ────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

// ─── Fast-exit paths (no heavy imports needed) ──────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("-")));
const positional = args.filter((a) => !a.startsWith("-"));

if (flags.has("--help") || flags.has("-h")) {
  const { printHelp } = await import("./help.js");
  printHelp(pkg.version);
  process.exit(0);
}

if (flags.has("--version") || flags.has("-v")) {
  console.log(`zcommit v${pkg.version}`);
  process.exit(0);
}

// ─── Full imports (only loaded when actually running) ────────────────────────

import {
  isGitRepo,
  getStatus,
  hasStagedChanges,
  getConflictState,
  stageAll,
  stageFiles,
  getStagedDiff,
  getStagedDiffForNewRepo,
  getRecentLog,
  commit,
  getCurrentBranch,
} from "./git.js";
import { generateCommitMessages } from "./ai.js";
import { getApiKey, setApiKey, deleteApiKey, getConfigPath } from "./config.js";
import {
  banner,
  c,
  ask,
  askSecret,
  confirm,
  select,
  createSpinner,
  restoreCursor,
  restoreStdin,
} from "./ui.js";

// ─── Graceful shutdown — always restore terminal state ──────────────────────

function cleanup() {
  restoreCursor();
  restoreStdin();
}

process.on("SIGINT", () => {
  cleanup();
  console.log(c.dim("\n  Interrupted.\n"));
  process.exit(130);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

process.on("uncaughtException", (err) => {
  cleanup();
  console.error(c.red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  cleanup();
  console.error(c.red(`\n  Unhandled error: ${err?.message || err}\n`));
  process.exit(1);
});

// ─── Parse flags ─────────────────────────────────────────────────────────────

const flagAll = flags.has("--all") || flags.has("-a");

// ─── Route subcommands ──────────────────────────────────────────────────────

if (positional[0] === "config") {
  await runConfig();
  process.exit(0);
}

// ─── Main flow ──────────────────────────────────────────────────────────────

await main();

async function main() {
  banner();

  // ── Step 1: Verify git repo ──────────────────────────────────────────────
  if (!isGitRepo()) {
    console.log(c.red("  ✖ Not a git repository."));
    console.log(c.dim("  Run this command inside a git project.\n"));
    process.exit(1);
  }

  // ── Step 2: Check for conflict state ─────────────────────────────────────
  const conflict = getConflictState();
  if (conflict) {
    console.log(c.red(`  ✖ A ${conflict} is in progress.`));
    console.log(c.dim(`  Resolve the ${conflict} before committing.\n`));
    process.exit(1);
  }

  const branch = getCurrentBranch();
  console.log(c.dim(`  Branch: ${c.bold(branch)}`));

  // ── Step 3: Check for API key ────────────────────────────────────────────
  let apiKey = getApiKey();
  if (!apiKey) {
    console.log(c.yellow("  ⚠ No Cerebras API key found.\n"));
    console.log(
      c.dim("  Get a free key at: ") + c.cyan("https://cloud.cerebras.ai")
    );
    console.log();
    apiKey = await askSecret(c.bold("  Enter your Cerebras API key: "));
    if (!apiKey) {
      console.log(c.red("\n  ✖ API key is required.\n"));
      process.exit(1);
    }
    const shouldSave = await confirm(c.dim("  Save key for future use?"));
    if (shouldSave) {
      setApiKey(apiKey);
      console.log(c.green("  ✔ Key saved to ~/.zcommit/config.json\n"));
    }
    console.log();
  }

  // ── Step 4: Gather status ────────────────────────────────────────────────
  const status = getStatus();
  const { staged, unstaged, untracked, all } = status;
  const hasAnything = all.length > 0;
  // Use git diff --cached as the source of truth for staged changes
  const alreadyStaged = hasStagedChanges();

  if (!hasAnything && !alreadyStaged) {
    console.log(c.yellow("  ⚠ No changes detected. Nothing to commit.\n"));
    process.exit(0);
  }

  // ── Step 5: Staging ──────────────────────────────────────────────────────
  if (alreadyStaged) {
    // Already have staged changes — show what's staged
    console.log(c.dim("  Using already-staged changes:"));
    for (const f of staged) {
      const icon = f.status === "A" ? c.green("+") : c.yellow("~");
      console.log(`    ${icon} ${f.file}`);
    }

    // Warn if there are also unstaged changes not included
    const notStaged = unstaged.length + untracked.length;
    if (notStaged > 0) {
      console.log(
        c.dim(`\n  Note: ${notStaged} other changed file(s) not staged.`)
      );
    }
    console.log();
  } else {
    // Nothing staged — need to stage something
    const changedFiles = [...unstaged.map((f) => f.file), ...untracked.map((f) => f.file)];

    if (changedFiles.length === 0) {
      console.log(c.yellow("  ⚠ No changes to stage.\n"));
      process.exit(0);
    }

    console.log(c.bold("  Changed files:"));
    for (const item of all) {
      const isNew = item.xy.startsWith("?");
      const icon = isNew ? c.green("+ new") : c.yellow("~  mod");
      console.log(`    ${icon}  ${item.file}`);
    }
    console.log();

    if (flagAll) {
      stageAll();
      console.log(c.green("  ✔ All changes staged.\n"));
    } else {
      const stageChoice = await select(
        c.bold("  How would you like to stage?"),
        ["Stage all changes  (git add .)", "Select specific files"]
      );

      if (stageChoice === 0) {
        stageAll();
        console.log(c.green("\n  ✔ All changes staged.\n"));
      } else {
        const fileInput = await ask(
          c.bold("  Enter file paths ") +
            c.dim("(space-separated)") +
            c.bold(": ")
        );
        const selectedFiles = fileInput
          .split(/\s+/)
          .filter(Boolean)
          .filter((f) => {
            const exists = changedFiles.some((sf) => sf.includes(f));
            if (!exists) {
              console.log(
                c.yellow(`  ⚠ '${f}' not in changed files, skipping.`)
              );
            }
            return exists;
          });

        if (selectedFiles.length === 0) {
          console.log(c.red("\n  ✖ No valid files selected.\n"));
          process.exit(1);
        }

        stageFiles(selectedFiles);
        console.log(
          c.green(`\n  ✔ Staged ${selectedFiles.length} file(s).\n`)
        );
      }
    }

    // Verify staging actually worked
    if (!hasStagedChanges()) {
      console.log(c.red("  ✖ Staging failed — no changes in index.\n"));
      process.exit(1);
    }
  }

  // ── Step 6: Get diff for AI ──────────────────────────────────────────────
  let diffData = getStagedDiff();

  // Fallback for initial commits (no HEAD to diff against)
  if (!diffData.diff) {
    diffData = getStagedDiffForNewRepo();
  }

  if (!diffData.diff) {
    console.log(c.red("  ✖ Could not read staged changes."));
    console.log(c.dim("  Try running: git diff --cached\n"));
    process.exit(1);
  }

  const recentLog = getRecentLog();

  // ── Step 7: Generate commit messages ─────────────────────────────────────
  const spinner = createSpinner(
    c.bold("Generating commit messages with AI...")
  );
  spinner.start();

  let messages;
  try {
    messages = await generateCommitMessages(apiKey, diffData, recentLog);
    spinner.stop(c.green("  ✔ Generated 3 commit message suggestions.\n"));
  } catch (err) {
    spinner.stop(c.red("  ✖ Failed to generate messages."));

    if (err.status === 401 || err.status === 403) {
      console.log(
        c.red("  Invalid API key. Run ") +
          c.bold("zcommit config") +
          c.red(" to update.\n")
      );
    } else if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      console.log(
        c.red("  Network error. Check your internet connection.\n")
      );
    } else if (err.status === 429) {
      console.log(
        c.red("  Rate limited. Please wait a moment and try again.\n")
      );
    } else {
      console.log(c.red(`  Error: ${err.message}\n`));
    }
    process.exit(1);
  }

  // ── Step 8: Pick a message and commit ────────────────────────────────────
  const choice = await select(c.bold("  Pick a commit message:"), messages);
  const selectedMessage = messages[choice];

  // ── Step 9: Commit (selecting a message IS the confirmation) ────────────
  try {
    commit(selectedMessage);
    console.log(c.green(`\n  ✔ Committed successfully!`));
    console.log(c.dim(`  Message: "${selectedMessage}"\n`));
  } catch (err) {
    console.log(c.red(`\n  ✖ Commit failed: ${err.message}\n`));
    process.exit(1);
  }
}

// ─── Config subcommand ──────────────────────────────────────────────────────

async function runConfig() {
  banner();
  console.log(c.bold("  Configure zcommit\n"));

  const currentKey = getApiKey();
  const envKey = process.env.CEREBRAS_API_KEY;

  if (envKey) {
    const masked = envKey.slice(0, 8) + "..." + envKey.slice(-4);
    console.log(
      c.dim(`  Active key: ${masked} (from CEREBRAS_API_KEY env var)`)
    );
  } else if (currentKey) {
    const masked = currentKey.slice(0, 8) + "..." + currentKey.slice(-4);
    console.log(
      c.dim(`  Active key: ${masked} (from ~/.zcommit/config.json)`)
    );
  } else {
    console.log(c.yellow("  No API key configured.\n"));
    console.log(
      c.dim("  Get a free key at: ") + c.cyan("https://cloud.cerebras.ai")
    );
    console.log();
  }

  const options = [];
  if (currentKey || envKey) {
    options.push("Set new API key");
    if (currentKey && !envKey) {
      options.push("Delete saved API key");
    }
    options.push("Show config path");
    options.push("Exit");
  } else {
    options.push("Set API key");
    options.push("Exit");
  }

  const choice = await select(c.bold("  What would you like to do?"), options);
  const picked = options[choice];

  if (picked === "Exit") {
    console.log();
    return;
  }

  if (picked === "Show config path") {
    console.log(c.dim(`\n  Config file: ${getConfigPath()}\n`));
    return;
  }

  if (picked === "Delete saved API key") {
    const deleted = deleteApiKey();
    if (deleted) {
      console.log(c.green("\n  ✔ API key deleted from config.\n"));
    } else {
      console.log(c.dim("\n  No saved key to delete.\n"));
    }
    return;
  }

  console.log();
  const key = await askSecret(c.bold("  Enter your Cerebras API key: "));
  if (!key) {
    console.log(c.red("\n  ✖ No key provided.\n"));
    return;
  }

  setApiKey(key);
  console.log(c.green("\n  ✔ API key saved to ~/.zcommit/config.json\n"));
}
