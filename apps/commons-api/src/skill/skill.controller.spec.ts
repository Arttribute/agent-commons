import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

describe('Arcade skill assignment HTTP contract', () => {
  let app: INestApplication;
  const skills = {
    assignToAgent: jest.fn().mockResolvedValue({ isEnabled: true }),
    listForAgent: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SkillController],
      providers: [{ provide: SkillService, useValue: skills }],
    }).compile();
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    // Authentication is covered by the auth suites; supply its principal here.
    app.use((req: any, _res: any, next: () => void) => {
      req.principal = {
        principalId: 'arcade-user',
        principalType: 'user',
        workspaceId: 'arcade-workspace',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each([true, false])(
    'routes assignment by skill slug (enabled=%s)',
    async (isEnabled) => {
      await request(app.getHttpServer())
        .put('/v1/skills/build-common-arcade-games/agents/arcade-agent')
        .send({ isEnabled })
        .expect(200);
      expect(skills.assignToAgent).toHaveBeenCalledWith(
        'build-common-arcade-games',
        'arcade-agent',
        isEnabled,
        { principalId: 'arcade-user', workspaceId: 'arcade-workspace' },
      );
    },
  );

  it('routes the agent skill listing separately from skill lookup', async () => {
    await request(app.getHttpServer())
      .get('/v1/skills/agents/arcade-agent')
      .expect(200, { data: [] });
    expect(skills.listForAgent).toHaveBeenCalledWith('arcade-agent', {
      principalId: 'arcade-user',
      workspaceId: 'arcade-workspace',
    });
  });
});
