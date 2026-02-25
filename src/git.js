import { execSync } from "node:child_process";

/**
 * Execute a git command and return trimmed stdout.
 * @param {string} cmd - Git subcommand and args
 * @returns {string}
 */
function run(cmd) {
  return execSync(`git ${cmd}`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Check if the current directory is inside a git repository.
 */
export function isGitRepo() {
  try {
    run("rev-parse --is-inside-work-tree");
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
    return run("branch --show-current");
  } catch {
    return "HEAD (detached)";
  }
}

/**
 * Get a short summary of working-tree status (porcelain).
 * Returns an array of { status, file } objects.
 */
export function getStatus() {
  const raw = run("status --porcelain");
  if (!raw) return [];

  return raw.split("\n").map((line) => ({
    status: line.slice(0, 2).trim(),
    file: line.slice(3),
  }));
}

/**
 * Check if there are any staged changes.
 */
export function hasStagedChanges() {
  try {
    const diff = run("diff --cached --name-only");
    return diff.length > 0;
  } catch {
    return false;
  }
}

/**
 * Stage all changes (git add .).
 */
export function stageAll() {
  run("add .");
}

/**
 * Stage specific files.
 * @param {string[]} files
 */
export function stageFiles(files) {
  const escaped = files.map((f) => `"${f}"`).join(" ");
  run(`add ${escaped}`);
}

/**
 * Get the diff of staged changes for the AI prompt.
 * Limits output to avoid token bloat.
 */
export function getStagedDiff() {
  try {
    const diff = run("diff --cached --stat");
    const detailed = run("diff --cached");

    // Truncate large diffs to keep prompt reasonable (~4000 chars)
    const maxLen = 4000;
    const truncated =
      detailed.length > maxLen
        ? detailed.slice(0, maxLen) + "\n\n... [diff truncated for brevity]"
        : detailed;

    return { stat: diff, diff: truncated };
  } catch {
    return { stat: "", diff: "" };
  }
}

/**
 * Get recent commit log for context (last 5 commits).
 */
export function getRecentLog() {
  try {
    return run('log --oneline -5 --no-decorate');
  } catch {
    return "";
  }
}

/**
 * Commit with the given message.
 * @param {string} message
 */
export function commit(message) {
  run(`commit -m "${message.replace(/"/g, '\\"')}"`);
}

/**
 * Get the list of changed files (both staged and unstaged) as a simple list.
 */
export function getChangedFiles() {
  const status = getStatus();
  return status.map((s) => s.file);
}
