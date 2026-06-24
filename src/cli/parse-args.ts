export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  return { positional, flags };
}

export function getFlagString(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  return value === true ? undefined : value;
}

export function hasFlag(flags: Map<string, string | true>, name: string): boolean {
  return flags.has(name);
}
