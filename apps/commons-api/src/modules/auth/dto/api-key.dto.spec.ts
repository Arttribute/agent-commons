import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { CreateApiKeyDto } from './api-key.dto';

describe('API key creation through the production validation pipe', () => {
  const principalId = 'acceptance-user-731';
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const transform = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateApiKeyDto });

  it('retains the principal and optional label, then generates a key for that authenticated user', async () => {
    const generate = jest.fn().mockResolvedValue({ key: 'fixture-key', record: { id: 'new-key', label: 'Automation', createdAt: new Date() } });
    const controller = new AuthController({ generate } as any);
    const dto = await transform({ principalId, principalType: 'user', label: 'Automation', active: true });
    expect(dto).toBeInstanceOf(CreateApiKeyDto);
    expect(dto.active).toBeUndefined();
    const result = await controller.create(dto, { principal: { principalId, principalType: 'user' } });
    expect(generate).toHaveBeenCalledWith(principalId, 'user', 'Automation');
    expect(result.id).toBe('new-key');
  });

  it('accepts both supported principal types without requiring a label', async () => {
    for (const principalType of ['user', 'agent']) {
      const dto = await transform({ principalId, principalType });
      expect(dto.principalId).toBe(principalId);
      expect(dto.principalType).toBe(principalType);
    }
  });

  it('rejects missing or invalid input before it reaches the database', async () => {
    for (const body of [{}, { principalId, principalType: 'service' }, { principalId: '', principalType: 'user' }, { principalId: 731, principalType: 'agent' }, { principalId, principalType: 'user', label: 42 }]) {
      await expect(transform(body)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not let a valid request mint a key for another user or another principal type', async () => {
    const generate = jest.fn();
    const controller = new AuthController({ generate } as any);
    for (const target of [{ principalId: 'other-user', principalType: 'user' }, { principalId, principalType: 'agent' }]) {
      const dto = await transform(target);
      await expect(controller.create(dto, { principal: { principalId, principalType: 'user' } })).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(generate).not.toHaveBeenCalled();
  });
});
