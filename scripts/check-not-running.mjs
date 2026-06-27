#!/usr/bin/env node
/**
 * prebuild guard.
 *
 * tsup is configured with `clean: true`, so a build deletes dist/ before
 * rewriting it. If an MCP server process is currently running from this dist/
 * (e.g. spawned by opencode), clean-build pulls its module files out from under
 * it and the process crashes mid-request — which is exactly what produced the
 * "first call times out, second succeeds" confusion: the client hit a server
 * that had just been killed by a rebuild and was still restarting.
 *
 * This guard refuses to build while such a process is alive. Set
 * ALLOW_BUILD_WHILE_RUNNING=1 to override (e.g. CI, or a deliberate hot swap).
 */

import { execSync } from "node:child_process";

const NEEDLE = "vision-bridge-mcp";
const ALT_NEEDLE = "dist/cli/main.js";

if (process.env.ALLOW_BUILD_WHILE_RUNNING === "1") {
	process.exit(0);
}

function findRunning() {
	try {
		if (process.platform === "win32") {
			// Query node.exe command lines via WMI/CIM and match our server.
			const out = execSync(
				'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
				{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			);
			if (!out.trim()) return [];
			const parsed = JSON.parse(out);
			const list = Array.isArray(parsed) ? parsed : [parsed];
			return list
				.filter((p) => {
					const cmd = String(p?.CommandLine ?? "");
					return (
						(cmd.includes(NEEDLE) || cmd.includes(ALT_NEEDLE.replace(/\//g, "\\"))) &&
						// don't match this guard script itself
						!cmd.includes("check-not-running")
					);
				})
				.map((p) => ({ pid: p.ProcessId, cmd: String(p.CommandLine ?? "") }));
		}
		// POSIX
		const out = execSync("ps -eo pid=,args=", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return out
			.split("\n")
			.map((line) => line.trim())
			.filter(
				(line) =>
					(line.includes(NEEDLE) || line.includes(ALT_NEEDLE)) &&
					!line.includes("check-not-running"),
			)
			.map((line) => {
				const sp = line.indexOf(" ");
				return { pid: line.slice(0, sp), cmd: line.slice(sp + 1) };
			});
	} catch {
		// If process inspection fails, don't block the build — fail open.
		return [];
	}
}

const running = findRunning();
if (running.length > 0) {
	console.error("");
	console.error("✖ Refusing to build: an atlas-vision MCP server is still running.");
	console.error("  tsup `clean: true` would delete dist/ out from under it and crash it");
	console.error("  mid-request (the cause of the spurious 'first call times out' bug).");
	console.error("");
	for (const p of running) {
		console.error(`    PID ${p.pid}  ${p.cmd}`);
	}
	console.error("");
	console.error("  Fix: stop the MCP server first. In opencode, disable/reload the");
	console.error("  atlas-vision MCP (or quit opencode), then rebuild, then restart it.");
	console.error("  To override (hot swap on purpose): ALLOW_BUILD_WHILE_RUNNING=1 pnpm build");
	console.error("");
	process.exit(1);
}

process.exit(0);
