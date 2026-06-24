/**
 * Re-export the pi package extension for local `-e` smoke tests:
 *   pi -e ./examples/pi-extension-atlas-vision.ts
 *
 * Published install:
 *   pi install npm:atlas-vision-mcp
 */
export { default } from "../extensions/atlas-vision-intercept.js";
