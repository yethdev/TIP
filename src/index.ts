export const version = "1.0.0";

export { useTokens } from "./usage.js";
export type { UsageReport, UsageOptions, ExpansionItem } from "./usage.js";

export { loadConfig, resolveConfig, defaultConfig, ConfigError } from "./config.js";
export type { Config, GrowthMode, ProviderKind } from "./config.js";

export {
  makeProvider,
  SimProvider,
  AnthropicProvider,
  ProviderError,
} from "./providers/index.js";
export type { Provider, GenRequest, GenResult } from "./providers/index.js";

export { runAgents, subtotal, countNodes, flatten } from "./agents/index.js";
export type {
  AgentNode,
  AgentRun,
  ActivityEvent,
  OrchestratorCtx,
} from "./agents/index.js";

export {
  loadLedger,
  recordUsage,
  clearLedger,
  summarize,
  buildComplianceReport,
  ledgerPath,
  AnalyticsError,
} from "./analytics.js";
export type { Ledger, LedgerEntry, Analytics } from "./analytics.js";

export { reportToLedger, fetchGlobal } from "./telemetry.js";
export type { GlobalStats } from "./telemetry.js";

export {
  estimateTokens,
  count as countTokens,
  format as formatTokens,
  add as addTokens,
  sum as sumTokens,
  zero as zeroTokens,
} from "./tokens.js";
export type { TokenCount } from "./tokens.js";
