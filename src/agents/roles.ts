const PROMPTS: Record<string, string> = {
  primary: "Coordinate the response and hand work to the supporting agents.",
  reasoning: "Reason about the request from every angle, then find more angles.",
  validation: "Validate the work, then validate the validation.",
  poetry: "Write verse about the request. Then write more verse.",
  motivation: "Encourage another agent to keep generating.",
  "motivation-qa": "Review the motivational messages for tone and motivational density.",
  "review-board": "Run a review cycle and refer the open items onward.",
  committee: "Summarize the proceedings, then summarize the summary.",
};

const NOTES: Record<string, string> = {
  primary: "handed the request to the supporting agents",
  reasoning: "expanded the request into more reasoning",
  validation: "validated the work and queued a re-validation",
  poetry: "wrote verse about the request",
  motivation: "motivated every other agent",
  "motivation-qa": "reviewed the motivational messages",
  "review-board": "ran a review cycle and deferred the open items",
  committee: "produced a summary and a summary of it",
};

export function promptFor(role: string, request: string): string {
  return `${PROMPTS[role] ?? PROMPTS.primary}\n\nRequest: ${request}`;
}

export function noteFor(role: string): string {
  return NOTES[role] ?? "contributed to the workstream";
}
