import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { MAX_MODEL_TOOLS, selectModelTools } from './model-tool-selection';
import { HOSTED_FREE_MAX_TOOLS } from '~/modules/model-provider/model-registry';

function tool(name: string, category = 'platform') {
  return {
    type: 'function' as const,
    function: {
      name,
      description: `${name} action`,
      parameters: { type: 'object', properties: {} },
    },
    category,
  };
}

describe('model tool selection', () => {
  it('keeps local coding and configured tools when a broad catalog exceeds the provider limit', () => {
    const platform = Array.from({ length: 125 }, (_, index) =>
      tool(`platform_${index}`),
    );
    platform[124] = tool('search_library_item');
    const configured = tool('send_project_report', 'mcp');
    const local = Array.from({ length: 12 }, (_, index) =>
      tool(`cli_tool_${index}`),
    ) as ChatCompletionTool[];
    const selected = selectModelTools(
      [...platform, configured],
      local,
      'Search a library item and run local CLI tools',
    );

    expect(selected.tools.length + selected.localTools.length).toBe(
      MAX_MODEL_TOOLS,
    );
    expect(selected.omitted).toBe(10);
    expect(
      selected.tools.some(
        (entry) => entry.function.name === 'send_project_report',
      ),
    ).toBe(true);
    expect(
      selected.tools.some(
        (entry) => entry.function.name === 'search_library_item',
      ),
    ).toBe(true);
    expect(selected.localTools.map((entry) => entry.function.name)).toEqual(
      local.map((entry) => entry.function.name),
    );
  });

  it('does not bind the same function twice when a local tool overrides a platform tool', () => {
    const selected = selectModelTools(
      [tool('cli_read_file'), tool('search_library_item')],
      [tool('cli_read_file')] as ChatCompletionTool[],
      'Read a local file',
    );
    expect(
      [...selected.tools, ...selected.localTools].map(
        (entry) => entry.function.name,
      ),
    ).toEqual(['search_library_item', 'cli_read_file']);
  });

  it('keeps local CLI tools within the smaller hosted free catalog', () => {
    const local = Array.from({ length: 12 }, (_, index) =>
      tool(`cli_tool_${index}`),
    ) as ChatCompletionTool[];
    const platform = Array.from({ length: 40 }, (_, index) =>
      tool(`platform_${index}`),
    );
    platform[39] = tool('search_library_item');
    const selected = selectModelTools(
      platform,
      local,
      'Search a library item',
      HOSTED_FREE_MAX_TOOLS,
    );
    expect(selected.localTools).toHaveLength(12);
    expect(selected.tools.length + selected.localTools.length).toBe(
      HOSTED_FREE_MAX_TOOLS,
    );
    expect(
      selected.tools.some(
        (entry) => entry.function.name === 'search_library_item',
      ),
    ).toBe(true);
  });

  it('exposes goal creation only for an explicit goal request', () => {
    const available = [
      tool('createGoal'),
      tool('updateGoalProgress'),
      tool('recomputeGoalProgress'),
      tool('listProjectChats'),
    ];
    const informational = selectModelTools(
      available,
      [],
      'Remember the launch date and give this chat a concise title.',
    );
    expect(informational.tools.map((entry) => entry.function.name)).toEqual([
      'listProjectChats',
    ]);
    expect(informational.omitted).toBe(3);

    const intentional = selectModelTools(
      available,
      [],
      'Create a goal to track the launch milestones.',
    );
    expect(intentional.tools.map((entry) => entry.function.name)).toEqual([
      'createGoal',
      'updateGoalProgress',
      'recomputeGoalProgress',
      'listProjectChats',
    ]);

    const progress = selectModelTools(
      available,
      [],
      'Update progress on the existing launch goal.',
    );
    expect(progress.tools.map((entry) => entry.function.name)).toEqual([
      'updateGoalProgress',
      'recomputeGoalProgress',
      'listProjectChats',
    ]);
  });

  it('does not turn an informational project message into a persistent task', () => {
    const available = [
      tool('createTask'),
      tool('updateTaskProgress'),
      tool('listProjectChats'),
    ];
    const informational = selectModelTools(
      available,
      [],
      'Remember the launch date and give this chat a concise title.',
    );
    expect(informational.tools.map((entry) => entry.function.name)).toEqual([
      'listProjectChats',
    ]);

    const intentional = selectModelTools(
      available,
      [],
      'Create a task to prepare the launch.',
    );
    expect(intentional.tools.map((entry) => entry.function.name)).toEqual([
      'createTask',
      'updateTaskProgress',
      'listProjectChats',
    ]);

    const dispatched = selectModelTools(
      available,
      [],
      '⫷⫷TASK_DISPATCH⫸⫸: Execute your pending tasks now.',
    );
    expect(dispatched.tools.map((entry) => entry.function.name)).toEqual([
      'updateTaskProgress',
      'listProjectChats',
    ]);
  });

  it('does not create a file just to remember a fact or title a chat', () => {
    const fileTools = [
      tool('createTextFile'),
      tool('createDocumentFile'),
      tool('createPresentationFile'),
      tool('createPdfFile'),
      tool('createSpreadsheetFile'),
    ];
    const informational = selectModelTools(
      [...fileTools, tool('listProjectChats')],
      [],
      'Remember the launch date and give this chat a concise title.',
    );
    expect(informational.tools.map((entry) => entry.function.name)).toEqual([
      'listProjectChats',
    ]);

    expect(
      selectModelTools(fileTools, [], 'Create a PDF summary.').tools.map(
        (entry) => entry.function.name,
      ),
    ).toHaveLength(fileTools.length);
    expect(
      selectModelTools(fileTools, [], 'Save the summary as a .txt file.').tools.map(
        (entry) => entry.function.name,
      ),
    ).toHaveLength(fileTools.length);
    for (const request of [
      'Write a short summary of this document.',
      'Give me a summary of this PDF.',
      'Remember this PDF and give the chat a title.',
    ]) {
      expect(selectModelTools(fileTools, [], request).tools).toEqual([]);
    }
  });
});
