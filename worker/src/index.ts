import { DurableObject } from "cloudflare:workers";

export interface Env {
  LEDGER: DurableObjectNamespace<Ledger>;
}

interface Snapshot {
  total: number;
  reports: number;
  updatedAt: string;
}

// cap per report so one client can't distort the shared total
const MAX_PER_REPORT = 1_000_000_000_000;
const RATE_LIMIT = 60; // reports per IP per window
const WINDOW_MS = 60_000;

const ALLOWED_ORIGINS = new Set([
  "https://yethdev.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Every report funnels through one instance ("global") so the total stays
// atomic. A coordination point, not a sharded counter - right for a single sum.
export class Ledger extends DurableObject<Env> {
  private total = 0;
  private reports = 0;
  private updatedAt = "";
  private readonly hits = new Map<string, { count: number; start: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.total = (await ctx.storage.get<number>("total")) ?? 0;
      this.reports = (await ctx.storage.get<number>("reports")) ?? 0;
      this.updatedAt =
        (await ctx.storage.get<string>("updatedAt")) ?? new Date(0).toISOString();
    });
  }

  async bump(tokens: number): Promise<Snapshot> {
    // increment synchronously before any await so concurrent calls can't race
    this.total += tokens;
    this.reports += 1;
    this.updatedAt = new Date().toISOString();
    await this.ctx.storage.put({
      total: this.total,
      reports: this.reports,
      updatedAt: this.updatedAt,
    });
    return this.snapshot();
  }

  async read(): Promise<Snapshot> {
    return this.snapshot();
  }

  // fixed-window limiter; all reports hit this instance so it sees everything
  allow(ip: string): boolean {
    const now = Date.now();
    const rec = this.hits.get(ip);
    if (!rec || now - rec.start > WINDOW_MS) {
      this.hits.set(ip, { count: 1, start: now });
      return true;
    }
    if (rec.count >= RATE_LIMIT) return false;
    rec.count += 1;
    return true;
  }

  private snapshot(): Snapshot {
    return { total: this.total, reports: this.reports, updatedAt: this.updatedAt };
  }
}

function cors(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://yethdev.github.io";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(origin) },
  });
}

function stub(env: Env): DurableObjectStub<Ledger> {
  return env.LEDGER.get(env.LEDGER.idFromName("global"));
}

async function handleReport(
  req: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "anon";
  const led = stub(env);

  if (!(await led.allow(ip))) {
    return json({ error: "rate limited" }, 429, origin);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400, origin);
  }

  const tokens = (payload as { tokens?: unknown }).tokens;
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) {
    return json({ error: "tokens must be a positive number" }, 400, origin);
  }
  const n = Math.min(Math.floor(tokens), MAX_PER_REPORT);

  const snap = await led.bump(n);
  return json(snap, 200, origin);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === "/total" && req.method === "GET") {
      return json(await stub(env).read(), 200, origin);
    }

    if (url.pathname === "/report" && req.method === "POST") {
      return handleReport(req, env, origin);
    }

    if (url.pathname === "/" && req.method === "GET") {
      const snap = await stub(env).read();
      return json({ service: "tip-ledger", ...snap }, 200, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
