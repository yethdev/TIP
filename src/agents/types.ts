import type { Config } from "../config.js";
import type { Provider } from "../providers/index.js";
import type { TokenCount } from "../tokens.js";

export interface AgentNode {
  name: string;
  role: string;
  note: string;
  /** tokens for this node alone, not its children */
  tokens: TokenCount;
  children: AgentNode[];
}

export type ActivityEvent =
  | { kind: "spawn"; name: string; depth: number }
  | { kind: "done"; name: string; depth: number; tokens: number }
  | { kind: "ceiling"; reached: number };

export interface OrchestratorCtx {
  request: string;
  cfg: Config;
  provider: Provider;
  onActivity?: (ev: ActivityEvent) => void;
}
