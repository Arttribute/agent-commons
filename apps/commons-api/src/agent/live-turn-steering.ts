import { HumanMessage } from '@langchain/core/messages';

// Only authenticated steering enters this helper. Attached source text is not
// a control signal. Require a direct request about the run/work itself, rather
// than phrases such as "stop using red" or "don't stop until the file exists".
export function requestsRunStop(prompt: string): boolean {
  return /^\s*(?:please\s+)?(?:stop|cancel|abort)(?:\s*(?:[.!]|$)|\s+(?:(?:this|the|current|active|our)\s+(?:\w+\s+){0,3}(?:run|task|workflow|diagnostic|test|work|execution|operation|session)|(?:run|task|workflow|work|execution))\b(?!\s+from\b))/i.test(prompt);
}

export class LiveTurnSteering {
  stopped = false;
  constructor(public request: string) {}

  async beforeModel(consume?: () => string[] | Promise<string[]>) {
    const prompts = (await consume?.()) ?? [];
    for (const prompt of prompts) {
      this.request += `\n\nUser steering: ${prompt}`;
      if (requestsRunStop(prompt)) this.stopped = true;
    }
    return prompts.map(content => new HumanMessage(content));
  }
}
