import { c } from "./ui.js";

/**
 * Print formatted help text.
 * @param {string} version
 */
export function printHelp(version) {
  console.log(`
${c.bold(c.cyan("⚡ zcommit"))} ${c.dim(`v${version}`)} — AI-powered git commit messages
${c.dim("Created by")} ${c.bold("Muhammad Zain")} ${c.dim("·")} ${c.cyan("zainafzal.dev")}

${c.bold("USAGE")}
  ${c.cyan("zcommit")}                Analyze changes & generate commit messages
  ${c.cyan("zcommit config")}         Set, update, or delete your API key
  ${c.cyan("zcommit -a")}             Stage all + generate (skip staging prompt)
  ${c.cyan("zcommit --help")}         Show this help message
  ${c.cyan("zcommit --version")}      Show version

${c.bold("FLAGS")}
  ${c.cyan("-a, --all")}         Stage all changes automatically
  ${c.cyan("-h, --help")}        Show help
  ${c.cyan("-v, --version")}     Show version

${c.bold("HOW IT WORKS")}
  1. Detects uncommitted changes in your git repo
  2. Asks how you want to stage (all or specific files)
  3. Sends the diff to Cerebras AI (gpt-oss-120b)
  4. Presents 3 commit message suggestions
  5. You pick one with arrow keys — it commits instantly

${c.bold("NAVIGATION")}
  ${c.cyan("↑/↓")} or ${c.cyan("j/k")}       Move selection
  ${c.cyan("1/2/3")}            Jump to option
  ${c.cyan("Enter")}            Confirm and commit
  ${c.cyan("Ctrl+C")}           Cancel and exit

${c.bold("CONFIGURATION")}
  API key is read from (in priority order):
    1. ${c.cyan("CEREBRAS_API_KEY")} environment variable
    2. ${c.cyan("~/.zcommit/config.json")} config file

  Get a free API key at: ${c.cyan("https://cloud.cerebras.ai")}

${c.bold("EXAMPLES")}
  ${c.dim("# Interactive commit")}
  $ zcommit

  ${c.dim("# Quick — stage all, then pick message")}
  $ zcommit -a

  ${c.dim("# Set up or change your API key")}
  $ zcommit config

  ${c.dim("# Use via environment variable")}
  $ CEREBRAS_API_KEY=csk-xxx zcommit

${c.bold("ENVIRONMENT")}
  ${c.cyan("CEREBRAS_API_KEY")}   Your Cerebras API key
  ${c.cyan("NO_COLOR")}           Disable all colors
  ${c.cyan("FORCE_COLOR")}        Force colors even in non-TTY
`);
}
