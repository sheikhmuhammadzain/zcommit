import { execFileSync } from "node:child_process";

// ─── Safe git execution ──────────────────────────────────────────────────────
// Uses execFileSync with argument arrays to prevent shell injection.

/**
 * Execute a git command safely with argument array.
 * @param {string[]} args - Git subcommand and arguments
 * @returns {string} trimmed stdout
 */
function run(args) {
  return execFileSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

/**
 * Execute a git command and return raw stdout (only trailing whitespace removed).
 * Critical for commands like `status --porcelain` where leading spaces are meaningful.
 * @param {string[]} args
 * @returns {string}
 */
function runRaw(args) {
  return execFileSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).replace(/\s+$/, "");
}

/**
 * Check if the current directory is inside a git repository.
 */
export function isGitRepo() {
  try {
    run(["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name.
 */
export function getCurrentBranch() {
  try {
    return run(["branch", "--show-current"]) || "HEAD (detached)";
  } catch {
    return "HEAD (detached)";
  }
}

/**
 * Check if a rebase or merge is in progress.
 * @returns {"rebase" | "merge" | null}
 */
export function getConflictState() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", "REBASE_HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return "rebase";
  } catch {
    // no rebase
  }

  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return "merge";
  } catch {
    // no merge
  }

  return null;
}

/**
 * Parse git status --porcelain output into structured data.
 *
 * Porcelain format: XY filename
 *   X = index (staged) status
 *   Y = working tree status
 *   ' ' = unmodified, M = modified, A = added, D = deleted,
 *   R = renamed, C = copied, ? = untracked, ! = ignored
 *
 * @returns {{
 *   staged: Array<{ status: string, file: string }>,
 *   unstaged: Array<{ status: string, file: string }>,
 *   untracked: Array<{ file: string }>,
 *   all: Array<{ xy: string, file: string }>
 * }}
 */
export function getStatus() {
  const raw = runRaw(["status", "--porcelain"]);
  if (!raw) return { staged: [], unstaged: [], untracked: [], all: [] };

  const staged = [];
  const unstaged = [];
  const untracked = [];
  const all = [];

  for (const line of raw.split("\n")) {
    if (!line) continue;

    const x = line[0]; // index status
    const y = line[1]; // working tree status
    const file = line.slice(3);

    all.push({ xy: line.slice(0, 2), file });

    if (x === "?" && y === "?") {
      untracked.push({ file });
    } else {
      // Staged: X is not ' ' and not '?'
      if (x !== " " && x !== "?") {
        staged.push({ status: x, file });
      }
      // Unstaged: Y is not ' '
      if (y !== " " && y !== "?") {
        unstaged.push({ status: y, file });
      }
    }
  }

  return { staged, unstaged, untracked, all };
}

/**
 * Check if there are any staged changes using git diff.
 * This is the most reliable check — directly asks git for cached diff names.
 */
export function hasStagedChanges() {
  try {
    const names = run(["diff", "--cached", "--name-only"]);
    return names.length > 0;
  } catch {
    return false;
  }
}

/**
 * Stage all changes (git add .).
 */
export function stageAll() {
  run(["add", "."]);
}

/**
 * Stage specific files safely (no shell injection).
 * @param {string[]} files
 */
export function stageFiles(files) {
  run(["add", "--", ...files]);
}

/**
 * Get the diff of staged changes for the AI prompt.
 * Uses a smart strategy to maximize context within token limits:
 *  - Always includes the full --stat summary (bird's-eye view)
 *  - Prioritizes source code diffs over docs/config
 *  - Truncates per-file if individual diffs are huge
 */
export function getStagedDiff() {
  try {
    const stat = run(["diff", "--cached", "--stat"]);
    const fileNames = run(["diff", "--cached", "--name-only"]);
    if (!fileNames) return { stat: "", diff: "" };

    const files = fileNames.split("\n").filter(Boolean);

    // Sort files: source code first, then config, then docs/other
    const priority = (f) => {
      if (/\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|rb|php)$/i.test(f)) return 0;
      if (/\.(json|ya?ml|toml|env|lock)$/i.test(f)) return 1;
      if (/\.(md|txt|rst|html|css)$/i.test(f)) return 2;
      return 1;
    };
    const sorted = [...files].sort((a, b) => priority(a) - priority(b));

    // Collect per-file diffs, respecting a total budget
    const MAX_TOTAL = 12000; // ~3000 tokens, enough for AI context
    const MAX_PER_FILE = 3000; // cap any single file
    let total = 0;
    const parts = [];

    for (const file of sorted) {
      if (total >= MAX_TOTAL) {
        parts.push(`\n... (${sorted.length - parts.length} more files omitted)`);
        break;
      }

      try {
        let fileDiff = run(["diff", "--cached", "--", file]);
        if (fileDiff.length > MAX_PER_FILE) {
          fileDiff =
            fileDiff.slice(0, MAX_PER_FILE) +
            `\n... [${file} truncated]`;
        }
        parts.push(fileDiff);
        total += fileDiff.length;
      } catch {
        // skip unreadable file
      }
    }

    return { stat, diff: parts.join("\n") };
  } catch {
    return { stat: "", diff: "" };
  }
}

/**
 * For initial commits — get file list when there's no HEAD to diff against.
 */
export function getStagedDiffForNewRepo() {
  try {
    // Try normal cached diff first
    const detailed = run(["diff", "--cached"]);
    if (detailed) {
      const stat = run(["diff", "--cached", "--stat"]);
      return { stat, diff: detailed };
    }

    // No diff means new files only — list them for context
    const names = run(["diff", "--cached", "--name-only"]);
    if (names) {
      return {
        stat: names,
        diff: `New files staged for initial commit:\n${names}`,
      };
    }

    return { stat: "", diff: "" };
  } catch {
    return { stat: "", diff: "" };
  }
}

/**
 * Get recent commit log for context (last 5 commits).
 */
export function getRecentLog() {
  try {
    return run(["log", "--oneline", "-5", "--no-decorate"]);
  } catch {
    return "";
  }
}

/**
 * Commit with the given message (safe — no shell injection).
 * @param {string} message
 */
export function commit(message) {
  run(["commit", "-m", message]);
}
