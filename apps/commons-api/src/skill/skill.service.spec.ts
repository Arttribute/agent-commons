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

  it('preloads the full matching playbook for terse artifact requests', async () => {
    const service = new SkillService({} as any);
    jest.spyOn(service, 'getIndex').mockResolvedValue([
      {
        skillId: 'skill-presentations',
        slug: 'create-presentations',
        name: 'Create Presentations',
        description: 'Create polished PowerPoint decks.',
        tags: ['pptx'],
        icon: 'presentation',
        triggers: ['PowerPoint', 'PPTX', 'slides'],
      },
    ]);
    jest.spyOn(service, 'get').mockResolvedValue({
      slug: 'create-presentations',
      instructions:
        'Add a matching overview and key-takeaways slide, then validate the PPTX quality report.',
    } as any);

    const prompt = await service.buildPromptIndex(
      'agent-test',
      'Lets create a PowerPoint with these images and add text',
    );

    expect(prompt).toContain('## MATCHED SKILL PLAYBOOKS');
    expect(prompt).toContain('### create-presentations');
    expect(prompt).toContain(
      'Add a matching overview and key-takeaways slide',
    );
    expect(prompt).toContain('MUST still call invoke_skill');
  });
});
