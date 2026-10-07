import { AudioService } from './audio.service';

describe('chat transcription model selection', () => {
  const setup = () => {
    const service = Object.create(AudioService.prototype) as any;
    service.model = 'gpt-4o-mini-transcribe';
    service.openai = { audio: { transcriptions: { create: jest.fn().mockResolvedValue({ text: 'A real transcript' }) } } };
    service.usage = { authorizeCapability: jest.fn().mockResolvedValue({ reservationId: 'reserved' }), settleCapability: jest.fn().mockResolvedValue({}), releaseCapability: jest.fn() };
    return service;
  };
  const file = { buffer: Buffer.from('audio fixture'), mimetype: 'audio/wav', originalname: 'recording.wav' } as Express.Multer.File;
  it('uses the selected model for execution and usage settlement', async () => {
    const service = setup();
    await service.transcribe(file, { principalId: 'owner', durationMs: 60_000, idempotencyKey: 'request', model: 'whisper-1' });
    expect(service.openai.audio.transcriptions.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'whisper-1' }));
    expect(service.usage.authorizeCapability).toHaveBeenCalledWith(expect.objectContaining({ estimatedCostUsd: 0.006, metadata: expect.objectContaining({ model: 'whisper-1' }) }));
    expect(service.usage.settleCapability).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ model: 'whisper-1' }) }));
  });
  it('rejects unsupported models before reserving usage or calling a provider', async () => {
    const service = setup();
    await expect(service.transcribe(file, { principalId: 'owner', durationMs: 1_000, idempotencyKey: 'request', model: 'invented-model' })).rejects.toThrow(/supported transcription/);
    expect(service.usage.authorizeCapability).not.toHaveBeenCalled();
    expect(service.openai.audio.transcriptions.create).not.toHaveBeenCalled();
  });
});
