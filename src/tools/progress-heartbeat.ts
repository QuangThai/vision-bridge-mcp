import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Keep a long-running tool call alive by periodically emitting MCP progress
 * notifications. Clients that pass `resetTimeoutOnProgress: true` to `callTool`
 * (opencode does) reset their request timeout on every progress event, so the
 * call never trips the MCP SDK's 60s `DEFAULT_REQUEST_TIMEOUT_MSEC` default.
 *
 * IMPORTANT: this only works when the client supplied a `progressToken`. The SDK
 * generates one automatically whenever the caller passes an `onprogress`
 * callback to `callTool`. If the token is absent the heartbeat CANNOT run and
 * the call falls back to the 60s timeout — so we log loudly instead of failing
 * silently, otherwise a future client change would resurrect the timeout bug
 * with no trace. (console.* is redirected to stderr by setupConsoleRedirection,
 * so this is safe for a stdio server.)
 */
export function startProgressHeartbeat(
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): () => void {
	const progressToken = extra._meta?.progressToken;
	if (progressToken === undefined) {
		console.warn(
			"[heartbeat] no progressToken on request — progress heartbeat DISABLED; " +
				"long calls (>60s) may be aborted by the client's default request timeout. " +
				"The client must pass an onprogress callback to callTool for the token to exist.",
		);
		return () => {};
	}

	let step = 0;
	const interval = setInterval(() => {
		step++;
		extra
			.sendNotification({
				method: "notifications/progress",
				params: { progressToken, progress: step, total: 100 },
			} as ServerNotification)
			.catch((err) => {
				console.warn(`[heartbeat] sendNotification failed (step ${step}): ${String(err)}`);
			});
	}, HEARTBEAT_INTERVAL_MS);

	return () => clearInterval(interval);
}
