import { SkillService } from './skill.service';
import JSZip from 'jszip';

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

describe('SkillService imports', () => {
  it('imports a portable SKILL.md with triggers, tools, and tags', async () => {
    const database = {
      query: { skill: { findFirst: jest.fn().mockResolvedValue(null) } },
    } as any;
    const service = new SkillService(database);
    const create = jest.spyOn(service, 'create').mockResolvedValue({
      skillId: 'skill-1',
      name: 'Weekly Report',
    } as any);
    const markdown = `---
name: weekly-report
title: Weekly Report
description: Prepare a concise weekly progress report.
tools: [readUploadedFile, web_search]
triggers:
  - weekly update
  - progress report
tags: [writing, reporting]
---
## Workflow

Gather evidence, draft the report, and validate every claim.`;

    await service.importSkillFile(
      {
        originalname: 'SKILL.md',
        mimetype: 'text/markdown',
        buffer: Buffer.from(markdown),
      } as Express.Multer.File,
      { principalId: 'user-1' },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'weekly-report',
        name: 'Weekly Report',
        tools: ['readUploadedFile', 'web_search'],
        triggers: ['weekly update', 'progress report'],
        tags: ['writing', 'reporting'],
        source: 'import',
      }),
      { principalId: 'user-1' },
    );
  });

  it('rejects an archive without SKILL.md', async () => {
    const archive = new JSZip();
    archive.file('README.md', '# Not a skill');
    const service = new SkillService({} as any);
    await expect(
      service.importSkillFile(
        {
          originalname: 'broken.skill',
          mimetype: 'application/zip',
          buffer: await archive.generateAsync({ type: 'nodebuffer' }),
        } as Express.Multer.File,
        { principalId: 'user-1' },
      ),
    ).rejects.toThrow('must contain a SKILL.md');
  });
});
