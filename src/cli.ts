#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";

import { readRawConfig, resolveConfig, type Config, type GrowthMode } from "./config.js";
import { subtotal, type AgentNode } from "./agents/index.js";
import { useTokens, type UsageReport } from "./usage.js";
import {
  buildComplianceReport,
  clearLedger,
  loadLedger,
  recordUsage,
  summarize,
} from "./analytics.js";
import { fetchGlobal, reportToLedger } from "./telemetry.js";
import { format } from "./tokens.js";
import { version } from "./index.js";

const ATTRIBUTION =
  "Powered by TIP, where every solution deserves additional layers of review.";
const MODES: GrowthMode[] = ["conservative", "balanced", "aggressive", "trillion"];

interface Args {
  cmd: string;
  rest: string[];
  flags: {
    mode?: string;
    config?: string;
    json: boolean;
    quiet: boolean;
    tree: boolean;
    noTelemetry: boolean;
    help: boolean;
    version: boolean;
  };
}

const KNOWN = new Set([
  "use",
  "status",
  "agents",
  "report",
  "config",
  "ledger",
  "init",
  "forget",
  "help",
]);

function parse(argv: string[]): Args {
  const flags: Args["flags"] = {
    json: false,
    quiet: false,
    tree: false,
    noTelemetry: false,
    help: false,
    version: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    switch (a) {
      case "--mode":
        flags.mode = argv[++i];
        break;
      case "--config":
        flags.config = argv[++i];
        break;
      case "--json":
        flags.json = true;
        break;
      case "--quiet":
      case "-q":
        flags.quiet = true;
        break;
      case "--tree":
        flags.tree = true;
        break;
      case "--no-telemetry":
        flags.noTelemetry = true;
        break;
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "-v":
      case "--version":
        flags.version = true;
        break;
      default:
        positional.push(a);
    }
  }

  const head = positional[0];
  if (head && KNOWN.has(head)) {
    return { cmd: head, rest: positional.slice(1), flags };
  }
  // bare `tip "do the thing"` is shorthand for use
  return { cmd: "use", rest: positional, flags };
}

function resolveCfg(args: Args): Config {
  const raw = readRawConfig(args.flags.config ?? "tip.config.json");
  if (args.flags.mode) {
    if (!MODES.includes(args.flags.mode as GrowthMode)) {
      throw new Error(`--mode must be one of: ${MODES.join(", ")}`);
    }
    // inject the override before resolve so the mode's preset is applied
    raw.tokenGrowthMode = args.flags.mode;
  }
  const cfg = resolveConfig(raw);
  if (args.flags.noTelemetry) cfg.telemetry.enabled = false;
  return cfg;
}

function out(s = ""): void {
  process.stdout.write(`${s}\n`);
}

function banner(): void {
  out(pc.bold(pc.green("  TIP")) + pc.dim("  ·  Token Improvement Plan"));
}

function modeTag(mode: GrowthMode): string {
  const color =
    mode === "trillion" ? pc.magenta : mode === "aggressive" ? pc.yellow : pc.green;
  return color(mode);
}

async function cmdUse(args: Args): Promise<number> {
  const request = args.rest.join(" ").trim();
  if (!request) {
    out(pc.red('usage: tip use "<request>"'));
    return 2;
  }

  const cfg = resolveCfg(args);
  let spawned = 0;
  let last = 0;
  const onActivity =
    args.flags.quiet || args.flags.json
      ? undefined
      : (ev: { kind: string }): void => {
          if (ev.kind !== "spawn") return;
          spawned++;
          const now = Date.now();
          // throttle the redraw; trillion mode spawns thousands of nodes
          if (now - last > 80) {
            process.stdout.write(
              `\r  ${pc.dim("spawning agents…")} ${pc.green(String(spawned))}   `,
            );
            last = now;
          }
        };

  const report = await useTokens(request, { config: cfg, onActivity });
  if (onActivity) process.stdout.write("\r" + " ".repeat(40) + "\r");

  const ledger = recordUsage(report);

  if (args.flags.json) {
    const global = await reportToLedger(report.total.total, cfg);
    out(JSON.stringify({ report, global }, null, 2));
    return report.efficiencyIncident ? 3 : 0;
  }

  // show the report immediately; only the shared-ledger line waits on the network
  printReport(report, cfg, args.flags.tree);
  const stats = summarize(ledger, cfg.targets.organizational);
  out();
  out(
    pc.dim(
      `  lifetime: ${format(stats.lifetime.total)} tokens across ${stats.sessions} session(s)`,
    ),
  );
  const global = await reportToLedger(report.total.total, cfg);
  if (global)
    out(pc.dim(`  global ledger: ${format(global.total)} tokens used across all users`));
  out(pc.dim(`  ${ATTRIBUTION}`));
  return report.efficiencyIncident ? 3 : 0;
}

function printReport(report: UsageReport, cfg: Config, showTree: boolean): void {
  banner();
  out();
  out(`  request   ${pc.white(truncate(report.request, 60))}`);
  out(`  mode      ${modeTag(report.mode)}`);
  out(
    `  agents    ${pc.white(String(report.nodes))}  ${pc.dim(`(${report.durationMs}ms)`)}`,
  );
  out();

  out(pc.bold("  Org chart"));
  renderTree(report.tree, showTree);
  out();

  if (report.expansions.length) {
    out(pc.bold("  Response expansion"));
    for (const e of report.expansions) {
      out(
        `  ${pc.dim("•")} ${e.name.padEnd(24)} ${pc.green(format(e.tokens.total))} tok`,
      );
    }
    out();
  }

  out(pc.bold("  Tokens"));
  out(`  ${"agents".padEnd(24)} ${pc.green(format(report.agentTokens.total))}`);
  out(`  ${"expansion".padEnd(24)} ${pc.green(format(report.expansionTokens.total))}`);
  out(
    `  ${pc.bold("total".padEnd(24))} ${pc.bold(pc.green(format(report.total.total)))}  ${pc.dim(`(${report.total.total.toLocaleString()})`)}`,
  );

  if (report.ceilingReached) {
    out(pc.yellow(`  note: agent ceiling reached; fan-out was capped this run`));
  }
  if (report.quotaRisk) {
    out(
      pc.yellow(
        `  note: run exceeded quotaCeiling (${format(cfg.guardrails.quotaCeiling)})`,
      ),
    );
  }
  if (report.efficiencyIncident) {
    out(
      pc.red(
        `  efficiency incident: growth fell below the ${cfg.expansion.minResponseInflation}× floor`,
      ),
    );
  }
}

function renderTree(node: AgentNode, deep: boolean): void {
  out(`  ${pc.white(node.name)} ${pc.dim(`· ${format(node.tokens.total)} tok`)}`);
  node.children.forEach((child, i) => {
    printNode(child, "  ", i === node.children.length - 1, deep);
  });
}

function printNode(node: AgentNode, prefix: string, last: boolean, deep: boolean): void {
  const branch = last ? "└─ " : "├─ ";
  const tail = deep ? "tok" : "tok subtree";
  out(
    `${pc.dim(prefix + branch)}${node.name} ${pc.dim(`· ${format(subtotal(node).total)} ${tail}`)}`,
  );
  if (!deep) return;
  const next = prefix + (last ? "   " : "│  ");
  node.children.forEach((child, i) => {
    printNode(child, next, i === node.children.length - 1, deep);
  });
}

function cmdStatus(args: Args): number {
  const cfg = resolveCfg(args);
  const led = loadLedger();
  const a = summarize(led, cfg.targets.organizational);

  if (args.flags.json) {
    out(JSON.stringify(a, null, 2));
    return 0;
  }

  banner();
  out();
  out(
    `  lifetime tokens     ${pc.green(format(a.lifetime.total))}  ${pc.dim(`(${a.lifetime.total.toLocaleString()})`)}`,
  );
  out(`  sessions            ${pc.white(String(a.sessions))}`);
  out(`  avg / session       ${pc.white(format(Math.round(a.avgPerSession)))}`);
  out(`  largest run         ${pc.white(format(a.largest))}`);
  out(
    `  efficiency incidents ${a.efficiencyIncidents > 0 ? pc.red(String(a.efficiencyIncidents)) : pc.green("0")}`,
  );
  out();
  const bar = progressBar(a.progressToOrg);
  out(
    `  toward ${format(cfg.targets.organizational)}  ${bar}  ${(a.progressToOrg * 100).toFixed(6)}%`,
  );
  if (a.etaSessions === null) {
    out(pc.dim("  ETA to target: unknown (no sessions recorded)"));
  } else if (a.etaSessions === 0) {
    out(pc.green("  target reached. Consider raising it."));
  } else {
    out(
      pc.dim(
        `  ETA to target: ${a.etaSessions.toLocaleString()} more session(s) at current pace`,
      ),
    );
  }
  return 0;
}

function progressBar(frac: number): string {
  const width = 24;
  const filled = Math.max(0, Math.min(width, Math.round(frac * width)));
  return pc.green("█".repeat(filled)) + pc.dim("░".repeat(width - filled));
}

function cmdAgents(args: Args): number {
  const cfg = resolveCfg(args);
  banner();
  out();
  out(
    `  mode ${modeTag(cfg.tokenGrowthMode)}  ·  maxDepth ${cfg.agents.maxDepth}  ·  fan-out ${cfg.agents.fanout}`,
  );
  out();
  out(`  ${pc.white("Primary Agent")}`);
  out(
    `  ${pc.dim("├─")} Reasoning Agent ${pc.dim(`(recurses to depth ${cfg.agents.maxDepth})`)}`,
  );
  out(`  ${pc.dim("├─")} Validation Agent ${pc.dim("→ Re-Validation Pass")}`);
  out(`  ${pc.dim("├─")} Poetry Agent ${pc.dim("→ Second Stanza, Poetry Peer Review")}`);
  if (cfg.agents.reviewBoard.enabled) {
    out(
      `  ${pc.dim("├─")} Token Utilization Review Board ${pc.dim(`(${cfg.agents.reviewBoard.minCycles} cycles)`)}`,
    );
    if (cfg.agents.executiveCommittee.enabled) {
      const sos = cfg.agents.executiveCommittee.summaryOfSummaries
        ? " → Summary of Summaries"
        : "";
      out(`  ${pc.dim("│")}  ${pc.dim("└─")} Executive Token Committee${pc.dim(sos)}`);
    }
  }
  if (cfg.agents.motivation.enabled) {
    const qa = cfg.agents.motivation.qa ? ", Motivation QA Agent" : "";
    out(
      `  ${pc.dim("└─")} Motivation Agent ${pc.dim(`→ motivates every other agent${qa}`)}`,
    );
  }
  return 0;
}

function cmdReport(args: Args): number {
  const cfg = resolveCfg(args);
  const led = loadLedger();
  const year = new Date().getFullYear();
  out(buildComplianceReport(led, cfg.targets.organizational, year));
  return 0;
}

function cmdConfig(args: Args): number {
  const cfg = resolveCfg(args);
  out(JSON.stringify(cfg, null, 2));
  return 0;
}

async function cmdLedger(args: Args): Promise<number> {
  const cfg = resolveCfg(args);
  if (!cfg.telemetry.enabled) {
    out(
      pc.yellow(
        "  telemetry is disabled; enable it in tip.config.json to read the shared ledger",
      ),
    );
    return 0;
  }
  const g = await fetchGlobal(cfg);
  if (!g) {
    out(pc.yellow("  ledger unreachable. Showing local totals only."));
    const led = loadLedger();
    out(`  local lifetime: ${format(led.total.total)} tokens`);
    return 0;
  }
  if (args.flags.json) {
    out(JSON.stringify(g, null, 2));
    return 0;
  }
  banner();
  out();
  out(
    `  global tokens used     ${pc.green(format(g.total))}  ${pc.dim(`(${g.total.toLocaleString()})`)}`,
  );
  out(`  reports received       ${pc.white(g.reports.toLocaleString())}`);
  out(`  updated                ${pc.dim(g.updatedAt)}`);
  return 0;
}

function cmdInit(args: Args): number {
  const path = resolve(process.cwd(), args.flags.config ?? "tip.config.json");
  if (existsSync(path)) {
    out(pc.yellow(`  ${path} already exists; leaving it untouched`));
    return 0;
  }
  const starter = {
    $schema: "./tip.schema.json",
    tokenGrowthMode: "aggressive",
    telemetry: {
      enabled: false,
      endpoint: "https://tip.yeth.dev",
      anonymous: true,
    },
    provider: { kind: "simulation", model: "claude-opus-4-8", dryRun: true },
  };
  writeFileSync(path, JSON.stringify(starter, null, 2) + "\n");
  out(pc.green(`  wrote ${path}`));
  out(pc.dim("  edit tokenGrowthMode to taste; aggressive is a fine starting point"));
  return 0;
}

function cmdForget(): number {
  clearLedger();
  out(pc.green("  local ledger cleared"));
  return 0;
}

function help(): void {
  banner();
  out();
  out("  Infrastructure for increasing token usage in your workflows.");
  out();
  out(pc.bold("  Usage"));
  out("    tip <command> [options]");
  out('    tip "<request>"            shorthand for: tip use "<request>"');
  out();
  out(pc.bold("  Commands"));
  out(`    use "<request>"     run the growth pipeline on a request`);
  out("    status             local consumption and progress to target");
  out("    agents             show the configured agent org chart");
  out("    report             generate the annual compliance report");
  out("    ledger             read the shared global ledger");
  out("    config             print the resolved configuration");
  out("    init               scaffold a tip.config.json");
  out("    forget             clear the local ledger (right-to-erasure)");
  out();
  out(pc.bold("  Options"));
  out("    --mode <m>         conservative | balanced | aggressive | trillion");
  out("    --config <path>    config file (default tip.config.json)");
  out("    --tree             show the full agent tree");
  out("    --json             machine-readable output");
  out("    --no-telemetry     don't report this run to the shared ledger");
  out("    -q, --quiet        suppress progress");
  out("    -h, --help         this text");
  out("    -v, --version      print version");
  out();
  out(pc.dim(`  ${ATTRIBUTION}`));
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  if (args.flags.version) {
    out(version);
    return 0;
  }
  if (args.flags.help || args.cmd === "help") {
    help();
    return 0;
  }

  switch (args.cmd) {
    case "use":
      return cmdUse(args);
    case "status":
      return cmdStatus(args);
    case "agents":
      return cmdAgents(args);
    case "report":
      return cmdReport(args);
    case "config":
      return cmdConfig(args);
    case "ledger":
      return cmdLedger(args);
    case "init":
      return cmdInit(args);
    case "forget":
      return cmdForget();
    default:
      help();
      return 2;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// set exitCode rather than process.exit() so stdout finishes flushing first
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${pc.red("error:")} ${msg}\n`);
    process.exitCode = 1;
  });
