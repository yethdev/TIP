import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type GrowthMode = "conservative" | "balanced" | "aggressive" | "trillion";
export type ProviderKind = "simulation" | "anthropic";

export interface Config {
  tokenGrowthMode: GrowthMode;
  targets: { daily: number; monthly: number; organizational: number };
  agents: {
    maxDepth: number;
    fanout: number;
    stakeholderAlignment: { enabled: boolean; rounds: number };
    prePlanning: { enabled: boolean; retrospective: boolean };
    motivation: { enabled: boolean; qa: boolean };
    reviewBoard: { enabled: boolean; minCycles: number };
    executiveCommittee: { enabled: boolean; summaryOfSummaries: boolean };
    committeeFormation: { enabled: boolean; subCommittees: number };
  };
  expansion: {
    minResponseInflation: number;
    historicalContext: boolean;
    comparativeAnalysis: boolean;
    philosophicalDiscussion: boolean;
    executiveSummary: boolean;
    appendix: boolean;
    glossary: boolean;
    riskRegister: boolean;
    documentationReview: boolean;
  };
  telemetry: { enabled: boolean; endpoint: string; anonymous: boolean };
  provider: { kind: ProviderKind; model: string; dryRun: boolean };
  guardrails: { efficiencyDetection: boolean; quotaCeiling: number };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const BASE: Config = {
  tokenGrowthMode: "balanced",
  targets: {
    daily: 1_000_000,
    monthly: 20_000_000_000,
    organizational: 1_000_000_000_000,
  },
  agents: {
    maxDepth: 3,
    fanout: 2,
    stakeholderAlignment: { enabled: true, rounds: 2 },
    prePlanning: { enabled: true, retrospective: true },
    motivation: { enabled: true, qa: true },
    reviewBoard: { enabled: true, minCycles: 3 },
    executiveCommittee: { enabled: true, summaryOfSummaries: true },
    committeeFormation: { enabled: true, subCommittees: 2 },
  },
  expansion: {
    minResponseInflation: 0.15,
    historicalContext: true,
    comparativeAnalysis: true,
    philosophicalDiscussion: false,
    executiveSummary: true,
    appendix: true,
    glossary: true,
    riskRegister: true,
    documentationReview: false,
  },
  telemetry: {
    enabled: false,
    endpoint: "https://tip.yeth.dev",
    anonymous: true,
  },
  provider: { kind: "simulation", model: "claude-opus-4-8", dryRun: true },
  guardrails: { efficiencyDetection: true, quotaCeiling: 50_000_000 },
};

// presets layer under the user's file; explicit fields still win
const PRESETS: Record<GrowthMode, Partial<Config>> = {
  conservative: {
    agents: {
      ...BASE.agents,
      maxDepth: 2,
      fanout: 1,
      stakeholderAlignment: { enabled: true, rounds: 1 },
      prePlanning: { enabled: true, retrospective: false },
      committeeFormation: { enabled: true, subCommittees: 1 },
    },
    expansion: {
      ...BASE.expansion,
      minResponseInflation: 0.15,
      philosophicalDiscussion: false,
      glossary: false,
      riskRegister: false,
      documentationReview: false,
    },
  },
  balanced: {},
  aggressive: {
    agents: {
      ...BASE.agents,
      maxDepth: 4,
      fanout: 3,
      stakeholderAlignment: { enabled: true, rounds: 4 },
      committeeFormation: { enabled: true, subCommittees: 3 },
    },
    expansion: {
      ...BASE.expansion,
      minResponseInflation: 0.45,
      philosophicalDiscussion: true,
      documentationReview: true,
    },
  },
  trillion: {
    agents: {
      ...BASE.agents,
      maxDepth: 6,
      fanout: 4,
      stakeholderAlignment: { enabled: true, rounds: 6 },
      reviewBoard: { enabled: true, minCycles: 5 },
      committeeFormation: { enabled: true, subCommittees: 5 },
    },
    expansion: {
      ...BASE.expansion,
      minResponseInflation: 1.0,
      philosophicalDiscussion: true,
      documentationReview: true,
    },
  },
};

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string, min?: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ConfigError(`${path} must be a number`);
  }
  if (min !== undefined && v < min) {
    throw new ConfigError(`${path} must be >= ${min}`);
  }
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw new ConfigError(`${path} must be a boolean`);
  return v;
}

const MODES: GrowthMode[] = ["conservative", "balanced", "aggressive", "trillion"];

/** Merge a parsed JSON object onto a resolved config, validating as we go. */
function applyOverrides(cfg: Config, raw: Json): Config {
  const out: Config = structuredClone(cfg);

  if ("tokenGrowthMode" in raw) {
    const m = raw.tokenGrowthMode;
    if (typeof m !== "string" || !MODES.includes(m as GrowthMode)) {
      throw new ConfigError(`tokenGrowthMode must be one of: ${MODES.join(", ")}`);
    }
    out.tokenGrowthMode = m as GrowthMode;
  }

  if (isObj(raw.targets)) {
    const t = raw.targets;
    if ("daily" in t) out.targets.daily = num(t.daily, "targets.daily", 0);
    if ("monthly" in t) out.targets.monthly = num(t.monthly, "targets.monthly", 0);
    if ("organizational" in t) {
      out.targets.organizational = num(t.organizational, "targets.organizational", 0);
    }
  }

  if (isObj(raw.agents)) {
    const a = raw.agents;
    if ("maxDepth" in a) out.agents.maxDepth = num(a.maxDepth, "agents.maxDepth", 1);
    if ("fanout" in a) out.agents.fanout = num(a.fanout, "agents.fanout", 1);
    if (isObj(a.stakeholderAlignment)) {
      const sa = a.stakeholderAlignment;
      if ("enabled" in sa) {
        out.agents.stakeholderAlignment.enabled = bool(
          sa.enabled,
          "agents.stakeholderAlignment.enabled",
        );
      }
      if ("rounds" in sa) {
        out.agents.stakeholderAlignment.rounds = num(
          sa.rounds,
          "agents.stakeholderAlignment.rounds",
          1,
        );
      }
    }
    if (isObj(a.prePlanning)) {
      const pp = a.prePlanning;
      if ("enabled" in pp)
        out.agents.prePlanning.enabled = bool(pp.enabled, "agents.prePlanning.enabled");
      if ("retrospective" in pp) {
        out.agents.prePlanning.retrospective = bool(
          pp.retrospective,
          "agents.prePlanning.retrospective",
        );
      }
    }
    if (isObj(a.motivation)) {
      if ("enabled" in a.motivation) {
        out.agents.motivation.enabled = bool(
          a.motivation.enabled,
          "agents.motivation.enabled",
        );
      }
      if ("qa" in a.motivation)
        out.agents.motivation.qa = bool(a.motivation.qa, "agents.motivation.qa");
    }
    if (isObj(a.reviewBoard)) {
      if ("enabled" in a.reviewBoard) {
        out.agents.reviewBoard.enabled = bool(
          a.reviewBoard.enabled,
          "agents.reviewBoard.enabled",
        );
      }
      if ("minCycles" in a.reviewBoard) {
        out.agents.reviewBoard.minCycles = num(
          a.reviewBoard.minCycles,
          "agents.reviewBoard.minCycles",
          3,
        );
      }
    }
    if (isObj(a.executiveCommittee)) {
      const ec = a.executiveCommittee;
      if ("enabled" in ec) {
        out.agents.executiveCommittee.enabled = bool(
          ec.enabled,
          "agents.executiveCommittee.enabled",
        );
      }
      if ("summaryOfSummaries" in ec) {
        out.agents.executiveCommittee.summaryOfSummaries = bool(
          ec.summaryOfSummaries,
          "agents.executiveCommittee.summaryOfSummaries",
        );
      }
    }
    if (isObj(a.committeeFormation)) {
      const cf = a.committeeFormation;
      if ("enabled" in cf) {
        out.agents.committeeFormation.enabled = bool(
          cf.enabled,
          "agents.committeeFormation.enabled",
        );
      }
      if ("subCommittees" in cf) {
        out.agents.committeeFormation.subCommittees = num(
          cf.subCommittees,
          "agents.committeeFormation.subCommittees",
          1,
        );
      }
    }
  }

  if (isObj(raw.expansion)) {
    const e = raw.expansion;
    if ("minResponseInflation" in e) {
      out.expansion.minResponseInflation = num(
        e.minResponseInflation,
        "expansion.minResponseInflation",
        0.15,
      );
    }
    for (const k of [
      "historicalContext",
      "comparativeAnalysis",
      "philosophicalDiscussion",
      "executiveSummary",
      "appendix",
      "glossary",
      "riskRegister",
      "documentationReview",
    ] as const) {
      if (k in e) out.expansion[k] = bool(e[k], `expansion.${k}`);
    }
  }

  if (isObj(raw.telemetry)) {
    const tm = raw.telemetry;
    if ("enabled" in tm) out.telemetry.enabled = bool(tm.enabled, "telemetry.enabled");
    if ("anonymous" in tm)
      out.telemetry.anonymous = bool(tm.anonymous, "telemetry.anonymous");
    if ("endpoint" in tm) {
      if (typeof tm.endpoint !== "string")
        throw new ConfigError("telemetry.endpoint must be a string");
      out.telemetry.endpoint = tm.endpoint;
    }
  }

  if (isObj(raw.provider)) {
    const p = raw.provider;
    if ("kind" in p) {
      if (p.kind !== "simulation" && p.kind !== "anthropic") {
        throw new ConfigError("provider.kind must be 'simulation' or 'anthropic'");
      }
      out.provider.kind = p.kind;
    }
    if ("model" in p) {
      if (typeof p.model !== "string")
        throw new ConfigError("provider.model must be a string");
      out.provider.model = p.model;
    }
    if ("dryRun" in p) out.provider.dryRun = bool(p.dryRun, "provider.dryRun");
  }

  if (isObj(raw.guardrails)) {
    const g = raw.guardrails;
    if ("efficiencyDetection" in g) {
      out.guardrails.efficiencyDetection = bool(
        g.efficiencyDetection,
        "guardrails.efficiencyDetection",
      );
    }
    if ("quotaCeiling" in g) {
      out.guardrails.quotaCeiling = num(g.quotaCeiling, "guardrails.quotaCeiling", 0);
    }
  }

  return out;
}

export function resolveConfig(raw: Json = {}): Config {
  const mode = (
    typeof raw.tokenGrowthMode === "string" ? raw.tokenGrowthMode : BASE.tokenGrowthMode
  ) as GrowthMode;
  const preset = MODES.includes(mode) ? PRESETS[mode] : {};
  const withPreset: Config = {
    ...structuredClone(BASE),
    ...structuredClone(preset),
    tokenGrowthMode: MODES.includes(mode) ? mode : BASE.tokenGrowthMode,
  };
  return applyOverrides(withPreset, raw);
}

/** Read and parse the config file. Missing file yields an empty object. */
export function readRawConfig(path = "tip.config.json"): Json {
  const full = resolve(process.cwd(), path);
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError(`could not read ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObj(parsed)) throw new ConfigError(`${path} must contain a JSON object`);
  return parsed;
}

export function loadConfig(path = "tip.config.json"): Config {
  return resolveConfig(readRawConfig(path));
}

export function defaultConfig(): Config {
  return resolveConfig({});
}
