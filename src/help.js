import { c } from "./ui.js";

/**
 * Print formatted help text.
 * @param {string} version
 */
export function printHelp(version) {
  console.log(`
${c.bold(c.cyan("⚡ zcommit"))} ${c.dim(`v${version}`)} — AI-powered git commit messages

${c.bold("USAGE")}
  ${c.cyan("zcommit")}                Analyze changes & generate commit messages
  ${c.cyan("zcommit config")}         Configure your Cerebras API key
  ${c.cyan("zcommit -a")}             Stage all + generate (skip staging prompt)
  ${c.cyan("zcommit -y")}             Auto-confirm the selected message
  ${c.cyan("zcommit -a -y")}          Full auto: stage all, pick first, commit
  ${c.cyan("zcommit --help")}         Show this help message
  ${c.cyan("zcommit --version")}      Show version

${c.bold("FLAGS")}
  ${c.cyan("-a, --all")}         Stage all changes automatically
  ${c.cyan("-y, --yes")}         Skip commit confirmation prompt
  ${c.cyan("-h, --help")}        Show help
  ${c.cyan("-v, --version")}     Show version

${c.bold("HOW IT WORKS")}
  1. Detects uncommitted changes in your git repo
  2. Asks how you want to stage (all or specific files)
  3. Sends the diff to Cerebras AI (gpt-oss-120b)
  4. Presents 3 commit message suggestions
  5. You pick one with arrow keys, and it commits

${c.bold("CONFIGURATION")}
  API key is read from (in priority order):
    1. ${c.cyan("CEREBRAS_API_KEY")} environment variable
    2. ${c.cyan("~/.zcommit/config.json")} config file

  Get a free API key at: ${c.cyan("https://cloud.cerebras.ai")}

${c.bold("EXAMPLES")}
  ${c.dim("# Interactive commit")}
  $ zcommit

  ${c.dim("# Quick commit — stage all, still pick message")}
  $ zcommit -a

  ${c.dim("# Fastest — stage all, auto-confirm first AI suggestion")}
  $ zcommit -a -y

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
