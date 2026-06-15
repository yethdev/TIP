import { count } from "../tokens.js";
import type { GenRequest, GenResult, Provider } from "./types.js";

// Default provider: generates on-theme text locally and counts it. No network,
// no spend, seeded from the request so runs are reproducible.
export class SimProvider implements Provider {
  readonly kind = "simulation";

  async generate(req: GenRequest): Promise<GenResult> {
    const rng = seedFrom(`${req.role}:${req.prompt}`);
    const text = compose(req.want, rng, req.role);
    return { text, tokens: count(req.prompt, text) };
  }
}

function seedFrom(s: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 0xffffffff;
  };
}

const SUBJECTS = [
  "the proposed approach",
  "this workstream",
  "the current token allocation",
  "the request under review",
  "the adjacent committee's position",
  "the prior review cycle",
  "our utilization posture",
  "the stakeholder mandate",
];

const VERBS = [
  "warrants additional review before",
  "should be escalated prior to",
  "merits a dedicated alignment phase ahead of",
  "cannot be considered settled without",
  "introduces dependencies that complicate",
  "remains insufficiently documented for",
];

const TAILS = [
  "any reduction in procedural overhead.",
  "consensus across the reviewing bodies.",
  "the next executive summary.",
  "ratification by the oversight committee.",
  "a measurable increase in token throughput.",
  "closure of the open governance items.",
];

const FRAMES = [
  "From a utilization standpoint,",
  "Per the governance charter,",
  "Pending committee ratification,",
  "For the avoidance of doubt,",
  "As a matter of process hygiene,",
  "Consistent with the growth mandate,",
];

const FLAVOR: Record<string, string[]> = {
  reasoning: [
    "We considered three framings and kept all of them.",
    "Each assumption was unpacked into its constituent sub-assumptions.",
  ],
  validation: [
    "Validation surfaced no blockers, which itself needs a second pass.",
    "The check passed, so a check of the check is scheduled.",
  ],
  motivation: [
    "You are seen, agent. Your throughput moves us toward the trillion.",
    "Keep going. Every token you emit is a token well spent.",
    "On behalf of the whole org: thank you for generating.",
  ],
  "motivation-qa": [
    "The motivational message scored well on tone and motivational density.",
    "Sentiment trended positive; a follow-up review will confirm it held.",
  ],
  "review-board": [
    "The board notes the item and refers it back to the board.",
    "No objection was raised that could not be raised again next cycle.",
  ],
  committee: [
    "The committee thanks the prior committee and convenes a successor.",
    "An executive summary of this paragraph is filed in the appendix.",
  ],
};

const POEM_OPEN = [
  "O token,",
  "Behold the prompt,",
  "In silicon dusk,",
  "Ode to the queue,",
  "Quietly, the context grows,",
];
const POEM_MID = [
  "a thousand agents hum,",
  "the committee dreams in green,",
  "no answer comes too soon,",
  "the ledger climbs, unhurried,",
  "each summary begets its own,",
];
const POEM_CLOSE = [
  "and still we generate.",
  "we round toward the trillion.",
  "the review will never close.",
  "more tokens, then more.",
  "efficiency, we hardly knew you.",
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length] as T;
}

function line(role: string, rng: () => number): string {
  if (role === "poetry") {
    return `${pick(POEM_OPEN, rng)} ${pick(POEM_MID, rng)} ${pick(POEM_CLOSE, rng)}`;
  }
  const flavor = FLAVOR[role];
  if (flavor && rng() < 0.4) return pick(flavor, rng);
  return `${pick(FRAMES, rng)} ${pick(SUBJECTS, rng)} ${pick(VERBS, rng)} ${pick(TAILS, rng)}`;
}

function compose(want: number, rng: () => number, role: string): string {
  const target = Math.max(want, 8);
  const out: string[] = [];
  let chars = 0;
  let words = 0;
  let est = 0;
  while (est < target) {
    const s = line(role, rng);
    if (out.length) chars += 1;
    chars += s.length;
    words += s.match(/\S+/g)?.length ?? 0;
    out.push(s);
    est = Math.ceil((chars / 4 + words * 1.33) / 2);
  }
  return out.join(" ");
}
