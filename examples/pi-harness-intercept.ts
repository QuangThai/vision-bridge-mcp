/**
 * Example: pi / harness auto-intercept for text-only main models.
 *
 * Prefer importing `interceptImagesForTextModel` from the package root or
 * `src/harness/index.ts` in production harness code.
 */
import { interceptImagesForTextModel } from "../src/harness/index.js";

export { interceptImagesForTextModel };

// Usage:
// const { messageText, intercepted, plan } = await interceptImagesForTextModel({
//   mainModelRef: "deepseek/deepseek-v4-flash",
//   messageText: "Fix the bug in ./screenshots/error.png",
// });
