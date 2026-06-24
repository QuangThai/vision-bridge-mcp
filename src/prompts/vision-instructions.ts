import {
  VISION_INSTRUCTIONS_PROMPT_DESCRIPTION,
  VISION_INSTRUCTIONS_PROMPT_NAME,
  buildVisionInstructionsPrompt,
} from "../capabilities/vision-prompt.js";

export function registerVisionInstructionsPrompt(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
): void {
  server.registerPrompt(
    VISION_INSTRUCTIONS_PROMPT_NAME,
    {
      title: "Atlas Vision Instructions",
      description: VISION_INSTRUCTIONS_PROMPT_DESCRIPTION,
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildVisionInstructionsPrompt(),
          },
        },
      ],
    }),
  );
}
