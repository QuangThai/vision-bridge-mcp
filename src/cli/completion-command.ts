import { VERSION } from "../constants.js";

// ---------------------------------------------------------------------------
// Command list — source of truth for completions
// ---------------------------------------------------------------------------

const COMMANDS = [
  "doctor",
  "capabilities",
  "should-intercept",
  "analyze",
  "ocr",
  "compare",
  "eval",
  "install-hooks",
  "config",
  "costs",
  "estimate",
  "cache",
  "hook",
  "serve",
] as const;

const SUBCOMMANDS: Record<string, string[]> = {
  cache: ["stats", "clear"],
  config: ["show", "path", "init"],
  hook: ["user-prompt", "capture-image"],
};

const SHARED_FLAGS = ["--help", "--json", "--save", "--verbose"];

const COMMAND_FLAGS: Record<string, string[]> = {
  analyze: ["--mode", "--detail", "--framework", "--style-system", "--goal", "--json", "--save"],
  ocr: [
    "--preserve-layout",
    "--no-preserve-layout",
    "--extract-tables",
    "--extract-code",
    "--json",
    "--save",
  ],
  compare: ["--focus", "--severity-threshold", "--json", "--save"],
  doctor: ["--json"],
  capabilities: ["--model", "--provider", "--json"],
  "should-intercept": ["--model", "--provider"],
  eval: ["--threshold", "--json"],
  config: ["--json", "--output"],
  estimate: ["--json"],
  costs: ["--today", "--session", "--range", "--json"],
  "install-hooks": [],
  hook: ["--client"],
  serve: ["--transport"],
};

const CMD_DESC: Record<string, string> = {
  doctor: "Check environment and provider connectivity",
  capabilities: "Look up model vision support via models.dev",
  "should-intercept": "Debug intercept decision for a model",
  analyze: "Analyze an image and return structured evidence",
  ocr: "Extract visible text from an image",
  compare: "Compare two images for visual differences",
  eval: "Run golden fixture evaluation against the provider",
  "install-hooks": "Install hooks for a client (cursor|claude|codex|droid)",
  config: "Show or init configuration (atlas-vision.toml / .json)",
  costs: "Show vision API cost summary",
  estimate: "Estimate vision API cost for an image",
  cache: "Manage vision response cache (stats, clear)",
  hook: "Agent hook helpers (user-prompt, capture-image)",
  serve: "Start MCP server over stdio",
};

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------

/**
 * Generate bash completion script.
 *
 * IMPORTANT: Bash variable references like ${COMP_WORDS} must NOT be JavaScript
 * template literal interpolations. We use ${D} (where D = "$") to emit literal
 * dollar signs in the output.
 */
function generateBash(): string {
  const D = "$";
  const commands = COMMANDS.join(" ");
  const cmdFlags = Object.entries(COMMAND_FLAGS)
    .map(([c, f]) => `    ${c}) COMPREPLY=($(compgen -W "${f.join(" ")}" -- "${D}cur")) ;;`)
    .join("\n");
  const shared = SHARED_FLAGS.join(" ");

  // Build subcommand branch conditions
  const subBranches = Object.entries(SUBCOMMANDS)
    .map(
      ([c, subs]) =>
        `    if [[ "${D}cmd" == "${c}" ]]; then\n      COMPREPLY=($(compgen -W "${subs.join(" ")} --help" -- "${D}cur"))\n      return 0\n    fi`,
    )
    .join("\n");

  return [
    `# atlas-vision-mcp v${VERSION} bash completion`,
    "_atlas_vision_completions() {",
    `  local cur="${D}{COMP_WORDS[COMP_CWORD]}"`,
    `  local prev="${D}{COMP_WORDS[COMP_CWORD - 1]}"`,
    `  local cmd="${D}{COMP_WORDS[1]}"`,
    "",
    "  # First argument: command name",
    `  if [[ ${D}{#COMP_WORDS[@]} -eq 2 ]]; then`,
    `    COMPREPLY=($(compgen -W "${commands}" -- "${D}cur"))`,
    "    return 0",
    "  fi",
    "",
    "  # Subcommands",
    `  if [[ ${D}{#COMP_WORDS[@]} -eq 3 ]]; then`,
    subBranches,
    "  fi",
    "",
    "  # Per-command flags",
    `  case "${D}cmd" in`,
    cmdFlags,
    `    *) COMPREPLY=($(compgen -W "${shared}" -- "${D}cur")) ;;`,
    "  esac",
    "}",
    "complete -F _atlas_vision_completions atlas-vision",
    "complete -F _atlas_vision_completions atlas-vision-mcp",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Zsh
// ---------------------------------------------------------------------------

function generateZsh(): string {
  const specs = COMMANDS.map((c) => {
    const d = CMD_DESC[c] ?? "";
    const f = COMMAND_FLAGS[c] ?? SHARED_FLAGS;
    const s = SUBCOMMANDS[c];
    if (s) {
      const ss = s.map((x) => `  "${x}:${x}"`).join("\n          ");
      return `  "${c}:${d}" \\\n    "::${c} subcommand:((${ss}))" \\\n    "*:flag:(${f.join(" ")})"`;
    }
    return `  "${c}:${d}" \\\n    "*:flag:(${f.join(" ")})"`;
  }).join("\n");

  return [
    "#compdef atlas-vision atlas-vision-mcp",
    "",
    "_atlas_vision_completions() {",
    "  local -a commands",
    "  commands=(",
    specs,
    "  )",
    "  _arguments \\",
    '    "1:command:->cmd" \\',
    '    "*::arg:->args"',
    "",
    "  case $state in",
    '    cmd) _describe "command" commands ;;',
    "    args) ;;",
    "  esac",
    "}",
    "",
    '_atlas_vision_completions "$@"',
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------

function generateFish(): string {
  const cmds = COMMANDS.map(
    (c) => `complete -c atlas-vision -f -a "${c}" -d "${CMD_DESC[c] ?? ""}"`,
  ).join("\n");

  const subs = Object.entries(SUBCOMMANDS)
    .flatMap(([c, xs]) =>
      xs.map((s) => `complete -c atlas-vision -f -n "__fish_seen_subcommand_from ${c}" -a "${s}"`),
    )
    .join("\n");

  return [
    `# atlas-vision-mcp v${VERSION} fish completion`,
    `complete -c atlas-vision -f -l help -d "Show help"`,
    cmds,
    subs,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCompletionCommand(args: string[]): number {
  const shell = args[0];

  let script: string;
  switch (shell) {
    case "bash":
      script = generateBash();
      break;
    case "zsh":
      script = generateZsh();
      break;
    case "fish":
      script = generateFish();
      break;
    default:
      console.error("Usage: atlas-vision completion <bash|zsh|fish>");
      console.error("");
      console.error(
        "Generates shell completion script. Pipe to your shell's completion directory:",
      );
      console.error("");
      console.error("  # Bash");
      console.error("  atlas-vision completion bash > /etc/bash_completion.d/atlas-vision");
      console.error("");
      console.error("  # Zsh");
      console.error(
        "  atlas-vision completion zsh > /usr/local/share/zsh/site-functions/_atlas-vision",
      );
      console.error("");
      console.error("  # Fish");
      console.error(
        "  atlas-vision completion fish > ~/.config/fish/completions/atlas-vision.fish",
      );
      console.error("");
      console.error("Or source directly in your shell rc:");
      console.error("");
      console.error("  # ~/.bashrc / ~/.zshrc");
      console.error('  eval "$(atlas-vision completion bash)"');
      return 1;
  }

  console.log(script);
  return 0;
}
