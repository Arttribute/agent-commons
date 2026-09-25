export type SkillIndexEntry = {
  slug: string;
  name: string;
  description: string;
  triggers?: string[] | null;
};
export type SkillPlaybook = SkillIndexEntry & { instructions: string };
export declare function findMatchingSkills<T extends SkillIndexEntry>(index: T[], requestText: string, limit?: number): T[];
export declare function buildSkillPromptIndex(index: SkillIndexEntry[], matchedPlaybooks: SkillPlaybook[]): string;
export declare const AUTONOMOUS_EXECUTION_CONTRACT: string;
export declare function buildWorkspaceModeContext(mode: "cloud" | "private-local", hasDesktopWorkspace?: boolean, isDesktop?: boolean): string;
export declare function buildAgentIdentityPrompt(agent: { id: string; name?: string | null; description?: string | null; persona?: string | null; instructions?: string | null }): string;
