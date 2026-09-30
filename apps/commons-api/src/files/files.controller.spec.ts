import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FilesController } from './files.controller';
import sharp from 'sharp';

describe('direct file upload tickets', () => {
  const previousSecret = process.env.AGENT_FILE_UPLOAD_TICKET_SECRET;
  beforeAll(() => { process.env.AGENT_FILE_UPLOAD_TICKET_SECRET = 'ticket-test-secret'; });
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.AGENT_FILE_UPLOAD_TICKET_SECRET;
    else process.env.AGENT_FILE_UPLOAD_TICKET_SECRET = previousSecret;
  });

  it('binds one uploaded file to the authenticated owner, name, and size', async () => {
    const createFromUploads = jest.fn().mockResolvedValue([{ fileId: 'stored-file' }]);
    const execute = jest.fn().mockResolvedValueOnce([{ nonce: 'claimed' }]).mockResolvedValue([]);
    const controller = new FilesController({ createFromUploads } as any, {} as any, { execute } as any);
    const ticket = controller.issueUploadTicket(
      { name: 'paper.pdf', size: 12, mimeType: 'application/pdf', workspaceId: 'spoofed-workspace' },
      'spoofed-user',
      { principal: { principalType: 'user', principalId: 'real-user', workspaceId: 'real-workspace' } },
    ).data.ticket;
    const [guardType] = Reflect.getMetadata(GUARDS_METADATA, controller.uploadDirect) as Array<new () => { canActivate(context: any): boolean }>;
    const guard = new guardType();
    const request: any = { query: { ticket } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    expect(guard.canActivate(context)).toBe(true);
    const file = { originalname: 'paper.pdf', size: 12, buffer: Buffer.alloc(12) } as Express.Multer.File;
    await expect(controller.uploadDirect([file], request)).resolves.toEqual({ data: [{ fileId: 'stored-file' }] });
    expect(createFromUploads).toHaveBeenCalledWith([file], expect.objectContaining({
      ownerId: 'real-user', workspaceId: 'real-workspace', ownerType: 'user',
    }));
    await expect(controller.uploadDirect([file], request)).rejects.toThrow('already been used');
    expect(createFromUploads).toHaveBeenCalledTimes(1);
    await expect(controller.uploadDirect([{ ...file, size: 13 }], request)).rejects.toThrow('does not match');
    request.query.ticket = `${ticket.slice(0, -1)}${ticket.at(-1) === 'a' ? 'b' : 'a'}`;
    expect(() => guard.canActivate(context)).toThrow('Invalid upload ticket');
  });

  it('rejects files larger than 25 MB before issuing a ticket', () => {
    const controller = new FilesController({} as any, {} as any, {} as any);
    expect(() => controller.issueUploadTicket(
      { name: 'large.pdf', size: 25 * 1024 * 1024 + 1 },
      'user',
      { principal: { principalType: 'user', principalId: 'user' } },
    )).toThrow('25 MB');
  });

  it('decodes and normalizes profile images before storing them', async () => {
    const uploadFile = jest.fn().mockResolvedValue({ IpfsHash: 'bafyprofile123' });
    const controller = new FilesController({} as any, { uploadFile } as any, {} as any);
    const buffer = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
    const result = await controller.uploadProfileAvatar({ buffer } as Express.Multer.File);
    expect(result.data.url).toContain('/ipfs/bafyprofile123');
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^profile-.*\.png$/), 'image/png');
    await expect(controller.uploadProfileAvatar({ buffer: Buffer.from('not an image') } as Express.Multer.File)).rejects.toThrow('valid PNG');
  });
});
