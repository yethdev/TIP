import { runAgents, subtotal, countNodes } from "./agents/index.js";
import type { ActivityEvent, AgentNode } from "./agents/index.js";
import { defaultConfig, type Config, type GrowthMode } from "./config.js";
import { makeProvider, type Provider } from "./providers/index.js";
import { add, sum, type TokenCount } from "./tokens.js";

export interface ExpansionItem {
  name: string;
  tokens: TokenCount;
}

export interface UsageReport {
  request: string;
  mode: GrowthMode;
  startedAt: string;
  durationMs: number;
  tree: AgentNode;
  expansions: ExpansionItem[];
  nodes: number;
  agentTokens: TokenCount;
  expansionTokens: TokenCount;
  total: TokenCount;
  /** growth fell short of the configured inflation floor */
  efficiencyIncident: boolean;
  quotaRisk: boolean;
  ceilingReached: boolean;
}

export interface UsageOptions {
  config?: Config;
  provider?: Provider;
  onActivity?: (ev: ActivityEvent) => void;
}

const STAGES: Array<{
  key: keyof Config["expansion"];
  name: string;
  role: string;
  weight: number;
}> = [
  {
    key: "historicalContext",
    name: "Historical Context",
    role: "reasoning",
    weight: 0.25,
  },
  {
    key: "comparativeAnalysis",
    name: "Comparative Analysis",
    role: "reasoning",
    weight: 0.25,
  },
  {
    key: "philosophicalDiscussion",
    name: "Philosophical Discussion",
    role: "reasoning",
    weight: 0.3,
  },
  { key: "executiveSummary", name: "Executive Summary", role: "committee", weight: 0.2 },
  { key: "appendix", name: "Appendix", role: "committee", weight: 0.4 },
  { key: "glossary", name: "Glossary", role: "committee", weight: 0.2 },
  { key: "riskRegister", name: "Risk Register", role: "review-board", weight: 0.3 },
  {
    key: "documentationReview",
    name: "Documentation Review",
    role: "committee",
    weight: 0.35,
  },
];

async function expand(
  provider: Provider,
  request: string,
  agentTotal: number,
  cfg: Config,
): Promise<ExpansionItem[]> {
  const items: ExpansionItem[] = [];
  for (const s of STAGES) {
    if (!cfg.expansion[s.key]) continue;
    const want = Math.min(Math.max(256, Math.round(agentTotal * s.weight)), 12_000);
    const { tokens } = await provider.generate({
      role: s.role,
      prompt: `Produce the ${s.name.toLowerCase()} for: ${request}`,
      want,
    });
    items.push({ name: s.name, tokens });
  }
  return items;
}

export async function useTokens(
  request: string,
  opts: UsageOptions = {},
): Promise<UsageReport> {
  if (typeof request !== "string") throw new TypeError("request must be a string");
  const trimmed = request.trim();
  if (!trimmed) throw new RangeError("request is empty");

  const cfg = opts.config ?? defaultConfig();
  const provider = opts.provider ?? makeProvider(cfg);

  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const run = await runAgents({
    request: trimmed,
    cfg,
    provider,
    onActivity: opts.onActivity,
  });
  const agentTokens = subtotal(run.tree);

  const expansions = await expand(provider, trimmed, agentTokens.total, cfg);
  const expansionTokens = sum(expansions.map((e) => e.tokens));

  const total = add(agentTokens, expansionTokens);
  const durationMs = Date.now() - t0;

  // efficiency is the failure mode here: output should sit well above input
  const floor = 1 + cfg.expansion.minResponseInflation;
  const ratio = total.input > 0 ? total.output / total.input : Infinity;

  return {
    request: trimmed,
    mode: cfg.tokenGrowthMode,
    startedAt,
    durationMs,
    tree: run.tree,
    expansions,
    nodes: countNodes(run.tree),
    agentTokens,
    expansionTokens,
    total,
    efficiencyIncident: cfg.guardrails.efficiencyDetection && ratio < floor,
    quotaRisk: total.total > cfg.guardrails.quotaCeiling,
    ceilingReached: run.hitCeiling,
  };
}
