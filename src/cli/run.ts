import { PACKAGE_NAME, VERSION } from "../constants.js";
import {
  runAnalyzeCommand,
  runCompareCommand,
  runDoctorCommand,
  runOcrCommand,
  runServeCommand,
} from "./commands.js";

export function runCli(argv: string[] = process.argv.slice(2)): number | Promise<number> {
  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h") {
    console.log(`${PACKAGE_NAME} v${VERSION}`);
    console.log("");
    console.log("Usage: atlas-vision <command> [options]");
    console.log("");
    console.log("When run with no command (for example via npx), starts the MCP stdio server.");
    console.log("");
    console.log("Commands:");
    console.log("  doctor   Check environment and provider connectivity");
    console.log("  analyze  Analyze an image and return structured evidence");
    console.log("  ocr      Extract visible text from an image");
    console.log("  compare  Compare two images for visual differences");
    console.log("  serve    Start MCP server over stdio");
    console.log("");
    console.log("Examples:");
    console.log("  atlas-vision doctor");
    console.log("  atlas-vision analyze ./screenshot.png --mode error_screenshot --json");
    console.log("  atlas-vision serve --transport stdio");
    console.log("  atlas-vision ocr ./error.png --preserve-layout");
    console.log("  atlas-vision compare ./before.png ./after.png --focus layout");
    return 0;
  }

  if (!command) {
    return runServeCommand([]);
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return 0;
  }

  if (command === "doctor") {
    return runDoctorCommand();
  }

  if (command === "analyze") {
    return runAnalyzeCommand(rest);
  }

  if (command === "ocr") {
    return runOcrCommand(rest);
  }

  if (command === "compare") {
    return runCompareCommand(rest);
  }

  if (command === "serve") {
    return runServeCommand(rest);
  }

  console.error(`Unknown command: ${command}`);
  console.error("Run atlas-vision --help for usage.");
  return 1;
}

export async function runCliAsync(argv: string[] = process.argv.slice(2)): Promise<number> {
  const result = runCli(argv);
  return typeof result === "number" ? result : result;
}
