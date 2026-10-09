const modifiers = "(?:(?:a|an|the|my|this|new|private|reusable|recorded|demonstrated|useful|meaningful|workflow|local|agent)\\s+)*";
const create = new RegExp(`\\b(?:create|save|make|build)\\s+(?:and\\s+save\\s+)?${modifiers}skills?\\b`, "i");
const convert = new RegExp(`\\b(?:convert|turn)\\b[\\s\\S]{0,120}\\b(?:to|into|as)\\s+${modifiers}skills?\\b`, "i");

export function requestsSkillCreation(request: string) {
  return !/^\s*(?:how\b|explain\b|describe\b|what\b)/i.test(request) && (create.test(request) || convert.test(request));
}

export function requestsSkillReplay(request: string) {
  return /\b(?:use|invoke|apply|run)\s+(?:(?:the|a|my|saved|existing)\s+)*skill\b/i.test(request);
}
