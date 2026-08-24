/**
 * openkai/index — the layer's single entry (E021). Attaches via sdk.ts's
 * inlineExtensions seam (the same path autoresearch uses) — NOT the
 * file-based capability providers, which feed discovery lists, not the live
 * session's tool set.
 */

import type { CustomTool } from "../extensibility/custom-tools/types.js";
import { fusionTool } from "./fusion-tool.js";
import { rlmSpawn, rlmCollect } from "./rlm-tools.js";
import { cortexManaged, cortexSearchTool, cortexRecordTool } from "./cortex-memory.js";

export { default as openkaiShift } from "./shift-extension.js";
export { default as openkaiFloor } from "./floor-extension.js";
export { default as openkaiKeywords } from "./keywords-extension.js";

/** The OpenKai built-in tools: fusion + RLM recursion always; Cortex in managed mode. */
export function openkaiBuiltinTools(): CustomTool[] {
  // The typed tools carry their specific param schemas; the loader's
  // CustomTool<TSchema, any> widening is the fork's own idiom (sdk.ts casts
  // the image-gen/tts tools the same way).
  const tools: CustomTool[] = [fusionTool, rlmSpawn, rlmCollect] as unknown as CustomTool[];
  if (cortexManaged()) tools.push(cortexSearchTool as unknown as CustomTool, cortexRecordTool as unknown as CustomTool);
  return tools;
}
