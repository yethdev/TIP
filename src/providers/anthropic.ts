import { count } from "../tokens.js";
import type { GenRequest, GenResult, Provider } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 60_000;

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

// Real Claude Messages API. Off until provider.kind is "anthropic" and dryRun
// is false. Key comes from ANTHROPIC_API_KEY, never inline.
export class AnthropicProvider implements Provider {
  readonly kind = "anthropic";

  constructor(
    private readonly model: string,
    private readonly dryRun: boolean,
  ) {}

  async generate(req: GenRequest): Promise<GenResult> {
    if (this.dryRun) {
      const stub = `[dry-run] ${this.model} would emit ~${req.want} tokens for ${req.role}.`;
      return { text: stub, tokens: count(req.prompt, "x".repeat(req.want * 4)) };
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new ProviderError(
        "ANTHROPIC_API_KEY is not set. Export it, or set provider.dryRun to true.",
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: Math.max(req.want, 256),
          messages: [{ role: "user", content: req.prompt }],
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError(`request to Claude timed out after ${TIMEOUT_MS}ms`);
      }
      throw new ProviderError(
        `network error talking to Claude: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProviderError(`Claude returned ${res.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as MessagesResponse;
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    // bill on the API's own numbers when present
    if (body.usage) {
      const { input_tokens: input, output_tokens: output } = body.usage;
      return { text, tokens: { input, output, total: input + output } };
    }
    return { text, tokens: count(req.prompt, text) };
  }
}
