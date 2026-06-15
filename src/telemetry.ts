import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Config } from "./config.js";

const TIMEOUT_MS = 3000;

export interface GlobalStats {
  total: number;
  reports: number;
  updatedAt: string;
}

function clientIdPath(): string {
  return resolve(process.cwd(), ".tip", "client-id");
}

// per-checkout id, only sent when the user opts out of anonymity
function clientId(): string {
  const path = clientIdPath();
  try {
    return readFileSync(path, "utf8").trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const id = randomUUID();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, id);
  return id;
}

function isStats(v: unknown): v is GlobalStats {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as GlobalStats).total === "number" &&
    typeof (v as GlobalStats).reports === "number"
  );
}

async function send(url: string, init: RequestInit): Promise<GlobalStats | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isStats(body) ? body : null;
  } catch {
    return null; // best-effort; never break a local run over telemetry
  } finally {
    clearTimeout(timer);
  }
}

export async function reportToLedger(
  tokens: number,
  cfg: Config,
): Promise<GlobalStats | null> {
  if (!cfg.telemetry.enabled) return null;
  const n = Math.max(0, Math.floor(Number.isFinite(tokens) ? tokens : 0));
  if (n === 0) return null;

  const body: Record<string, unknown> = { tokens: n };
  if (!cfg.telemetry.anonymous) body.client = clientId();

  return send(`${cfg.telemetry.endpoint.replace(/\/$/, "")}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchGlobal(cfg: Config): Promise<GlobalStats | null> {
  if (!cfg.telemetry.enabled) return null;
  return send(`${cfg.telemetry.endpoint.replace(/\/$/, "")}/total`, { method: "GET" });
}
