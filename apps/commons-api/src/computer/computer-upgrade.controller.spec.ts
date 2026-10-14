import { ComputerController } from './computer.controller';

describe('computer resource review identity', () => {
  const setup = () => {
    const accept = jest.fn().mockResolvedValue({ requiresConfirmation: false });
    const controller = new ComputerController({} as any, { accept } as any);
    return { controller, accept };
  };
  it('uses the signed-in user identity instead of a forged delegation header', async () => {
    const { controller, accept } = setup();
    await controller.approveUpgrade('agent', 'proposal', { principal: { principalId: 'owner', principalType: 'user' }, headers: { 'x-initiator': 'forged' } } as any);
    expect(accept).toHaveBeenCalledWith('agent', 'proposal', 'owner');
  });
  it('uses the trusted web proxy’s delegated owner for a service credential', async () => {
    const { controller, accept } = setup();
    await controller.approveUpgrade('agent', 'proposal', { principal: { principalId: 'management-service', principalType: 'service' }, headers: { 'x-owner-id': 'owner' } } as any);
    expect(accept).toHaveBeenCalledWith('agent', 'proposal', 'owner');
  });
  it('prevents an agent credential from approving its own proposal', async () => {
    const { controller, accept } = setup();
    await expect(controller.approveUpgrade('agent', 'proposal', { principal: { principalId: 'agent', principalType: 'agent' }, headers: { 'x-initiator': 'owner' } } as any)).rejects.toThrow(/signed-in owner/);
    expect(accept).not.toHaveBeenCalled();
  });
});
