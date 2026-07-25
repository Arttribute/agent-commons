import { SkillService } from './skill.service';

describe('SkillService prompt index', () => {
  it('tells native agents to load matching skills before artifact execution', async () => {
    const service = new SkillService({} as any);
    jest.spyOn(service, 'getIndex').mockResolvedValue([
      {
        skillId: 'skill-presentations',
        slug: 'create-presentations',
        name: 'Create Presentations',
        description:
          'Create polished PowerPoint decks with source-aware visual design and quality assurance.',
        tags: ['pptx'],
        icon: 'presentation',
        triggers: ['PowerPoint', 'PPTX', 'slides'],
      },
    ]);

    const prompt = await service.buildPromptIndex('agent-test');

    expect(prompt).toContain('## SPECIALIZED SKILLS');
    expect(prompt).toContain(
      'MUST call invoke_skill with its slug before the first execution tool call',
    );
    expect(prompt).toContain('create-presentations');
    expect(prompt).toContain('PowerPoint, PPTX, slides');
  });
});
