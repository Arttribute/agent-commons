import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { MAX_MODEL_TOOLS, selectModelTools } from './model-tool-selection';

function tool(name: string, category = 'platform') {
  return {
    type: 'function' as const,
    function: { name, description: `${name} action`, parameters: { type: 'object', properties: {} } },
    category,
  };
}

describe('model tool selection', () => {
  it('keeps local coding and configured tools when a broad catalog exceeds the provider limit', () => {
    const platform = Array.from({ length: 125 }, (_, index) => tool(`platform_${index}`));
    platform[124] = tool('search_library_item');
    const configured = tool('send_project_report', 'mcp');
    const local = Array.from({ length: 12 }, (_, index) => tool(`cli_tool_${index}`)) as ChatCompletionTool[];
    const selected = selectModelTools(
      [...platform, configured],
      local,
      'Search a library item and run local CLI tools',
    );

    expect(selected.tools.length + selected.localTools.length).toBe(MAX_MODEL_TOOLS);
    expect(selected.omitted).toBe(10);
    expect(selected.tools.some((entry) => entry.function.name === 'send_project_report')).toBe(true);
    expect(selected.tools.some((entry) => entry.function.name === 'search_library_item')).toBe(true);
    expect(selected.localTools.map((entry) => entry.function.name)).toEqual(local.map((entry) => entry.function.name));
  });

  it('does not bind the same function twice when a local tool overrides a platform tool', () => {
    const selected = selectModelTools(
      [tool('cli_read_file'), tool('search_library_item')],
      [tool('cli_read_file')] as ChatCompletionTool[],
      'Read a local file',
    );
    expect([...selected.tools, ...selected.localTools].map((entry) => entry.function.name)).toEqual([
      'search_library_item',
      'cli_read_file',
    ]);
  });
});
