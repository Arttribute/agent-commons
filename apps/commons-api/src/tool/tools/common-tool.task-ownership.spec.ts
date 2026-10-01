import { NotFoundException } from '@nestjs/common';
import { CommonToolService } from './common-tool.service';

describe('CommonToolService task progress ownership', () => {
  const update = {
    taskId: 'task-1',
    progress: 100,
    status: 'completed' as const,
    resultContent: 'Done',
    summary: 'Done',
    context: {} as any,
  };

  it('rejects another agent’s task before changing progress', async () => {
    const service = Object.create(
      CommonToolService.prototype,
    ) as CommonToolService;
    const tasks = {
      get: jest
        .fn()
        .mockResolvedValue({ taskId: 'task-1', agentId: 'agent-2' }),
      updateProgress: jest.fn(),
    };
    Object.assign(service as any, { tasks });

    await expect(
      service.updateTaskProgress(update, { agentId: 'agent-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tasks.updateProgress).not.toHaveBeenCalled();
  });
});
