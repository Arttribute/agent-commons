import { filterPlatformToolsForAgent } from './copilot-tool-policy';

describe('filterPlatformToolsForAgent', () => {
  const tools = [
    { name: 'listCommonsResources' },
    { name: 'proposeSkillChange' },
    { name: 'generateImage' },
    { name: 'readUploadedFile' },
  ];

  it('keeps platform-management tools for the default system Copilot', () => {
    expect(
      filterPlatformToolsForAgent(tools, {
        isDefault: true,
        isSystemManaged: true,
      }),
    ).toEqual(tools);
  });

  it('hides Commons Copilot management tools from scoped caller agents', () => {
    expect(
      filterPlatformToolsForAgent(tools, {
        isDefault: false,
        isSystemManaged: false,
      }),
    ).toEqual([{ name: 'generateImage' }, { name: 'readUploadedFile' }]);
  });

  it('requires both default and system-managed flags', () => {
    expect(
      filterPlatformToolsForAgent(tools, {
        isDefault: true,
        isSystemManaged: false,
      }),
    ).toEqual([{ name: 'generateImage' }, { name: 'readUploadedFile' }]);
  });
});
