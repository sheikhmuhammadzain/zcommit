#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isGitRepo,
  getStatus,
  hasStagedChanges,
  stageAll,
  stageFiles,
  getStagedDiff,
  getRecentLog,
  commit,
  getCurrentBranch,
} from "./git.js";
import { generateCommitMessages } from "./ai.js";
import { getApiKey, setApiKey } from "./config.js";
import { banner, c, ask, askSecret, confirm, select, createSpinner } from "./ui.js";

// ─── Load version from package.json ──────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("-")));
const positional = args.filter((a) => !a.startsWith("-"));

if (flags.has("--help") || flags.has("-h")) {
  printHelp();
  process.exit(0);
}

if (flags.has("--version") || flags.has("-v")) {
  console.log(`zcommit v${pkg.version}`);
  process.exit(0);
}

if (positional[0] === "config") {
  await runConfig();
  process.exit(0);
}

// ─── Main Flow ───────────────────────────────────────────────────────────────

await main();

async function main() {
  banner();

  // 1. Check git repo
  if (!isGitRepo()) {
    console.log(c.red("  ✖ Not a git repository."));
    console.log(c.dim("  Run this command inside a git project.\n"));
    process.exit(1);
  }

  const branch = getCurrentBranch();
  console.log(c.dim(`  Branch: ${c.bold(branch)}`));

  // 2. Check for API key
  let apiKey = getApiKey();
  if (!apiKey) {
    console.log(c.yellow("  ⚠ No Cerebras API key found.\n"));
    console.log(
      c.dim("  Get a free key at: ") +
        c.cyan("https://cloud.cerebras.ai")
    );
    console.log();
    apiKey = await askSecret(c.bold("  Enter your Cerebras API key: "));
    if (!apiKey) {
      console.log(c.red("\n  ✖ API key is required.\n"));
      process.exit(1);
    }
    const shouldSave = await confirm(
      c.dim("  Save key for future use?")
    );
    if (shouldSave) {
      setApiKey(apiKey);
      console.log(c.green("  ✔ Key saved to ~/.zcommit/config.json\n"));
    }
    console.log();
  }

  // 3. Check for changes
  const status = getStatus();
  if (status.length === 0 && !hasStagedChanges()) {
    console.log(c.yellow("  ⚠ No changes detected. Nothing to commit.\n"));
    process.exit(0);
  }

  // 4. Stage files
  const staged = hasStagedChanges();

  if (!staged) {
    console.log(c.bold("  Changed files:"));
    status.forEach((s) => {
      const icon = s.status === "?" ? c.green("+") : c.yellow("~");
      console.log(`    ${icon} ${s.file}`);
    });
    console.log();

    const stageChoice = await select(c.bold("  How would you like to stage?"), [
      "Stage all changes  (git add .)",
      "Select specific files",
    ]);

    if (stageChoice === 0) {
      stageAll();
      console.log(c.green("\n  ✔ All changes staged.\n"));
    } else {
      // Let user type file names/patterns
      const files = status.map((s) => s.file);
      const fileInput = await ask(
        c.bold("  Enter file paths ") +
          c.dim("(space-separated, or glob pattern)") +
          c.bold(": ")
      );
      const selectedFiles = fileInput
        .split(/\s+/)
        .filter(Boolean)
        .filter((f) => {
          // Basic validation: check if file exists in status
          const exists = files.some((sf) => sf.includes(f));
          if (!exists) console.log(c.yellow(`  ⚠ '${f}' not in changed files, skipping.`));
          return exists;
        });

      if (selectedFiles.length === 0) {
        console.log(c.red("\n  ✖ No valid files selected.\n"));
        process.exit(1);
      }

      stageFiles(selectedFiles);
      console.log(c.green(`\n  ✔ Staged ${selectedFiles.length} file(s).\n`));
    }
  } else {
    console.log(c.dim("  Using already-staged changes.\n"));
  }

  // 5. Get diff for AI
  const diffData = getStagedDiff();
  if (!diffData.diff) {
    console.log(c.yellow("  ⚠ No staged diff found. Nothing to commit.\n"));
    process.exit(0);
  }

  const recentLog = getRecentLog();

  // 6. Generate commit messages
  const spinner = createSpinner(c.bold("Generating commit messages with AI..."));
  spinner.start();

  let messages;
  try {
    messages = await generateCommitMessages(apiKey, diffData, recentLog);
    spinner.stop(c.green("  ✔ Generated 3 commit message suggestions.\n"));
  } catch (err) {
    spinner.stop(c.red("  ✖ Failed to generate messages."));
    if (err.status === 401) {
      console.log(
        c.red("  Invalid API key. Run ") +
          c.bold("zcommit config") +
          c.red(" to update.\n")
      );
    } else {
      console.log(c.red(`  Error: ${err.message}\n`));
    }
    process.exit(1);
  }

  // 7. Let user pick a message
  const choice = await select(c.bold("  Pick a commit message:"), messages);
  const selectedMessage = messages[choice];

  console.log();

  // 8. Confirm and commit
  const shouldCommit = await confirm(
    `  ${c.bold("Commit with:")} ${c.green(`"${selectedMessage}"`)}\n  ${c.dim("Proceed?")}`
  );

  if (!shouldCommit) {
    console.log(c.yellow("\n  ⚠ Commit cancelled.\n"));
    process.exit(0);
  }

  // 9. Execute commit
  try {
    commit(selectedMessage);
    console.log(c.green(`\n  ✔ Committed successfully!`));
    console.log(c.dim(`  Message: "${selectedMessage}"\n`));
  } catch (err) {
    console.log(c.red(`\n  ✖ Commit failed: ${err.message}\n`));
    process.exit(1);
  }
}

// ─── Config Subcommand ───────────────────────────────────────────────────────

async function runConfig() {
  banner();
  console.log(c.bold("  Configure zcommit\n"));

  const currentKey = getApiKey();
  if (currentKey) {
    const masked = currentKey.slice(0, 8) + "..." + currentKey.slice(-4);
    console.log(c.dim(`  Current key: ${masked}`));
    const shouldUpdate = await confirm("  Update API key?");
    if (!shouldUpdate) {
      console.log(c.dim("\n  No changes made.\n"));
      return;
    }
  }

  const key = await askSecret(c.bold("  Enter your Cerebras API key: "));
  if (!key) {
    console.log(c.red("\n  ✖ No key provided.\n"));
    return;
  }

  setApiKey(key);
  console.log(c.green("\n  ✔ API key saved to ~/.zcommit/config.json\n"));
}

// ─── Help Text ───────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c.bold(c.cyan("⚡ zcommit"))} ${c.dim(`v${pkg.version}`)} — AI-powered git commit messages

${c.bold("USAGE")}
  ${c.cyan("zcommit")}              Analyze changes & generate commit messages
  ${c.cyan("zcommit config")}       Configure your Cerebras API key
  ${c.cyan("zcommit --help")}       Show this help message
  ${c.cyan("zcommit --version")}    Show version

${c.bold("HOW IT WORKS")}
  1. Detects uncommitted changes in your git repo
  2. Asks how you want to stage (all or specific files)
  3. Sends the diff to Cerebras AI (gpt-oss-120b)
  4. Presents 3 commit message suggestions
  5. You pick one, and it commits for you

${c.bold("CONFIGURATION")}
  API key is read from (in priority order):
    1. ${c.cyan("CEREBRAS_API_KEY")} environment variable
    2. ${c.cyan("~/.zcommit/config.json")} config file

  Get a free API key at: ${c.cyan("https://cloud.cerebras.ai")}

${c.bold("EXAMPLES")}
  ${c.dim("# Quick commit with AI message")}
  $ zcommit

  ${c.dim("# Set up API key")}
  $ zcommit config

  ${c.dim("# Use env variable")}
  $ CEREBRAS_API_KEY=csk-xxx zcommit
`);
}
