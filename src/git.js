import { execFileSync } from "node:child_process";

// ─── Safe git execution ──────────────────────────────────────────────────────

/**
 * Execute a git command safely with argument array.
 * @param {string[]} args
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
 * Execute git and return raw stdout (only trailing whitespace stripped).
 * Required for `status --porcelain` where leading spaces are meaningful.
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Git quotes filenames with special characters. Unquote them.
 * "path with spaces/file.js" -> path with spaces/file.js
 * @param {string} name
 * @returns {string}
 */
function unquote(name) {
  if (name.startsWith('"') && name.endsWith('"')) {
    // Git uses C-style escaping inside quotes
    return name
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"');
  }
  return name;
}

/**
 * Parse a porcelain filename, handling renames (old -> new) syntax.
 * @param {string} raw - Raw filename from porcelain output
 * @returns {{ file: string, from?: string }}
 */
function parseFilename(raw) {
  // Renames/copies: "old name -> new name"
  const arrow = raw.indexOf(" -> ");
  if (arrow !== -1) {
    return {
      file: unquote(raw.slice(arrow + 4)),
      from: unquote(raw.slice(0, arrow)),
    };
  }
  return { file: unquote(raw) };
}

// ─── Repository checks ──────────────────────────────────────────────────────

/**
 * Check if the current directory is inside a git repository.
 * Works even from a subdirectory.
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
 * Handles detached HEAD gracefully.
 */
export function getCurrentBranch() {
  try {
    const branch = run(["branch", "--show-current"]);
    if (branch) return branch;
    // Detached HEAD — show short SHA
    const sha = run(["rev-parse", "--short", "HEAD"]);
    return `HEAD detached at ${sha}`;
  } catch {
    return "HEAD (unknown)";
  }
}

/**
 * Check if a rebase, merge, or cherry-pick is in progress.
 * @returns {"rebase" | "merge" | "cherry-pick" | null}
 */
export function getConflictState() {
  const checks = [
    { ref: "REBASE_HEAD", label: "rebase" },
    { ref: "MERGE_HEAD", label: "merge" },
    { ref: "CHERRY_PICK_HEAD", label: "cherry-pick" },
  ];

  for (const { ref, label } of checks) {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return label;
    } catch {
      // not in progress
    }
  }

  return null;
}

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Status types for display.
 */
const STATUS_LABELS = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange",
  U: "conflict",
  "?": "untracked",
};

/**
 * Parse git status --porcelain output into structured data.
 *
 * Porcelain format per line: XY<space>filename
 *   X = index (staged) status
 *   Y = working tree status
 *
 * Handles: modified, added, deleted, renamed, copied, untracked,
 * conflicts, quoted filenames, spaces in paths, submodules.
 *
 * @returns {{
 *   staged: Array<{ status: string, label: string, file: string, from?: string }>,
 *   unstaged: Array<{ status: string, label: string, file: string }>,
 *   untracked: Array<{ file: string }>,
 *   conflicts: Array<{ file: string }>,
 *   all: Array<{ xy: string, file: string, label: string, from?: string }>
 * }}
 */
export function getStatus() {
  const raw = runRaw(["status", "--porcelain"]);
  if (!raw) return { staged: [], unstaged: [], untracked: [], conflicts: [], all: [] };

  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicts = [];
  const all = [];

  for (const line of raw.split("\n")) {
    if (!line || line.length < 2) continue;

    const x = line[0]; // index status
    const y = line[1]; // working tree status
    const rawName = line.slice(3);
    const { file, from } = parseFilename(rawName);

    // ── Untracked ──
    if (x === "?" && y === "?") {
      untracked.push({ file });
      all.push({ xy: "??", file, label: "untracked" });
      continue;
    }

    // ── Ignored ──
    if (x === "!" && y === "!") {
      continue; // skip ignored files entirely
    }

    // ── Merge conflicts ──
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      conflicts.push({ file });
      all.push({ xy: x + y, file, label: "conflict" });
      continue;
    }

    // ── Staged changes (X column) ──
    if (x !== " " && x !== "?") {
      const label = STATUS_LABELS[x] || "modified";
      staged.push({ status: x, label, file, ...(from ? { from } : {}) });
    }

    // ── Unstaged changes (Y column) ──
    if (y !== " ") {
      const label = STATUS_LABELS[y] || "modified";
      unstaged.push({ status: y, label, file });
    }

    // ── Build display label ──
    const displayLabel = STATUS_LABELS[x !== " " && x !== "?" ? x : y] || "modified";
    all.push({ xy: x + y, file, label: displayLabel, ...(from ? { from } : {}) });
  }

  return { staged, unstaged, untracked, conflicts, all };
}

/**
 * Check if there are any staged changes using git diff.
 * Source of truth — not affected by CRLF normalization quirks.
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
 * Check if this is a brand-new repo with no commits yet.
 */
export function isInitialCommit() {
  try {
    run(["rev-parse", "HEAD"]);
    return false;
  } catch {
    return true;
  }
}

// ─── Staging ─────────────────────────────────────────────────────────────────

/**
 * Stage all changes (git add .).
 * Respects .gitignore automatically.
 * Throws on failure (locked index, permissions, etc).
 */
export function stageAll() {
  try {
    run(["add", "."]);
  } catch (err) {
    const msg = err.stderr || err.message || "";
    if (msg.includes("index.lock")) {
      throw new Error(
        "Git index is locked. Another git process may be running.\n" +
          "  If not, delete .git/index.lock and try again."
      );
    }
    throw new Error(`git add failed: ${msg.split("\n")[0]}`);
  }
}

/**
 * Stage specific files safely.
 * @param {string[]} files
 */
export function stageFiles(files) {
  try {
    run(["add", "--", ...files]);
  } catch (err) {
    const msg = err.stderr || err.message || "";
    throw new Error(`git add failed: ${msg.split("\n")[0]}`);
  }
}

// ─── Diff ────────────────────────────────────────────────────────────────────

/**
 * Get the diff of staged changes for the AI prompt.
 * Smart strategy:
 *  - Always includes full --stat summary
 *  - Prioritizes source code over docs/config
 *  - Handles binary files gracefully
 *  - Caps per-file and total size
 */
export function getStagedDiff() {
  try {
    const stat = run(["diff", "--cached", "--stat"]);
    const fileNames = run(["diff", "--cached", "--name-only"]);
    if (!fileNames) return { stat: "", diff: "" };

    const files = fileNames.split("\n").filter(Boolean);

    // Sort: source code first, config second, docs last
    const priority = (f) => {
      if (/\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|rb|php|swift|kt)$/i.test(f)) return 0;
      if (/\.(json|ya?ml|toml|lock|env|ini|cfg)$/i.test(f)) return 1;
      if (/\.(md|txt|rst|html|css|scss)$/i.test(f)) return 2;
      return 1;
    };
    const sorted = [...files].sort((a, b) => priority(a) - priority(b));

    const MAX_TOTAL = 12000;
    const MAX_PER_FILE = 3000;
    let total = 0;
    const parts = [];
    let skipped = 0;

    for (const file of sorted) {
      if (total >= MAX_TOTAL) {
        skipped = sorted.length - parts.length;
        break;
      }

      try {
        // Use --textconv to handle binary files gracefully
        let fileDiff = run(["diff", "--cached", "--", file]);

        // Skip binary file diffs (they show as "Binary files differ")
        if (fileDiff.includes("Binary files") && fileDiff.length < 200) {
          parts.push(`[binary file: ${file}]`);
          total += 30;
          continue;
        }

        if (fileDiff.length > MAX_PER_FILE) {
          fileDiff =
            fileDiff.slice(0, MAX_PER_FILE) + `\n... [${file} truncated]`;
        }
        parts.push(fileDiff);
        total += fileDiff.length;
      } catch {
        // Skip unreadable files (submodules, etc)
        parts.push(`[could not read diff: ${file}]`);
      }
    }

    if (skipped > 0) {
      parts.push(`\n... (${skipped} more file(s) omitted for brevity)`);
    }

    return { stat, diff: parts.join("\n") };
  } catch {
    return { stat: "", diff: "" };
  }
}

/**
 * For initial commits where there's no HEAD to diff against.
 * Uses `diff --cached` against the empty tree.
 */
export function getStagedDiffForNewRepo() {
  try {
    // Diff against empty tree to see all staged files
    const emptyTree = "4b825dc642cb6eb9a060e54bf899d69f7cb46101";
    const stat = run(["diff", "--cached", "--stat", emptyTree]);
    const detailed = run(["diff", "--cached", emptyTree]);

    if (detailed) {
      const MAX_LEN = 12000;
      const truncated =
        detailed.length > MAX_LEN
          ? detailed.slice(0, MAX_LEN) + "\n... [truncated]"
          : detailed;
      return { stat, diff: truncated };
    }

    // Fallback: just list file names
    const names = run(["diff", "--cached", "--name-only", emptyTree]);
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

// ─── Log ─────────────────────────────────────────────────────────────────────

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

// ─── Commit ──────────────────────────────────────────────────────────────────

/**
 * Commit with the given message.
 * Returns meaningful errors for hook failures, empty commits, etc.
 * @param {string} message
 */
export function commit(message) {
  try {
    run(["commit", "-m", message]);
  } catch (err) {
    const msg = err.stderr || err.message || "unknown error";

    if (msg.includes("nothing to commit")) {
      throw new Error("Nothing to commit — staged changes may match HEAD.");
    }
    if (msg.includes("pre-commit hook") || msg.includes("hook")) {
      throw new Error(
        "Pre-commit hook rejected the commit.\n" +
          "  Fix the issues reported above, re-stage, and try again."
      );
    }
    if (msg.includes("index.lock")) {
      throw new Error(
        "Git index is locked. Another git process may be running."
      );
    }

    // Extract first meaningful line from git error
    const firstLine = msg.split("\n").find((l) => l.trim()) || msg;
    throw new Error(firstLine.trim());
  }
}
