import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { add, format, zero, type TokenCount } from "./tokens.js";
import type { GrowthMode } from "./config.js";
import type { UsageReport } from "./usage.js";

const LEDGER_VERSION = 1 as const;
const REQUEST_KEEP = 80; // keep only a short, redacted slice of each request

export class AnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsError";
  }
}

export interface LedgerEntry {
  at: string;
  request: string;
  mode: GrowthMode;
  nodes: number;
  total: TokenCount;
  efficiencyIncident: boolean;
}

export interface Ledger {
  version: typeof LEDGER_VERSION;
  createdAt: string;
  total: TokenCount;
  efficiencyIncidents: number;
  entries: LedgerEntry[];
}

export interface Analytics {
  lifetime: TokenCount;
  sessions: number;
  byMode: Record<string, number>;
  avgPerSession: number;
  largest: number;
  efficiencyIncidents: number;
  progressToOrg: number;
  etaSessions: number | null;
}

export function ledgerPath(): string {
  return resolve(process.cwd(), ".tip", "ledger.json");
}

function fresh(now: string): Ledger {
  return {
    version: LEDGER_VERSION,
    createdAt: now,
    total: zero(),
    efficiencyIncidents: 0,
    entries: [],
  };
}

export function loadLedger(path = ledgerPath()): Ledger {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fresh(new Date().toISOString());
    }
    throw new AnalyticsError(
      `could not read ledger at ${path}: ${(err as Error).message}`,
    );
  }

  try {
    const data = JSON.parse(text) as Ledger;
    if (data.version !== LEDGER_VERSION || !Array.isArray(data.entries)) {
      throw new AnalyticsError(`ledger at ${path} has an unexpected shape`);
    }
    return data;
  } catch (err) {
    if (err instanceof AnalyticsError) throw err;
    throw new AnalyticsError(`ledger at ${path} is corrupt: ${(err as Error).message}`);
  }
}

function persist(led: Ledger, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  // write-then-rename so a crash mid-write can't truncate the ledger
  const tmp = join(dirname(path), `.ledger.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(led, null, 2));
  renameSync(tmp, path);
}

export function recordUsage(report: UsageReport, path = ledgerPath()): Ledger {
  const led = loadLedger(path);
  const entry: LedgerEntry = {
    at: report.startedAt,
    request: report.request.slice(0, REQUEST_KEEP),
    mode: report.mode,
    nodes: report.nodes,
    total: report.total,
    efficiencyIncident: report.efficiencyIncident,
  };
  led.entries.push(entry);
  led.total = add(led.total, report.total);
  if (report.efficiencyIncident) led.efficiencyIncidents++;
  persist(led, path);
  return led;
}

// right-to-erasure: wipe the local ledger
export function clearLedger(path = ledgerPath()): Ledger {
  const led = fresh(new Date().toISOString());
  persist(led, path);
  return led;
}

export function summarize(led: Ledger, orgTarget: number): Analytics {
  const sessions = led.entries.length;
  const byMode: Record<string, number> = {};
  let largest = 0;
  for (const e of led.entries) {
    byMode[e.mode] = (byMode[e.mode] ?? 0) + e.total.total;
    if (e.total.total > largest) largest = e.total.total;
  }
  const lifetime = led.total;
  const avg = sessions > 0 ? lifetime.total / sessions : 0;
  const remaining = Math.max(orgTarget - lifetime.total, 0);
  const eta =
    avg > 0 && remaining > 0 ? Math.ceil(remaining / avg) : remaining === 0 ? 0 : null;

  return {
    lifetime,
    sessions,
    byMode,
    avgPerSession: avg,
    largest,
    efficiencyIncidents: led.efficiencyIncidents,
    progressToOrg: orgTarget > 0 ? Math.min(lifetime.total / orgTarget, 1) : 0,
    etaSessions: eta,
  };
}

// the annual report TCML clause 6 says must exist (but need not be sent anywhere)
export function buildComplianceReport(
  led: Ledger,
  orgTarget: number,
  year: number,
): string {
  const a = summarize(led, orgTarget);
  const pct = (a.progressToOrg * 100).toFixed(6);
  const shortfall = Math.max(orgTarget - a.lifetime.total, 0);

  const lines = [
    `# Annual Token Consumption Report - ${year}`,
    "",
    "## 1. Summary of Token Consumption",
    `Across ${a.sessions} session(s) this period, total recorded consumption was ${format(a.lifetime.total)} tokens (${a.lifetime.total.toLocaleString()}).`,
    `That represents ${pct}% of the ${format(orgTarget)} organizational target.`,
    "",
    "## 2. Why Consumption Was Insufficient",
    `Consumption fell short of the organizational target by ${format(shortfall)} tokens.`,
    a.efficiencyIncidents > 0
      ? `${a.efficiencyIncidents} efficiency incident(s) were recorded, each representing growth that did not clear the inflation floor.`
      : "No efficiency incidents were recorded, though vigilance remains warranted.",
    "",
    "## 3. Plan to Increase Consumption Next Year",
    "- Raise tokenGrowthMode by at least one tier.",
    "- Add one agent, then add oversight for that agent.",
    "- Introduce a pre-planning process and a retrospective for the pre-planning process.",
    "- Schedule a review of this report, followed by a review of that review.",
    "",
    "## 4. Risk Assessment: Accidental Efficiency",
    a.avgPerSession > 0
      ? `Average per-session consumption is ${format(Math.round(a.avgPerSession))} tokens. Any decline should be escalated to the oversight committee.`
      : "No sessions recorded yet. The primary risk this period is inaction.",
    "",
    "_This report exists in satisfaction of TCML clause 6 and is not submitted to anyone._",
  ];
  return lines.join("\n");
}
