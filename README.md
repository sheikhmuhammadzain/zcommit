# zcommit

**AI-powered git commit message generator** using [Cerebras](https://cerebras.ai) fast inference.

Stop writing commit messages manually. `zcommit` analyzes your staged changes and generates 3 smart commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification. Pick one, hit enter, done.

## Features

- Analyzes your git diff to understand what changed
- Generates 3 commit message suggestions using Cerebras AI (gpt-oss-120b)
- Interactive arrow-key selection UI
- Follows Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.)
- Supports staging all files or selecting specific ones
- Persists API key securely in `~/.zcommit/config.json`
- Zero config needed beyond an API key
- Lightweight — only one dependency

## Installation

```bash
npm install -g zcommit
```

## Setup

Get a **free** Cerebras API key at [cloud.cerebras.ai](https://cloud.cerebras.ai).

Then either:

```bash
# Option 1: Configure via CLI (saved to ~/.zcommit/config.json)
zcommit config

# Option 2: Set environment variable
export CEREBRAS_API_KEY="your-key-here"
```

## Usage

```bash
# Navigate to your git repo, make some changes, then:
zcommit
```

That's it. The tool will:

1. Detect your uncommitted changes
2. Ask how you want to stage (all files or select specific ones)
3. Send the diff to Cerebras AI
4. Show you 3 commit message options
5. You scroll with arrow keys, pick one, and confirm
6. It commits with your chosen message

### Commands

| Command            | Description                    |
| ------------------ | ------------------------------ |
| `zcommit`          | Generate & commit              |
| `zcommit config`   | Set/update your API key        |
| `zcommit --help`   | Show help                      |
| `zcommit --version`| Show version                   |

## Example

```
  ⚡ zcommit — AI-powered git commits
  ─────────────────────────────────

  Branch: main
  Changed files:
    + src/utils.js
    ~ src/index.js

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
```

## Configuration

The API key is resolved in this order:

1. `CEREBRAS_API_KEY` environment variable
2. `~/.zcommit/config.json` file

## Requirements

- Node.js 18+
- Git installed and in PATH
- A Cerebras API key (free tier available)

## License

MIT
