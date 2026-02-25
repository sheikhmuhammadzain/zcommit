# ⚡ zcommit

**AI-powered git commit message generator** using [Cerebras](https://cerebras.ai) fast inference.

Created by **Muhammad Zain** · [zainafzal.dev](https://zainafzal.dev)

---

Stop writing commit messages manually. `zcommit` analyzes your staged changes and generates 3 smart commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification. Pick one, hit enter, done.

## Features

- Analyzes your git diff to understand what changed
- Generates 3 commit message suggestions using Cerebras AI (gpt-oss-120b)
- Interactive arrow-key selection UI with vim keybindings (j/k)
- Follows Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.)
- Supports staging all files or selecting specific ones
- Persists API key securely in `~/.zcommit/config.json` (0600 permissions)
- Zero config needed beyond an API key
- Lightweight: only one dependency (`@cerebras/cerebras_cloud_sdk`)
- Fast startup: heavy SDK is lazy-loaded only when needed
- Automatic retry with backoff on transient API failures
- Graceful terminal cleanup on Ctrl+C or crashes
- Respects `NO_COLOR` and `FORCE_COLOR` environment variables
- Works in non-TTY environments (CI/CD) with numbered fallback

## Installation

```bash
npm install -g zcommit
```

## Quick Start

```bash
# 1. Get a free API key at https://cloud.cerebras.ai
# 2. Configure it once:
zcommit config

# 3. Go to any git repo and commit:
zcommit
```

## Usage

```bash
zcommit               # Interactive: stage, pick message, confirm
zcommit -a            # Stage all files automatically
zcommit -y            # Skip confirmation prompt
zcommit -a -y         # Fastest: stage all, pick message, auto-confirm
zcommit config        # Set, update, or delete your API key
zcommit --help        # Show help
zcommit --version     # Show version
```

### Flags

| Flag               | Description                              |
| ------------------ | ---------------------------------------- |
| `-a`, `--all`      | Stage all changes (skip staging prompt)  |
| `-y`, `--yes`      | Skip commit confirmation                 |
| `-h`, `--help`     | Show help                                |
| `-v`, `--version`  | Show version                             |

### Navigation

| Key              | Action                |
| ---------------- | --------------------- |
| `↑`/`↓` or `j`/`k` | Move selection     |
| `1`/`2`/`3`      | Jump to option        |
| `Enter`           | Confirm selection     |
| `Ctrl+C`          | Cancel and exit       |

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

  Commit with: "feat(utils): add date formatting helper functions"
  Proceed? (y/n) y

  ✔ Committed successfully!
  Message: "feat(utils): add date formatting helper functions"
```

## Configuration

API key is resolved in this order:

1. `CEREBRAS_API_KEY` environment variable
2. `~/.zcommit/config.json` file

### Environment Variables

| Variable           | Description                     |
| ------------------ | ------------------------------- |
| `CEREBRAS_API_KEY` | Your Cerebras API key           |
| `NO_COLOR`         | Disable colored output          |
| `FORCE_COLOR`      | Force colors in non-TTY output  |

## Security

- API keys stored in `~/.zcommit/config.json` are protected with `0600` file permissions (owner read/write only)
- Git commands use `execFileSync` (argument arrays) — **no shell injection possible**
- API keys from environment variables are never written to disk unless you opt in

## Requirements

- Node.js 18+
- Git installed and in PATH
- A Cerebras API key ([free tier available](https://cloud.cerebras.ai))

## Author

**Muhammad Zain** · [zainafzal.dev](https://zainafzal.dev)

## License

MIT
