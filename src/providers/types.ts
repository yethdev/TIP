import type { TokenCount } from "../tokens.js";

export interface GenRequest {
  role: string;
  prompt: string;
  /** target output tokens */
  want: number;
}

export interface GenResult {
  text: string;
  tokens: TokenCount;
}

export interface Provider {
  readonly kind: string;
  generate(req: GenRequest): Promise<GenResult>;
}
