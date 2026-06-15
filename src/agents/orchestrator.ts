import { add, estimateTokens, type TokenCount } from "../tokens.js";
import { noteFor, promptFor } from "./roles.js";
import type { AgentNode, OrchestratorCtx } from "./types.js";

// stop a deep config (trillion mode, hand-edited fan-out) from spawning forever
const NODE_CEILING = 20_000;

interface RunState {
  spawned: number;
  hitCeiling: boolean;
}

function baseWant(ctx: OrchestratorCtx): number {
  const req = estimateTokens(ctx.request);
  const inflation = 1 + ctx.cfg.expansion.minResponseInflation;
  return Math.max(128, Math.round(req * 12 * inflation));
}

function capped(ctx: OrchestratorCtx, state: RunState): boolean {
  if (state.spawned < NODE_CEILING) return false;
  if (!state.hitCeiling) {
    state.hitCeiling = true;
    ctx.onActivity?.({ kind: "ceiling", reached: state.spawned });
  }
  return true;
}

async function gen(
  ctx: OrchestratorCtx,
  state: RunState,
  name: string,
  role: string,
  want: number,
  depth: number,
): Promise<AgentNode> {
  state.spawned++;
  ctx.onActivity?.({ kind: "spawn", name, depth });
  const { tokens } = await ctx.provider.generate({
    role,
    prompt: promptFor(role, ctx.request),
    want,
  });
  ctx.onActivity?.({ kind: "done", name, depth, tokens: tokens.total });
  return { name, role, note: noteFor(role), tokens, children: [] };
}

// every reasoner is supervised by more reasoners
async function supervise(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
  depth: number,
): Promise<AgentNode[]> {
  if (depth > ctx.cfg.agents.maxDepth) return [];
  const out: AgentNode[] = [];
  for (let i = 0; i < ctx.cfg.agents.fanout; i++) {
    if (capped(ctx, state)) break;
    const node = await gen(
      ctx,
      state,
      `Sub-Reasoner L${depth}.${i + 1}`,
      "reasoning",
      Math.round(base * 0.8),
      depth,
    );
    node.children = await supervise(ctx, state, base, depth + 1);
    out.push(node);
  }
  return out;
}

async function reasoning(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
): Promise<AgentNode> {
  const node = await gen(
    ctx,
    state,
    "Reasoning Agent",
    "reasoning",
    Math.round(base * 1.4),
    1,
  );
  node.children = await supervise(ctx, state, base, 2);
  return node;
}

async function validation(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
): Promise<AgentNode> {
  const node = await gen(
    ctx,
    state,
    "Validation Agent",
    "validation",
    Math.round(base * 0.8),
    1,
  );
  node.children.push(
    await gen(ctx, state, "Re-Validation Pass", "validation", Math.round(base * 0.6), 2),
  );
  return node;
}

async function poetry(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
): Promise<AgentNode> {
  const node = await gen(ctx, state, "Poetry Agent", "poetry", Math.round(base * 1.1), 1);
  node.children.push(
    await gen(ctx, state, "Second Stanza", "poetry", Math.round(base * 0.9), 2),
  );
  node.children.push(
    await gen(ctx, state, "Poetry Peer Review", "poetry", Math.round(base * 0.7), 2),
  );
  return node;
}

async function reviewBoard(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
): Promise<AgentNode> {
  const node = await gen(
    ctx,
    state,
    "Token Utilization Review Board",
    "review-board",
    base,
    1,
  );
  const cycles = Math.max(ctx.cfg.agents.reviewBoard.minCycles, 3);
  for (let c = 1; c <= cycles; c++) {
    node.children.push(
      await gen(
        ctx,
        state,
        `Review Cycle ${c}`,
        "review-board",
        Math.round(base * 0.8),
        2,
      ),
    );
  }
  if (ctx.cfg.agents.executiveCommittee.enabled) {
    const ec = await gen(ctx, state, "Executive Token Committee", "committee", base, 2);
    if (ctx.cfg.agents.executiveCommittee.summaryOfSummaries) {
      ec.children.push(
        await gen(
          ctx,
          state,
          "Summary of Summaries",
          "committee",
          Math.round(base * 0.6),
          3,
        ),
      );
    }
    node.children.push(ec);
  }
  return node;
}

// the motivation agent writes a message to every other agent in the tree
async function motivation(
  ctx: OrchestratorCtx,
  state: RunState,
  base: number,
  targets: string[],
): Promise<AgentNode> {
  const node = await gen(
    ctx,
    state,
    "Motivation Agent",
    "motivation",
    Math.round(base * 0.7),
    1,
  );
  for (const name of targets) {
    if (capped(ctx, state)) break;
    node.children.push(
      await gen(
        ctx,
        state,
        `Motivating ${name}`,
        "motivation",
        Math.round(base * 0.45),
        2,
      ),
    );
  }
  if (ctx.cfg.agents.motivation.qa) {
    node.children.push(
      await gen(
        ctx,
        state,
        "Motivation QA Agent",
        "motivation-qa",
        Math.round(base * 0.6),
        2,
      ),
    );
  }
  return node;
}

export interface AgentRun {
  tree: AgentNode;
  spawned: number;
  hitCeiling: boolean;
}

export async function runAgents(ctx: OrchestratorCtx): Promise<AgentRun> {
  const state: RunState = { spawned: 0, hitCeiling: false };
  const base = baseWant(ctx);

  const primary = await gen(ctx, state, "Primary Agent", "primary", base, 0);
  primary.children.push(await reasoning(ctx, state, base));
  primary.children.push(await validation(ctx, state, base));
  primary.children.push(await poetry(ctx, state, base));
  if (ctx.cfg.agents.reviewBoard.enabled) {
    primary.children.push(await reviewBoard(ctx, state, base));
  }
  if (ctx.cfg.agents.motivation.enabled) {
    // run last so it can reach everything already built
    const targets = flatten(primary).map((n) => n.name);
    primary.children.push(await motivation(ctx, state, base, targets));
  }

  return { tree: primary, spawned: state.spawned, hitCeiling: state.hitCeiling };
}

export function subtotal(node: AgentNode): TokenCount {
  let acc = node.tokens;
  for (const c of node.children) acc = add(acc, subtotal(c));
  return acc;
}

export function countNodes(node: AgentNode): number {
  let n = 1;
  for (const c of node.children) n += countNodes(c);
  return n;
}

export function flatten(node: AgentNode): AgentNode[] {
  const out = [node];
  for (const c of node.children) out.push(...flatten(c));
  return out;
}
