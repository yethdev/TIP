export interface TokenCount {
  input: number;
  output: number;
  total: number;
}

const CHARS_PER_TOKEN = 4;
const WORD_WEIGHT = 1.33;

// Approximation, not real BPE - blends char and word counts. Good enough to
// account for usage; swap in a tokenizer if you bill on the exact number.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  const words = text.match(/\S+/g)?.length ?? 0;
  return Math.ceil((chars / CHARS_PER_TOKEN + words * WORD_WEIGHT) / 2);
}

export function count(input: string, output: string): TokenCount {
  const i = estimateTokens(input);
  const o = estimateTokens(output);
  return { input: i, output: o, total: i + o };
}

export function zero(): TokenCount {
  return { input: 0, output: 0, total: 0 };
}

export function add(a: TokenCount, b: TokenCount): TokenCount {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

export function sum(counts: Iterable<TokenCount>): TokenCount {
  let acc = zero();
  for (const c of counts) acc = add(acc, c);
  return acc;
}

const UNITS = ["", "K", "M", "B", "T", "Q"];

export function format(n: number): string {
  if (n < 1000) return String(Math.round(n));
  let tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  let scaled = n / Math.pow(1000, tier);
  if (scaled >= 999.5 && tier < UNITS.length - 1) {
    tier += 1;
    scaled = n / Math.pow(1000, tier);
  }
  const digits = scaled >= 100 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/, "")}${UNITS[tier]}`;
}
