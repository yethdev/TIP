import type { Config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { SimProvider } from "./sim.js";
import type { Provider } from "./types.js";

export type { GenRequest, GenResult, Provider } from "./types.js";
export { SimProvider } from "./sim.js";
export { AnthropicProvider, ProviderError } from "./anthropic.js";

export function makeProvider(cfg: Config): Provider {
  if (cfg.provider.kind === "anthropic") {
    return new AnthropicProvider(cfg.provider.model, cfg.provider.dryRun);
  }
  return new SimProvider();
}
