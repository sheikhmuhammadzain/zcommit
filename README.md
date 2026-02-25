# zcommit

[![npm version](https://img.shields.io/npm/v/zcommit.svg)](https://www.npmjs.com/package/zcommit)
[![license](https://img.shields.io/npm/l/zcommit.svg)](https://github.com/sheikhmuhammadzain/zcommit/blob/main/LICENSE)

**The fastest AI commit message generator.** Powered by [Cerebras](https://cerebras.ai) inference.

<!-- TODO: Replace with actual demo GIF -->
<!-- ![zcommit demo](./demo.gif) -->

---

## Why zcommit?

Writing good commit messages is important but tedious. AI commit tools exist, but they all use OpenAI — which means waiting 3-5 seconds for every single commit. When you commit dozens of times a day, that lag adds up fast and breaks your flow.

**zcommit uses Cerebras**, the fastest inference platform available. Your commit messages generate in under a second. No spinner staring, no context switching, no waiting. You stage, pick, and move on.

- **Instant generation** — Cerebras inference is 10-50x faster than OpenAI
- **Free to use** — Cerebras offers a free tier that's more than enough for commit messages
- **Zero config** — one command to set your API key, then it just works
- **One dependency** — no bloated `node_modules`, just the Cerebras SDK

---

## Features

- Generates 3 commit message suggestions from your staged diff
- Follows [Conventional Commits](https://www.conventionalcommits.org/) format (`feat:`, `fix:`, `refactor:`, etc.)
- Interactive arrow-key menu with vim keybindings (`j`/`k`)
- Stage all files or pick specific ones interactively
- Smart diff handling — prioritizes source code, truncates large diffs, skips binaries
- Includes recent commit history for style-consistent suggestions
- Automatic retry with backoff on transient API failures
- Secure API key storage (`~/.zcommit/config.json` with `0600` permissions)
- Detects rebase/merge/cherry-pick conflicts before committing
- Graceful terminal cleanup on `Ctrl+C` or crashes
- Works in non-TTY environments (CI/CD) with numbered fallback
- Respects `NO_COLOR` and `FORCE_COLOR` environment variables
- Lightweight and fast startup — SDK is lazy-loaded only when needed

---

## Installation

```bash
npm install -g zcommit
```

Requires **Node.js 18+** and **git** installed.

---

## Getting a Cerebras API Key

zcommit uses the Cerebras Cloud API, which has a **free tier** — no credit card required.

1. Go to [cloud.cerebras.ai](https://cloud.cerebras.ai)
2. Sign up for a free account
3. Navigate to **API Keys** in the dashboard
4. Click **Create API Key** and copy it
5. Run `zcommit config` and paste your key when prompted

That's it. Your key is saved to `~/.zcommit/config.json` with restricted file permissions. You can also set it as an environment variable instead:

```bash
export CEREBRAS_API_KEY="your-key-here"
```

---

## Quick Start

```bash
# Configure your API key (one-time setup)
zcommit config

# Make some changes, then commit
zcommit
```

---

## Usage

```bash
zcommit               # Interactive: stage, pick message, commit
zcommit -a            # Stage all files automatically
zcommit config        # Set, update, or delete your API key
zcommit --help        # Show help
zcommit --version     # Show version
```

### Flags

| Flag               | Description                              |
| ------------------ | ---------------------------------------- |
| `-a`, `--all`      | Stage all changes (skip staging prompt)  |
| `-h`, `--help`     | Show help                                |
| `-v`, `--version`  | Show version                             |

### Navigation Keys

| Key                 | Action                |
| ------------------- | --------------------- |
| `↑`/`↓` or `j`/`k` | Move selection        |
| `1`/`2`/`3`         | Jump to option        |
| `Enter`             | Confirm selection     |
| `Ctrl+C`            | Cancel and exit       |

---

## Example

```
  ⚡ zcommit — AI-powered git commits
  ─────────────────────────────────────────
  Created by Muhammad Zain · zainafzal.dev
  Run zcommit --help for all commands & flags

  Branch: main
  Changed files:
    + new  src/utils.js
    ~ mod  src/index.js

  How would you like to stage?
  ❯ Stage all changes  (git add .)
    Select specific files

  ✔ All changes staged.
  ✔ Generated 3 commit message suggestions.

  Pick a commit message:
  ❯ feat(utils): add date formatting helper functions
    refactor(index): simplify main entry point logic
    chore: update utility modules and entry point

  ✔ Committed successfully!
  Message: "feat(utils): add date formatting helper functions"
```

---

## Configuration

### API Key Resolution Order

1. `CEREBRAS_API_KEY` environment variable (takes priority)
2. `~/.zcommit/config.json` file

### Managing Your Key

```bash
zcommit config
```

This opens an interactive menu where you can:

- Set a new API key
- Delete a saved API key
- View the config file path

### Environment Variables

| Variable           | Description                     |
| ------------------ | ------------------------------- |
| `CEREBRAS_API_KEY` | Your Cerebras API key           |
| `NO_COLOR`         | Disable colored output          |
| `FORCE_COLOR`      | Force colors in non-TTY output  |

---

## Comparison

| Feature                     | zcommit         | aicommits           | cz-git              |
| --------------------------- | --------------- | -------------------- | ------------------- |
| **Speed**                   | ~1s (Cerebras)  | 3-5s (OpenAI)       | 3-5s (OpenAI)      |
| **Free tier**               | Yes             | No (OpenAI paid)     | No (OpenAI paid)    |
| **Dependencies**            | 1               | 5+                   | 10+                 |
| **Interactive staging**     | Yes             | No                   | No                  |
| **Vim keybindings**         | Yes             | No                   | No                  |
| **Conventional Commits**    | Yes             | Optional             | Yes                 |
| **Config complexity**       | 1 key, done     | Multiple options     | Extensive config    |
| **Conflict detection**      | Yes             | No                   | No                  |
| **Non-TTY support (CI/CD)** | Yes             | No                   | Yes                 |

---

## FAQ

### "No changes to commit"

You have no staged or unstaged changes. Make some edits first, then run `zcommit`.

### "Invalid API key" / 401 error

Your Cerebras API key is invalid or expired. Run `zcommit config` to set a new one.

### "Not a git repository"

Run `zcommit` from inside a git repository (any subdirectory works).

### "Rebase in progress" / "Merge in progress"

Finish or abort your current rebase/merge before using zcommit:

```bash
git rebase --abort    # or git rebase --continue
git merge --abort     # or resolve conflicts and git merge --continue
```

### Rate limiting (429 errors)

zcommit automatically retries with backoff. If it persists, wait a minute and try again. The Cerebras free tier has generous rate limits for commit messages.

### Colors not showing

Make sure your terminal supports ANSI colors. If piping output, use `FORCE_COLOR=1` to enable colors.

### Works in CI/CD?

Yes. In non-TTY environments, zcommit shows a numbered list instead of the arrow-key menu and accepts numeric input.

---

## Security

- API keys stored in `~/.zcommit/config.json` are protected with `0600` file permissions (owner read/write only)
- Git commands use `execFileSync` with argument arrays — no shell injection possible
- API keys from environment variables are never written to disk unless you opt in
- Config directory is created with `0700` permissions

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repo
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/zcommit.git
   cd zcommit
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b my-feature
   ```
5. Make your changes and test locally:
   ```bash
   node src/index.js
   ```
6. Commit and push, then open a PR

### Project Structure

```
src/
├── index.js    Entry point, orchestrates the workflow
├── ai.js       Cerebras SDK integration and message generation
├── config.js   API key storage and management
├── git.js      Git operations (status, staging, commit, diff)
├── ui.js       Terminal UI (colors, prompts, spinner, menus)
└── help.js     Help text formatting
```

---

## Author

**Muhammad Zain** · [zainafzal.dev](https://zainafzal.dev)

## License

[MIT](LICENSE)
