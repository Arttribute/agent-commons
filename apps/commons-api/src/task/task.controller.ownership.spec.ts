import { NotFoundException } from '@nestjs/common';
import { TaskController } from './task.controller';

describe('TaskController ownership', () => {
  const db = {
    query: {
      session: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ agentId: 'agent-1', initiator: 'alice' }),
      },
      agent: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            ownerUserId: 'alice',
            owner: null,
            workspaceId: null,
          }),
      },
    },
  };
  const execution = {
    listSessionTasks: jest.fn().mockResolvedValue([{ taskId: 'private-task' }]),
    createTask: jest.fn(),
  };
  const controller = new TaskController({} as any, execution as any, db as any);

  beforeEach(() => jest.clearAllMocks());

  it('does not list tasks from another user’s session', async () => {
    const request = {
      principal: { principalType: 'user', principalId: 'bob' },
      headers: {},
    } as any;
    await expect(
      controller.listTasks(
        'session-1',
        undefined,
        undefined,
        undefined,
        request,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(execution.listSessionTasks).not.toHaveBeenCalled();
  });

  it('does not create a task in another user’s session', async () => {
    const request = {
      principal: { principalType: 'user', principalId: 'alice' },
      headers: {},
    } as any;
    await controller.create(
      {
        agentId: 'agent-1',
        sessionId: 'session-1',
        title: 'Own task',
        createdBy: 'alice',
        createdByType: 'user',
      },
      request,
    );
    expect(execution.createTask).toHaveBeenCalled();
    db.query.session.findFirst.mockResolvedValueOnce({
      agentId: 'agent-1',
      initiator: 'bob',
    });
    await expect(
      controller.create(
        {
          agentId: 'agent-1',
          sessionId: 'session-2',
          title: 'Wrong session',
          createdBy: 'alice',
          createdByType: 'user',
        },
        request,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
