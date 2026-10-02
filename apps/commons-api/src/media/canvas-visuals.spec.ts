import sharp from 'sharp';
import { CanvasVisualsService } from './canvas-visuals.service';

describe('CanvasVisualsService pictures', () => {
  const service = new CanvasVisualsService(null as any, null as any, null as any, null as any);
  const outlined = (buffer: Buffer, box: object) =>
    (service as any).outlined(buffer, box, 'Note 1') as Promise<Array<{ label: string; url: string }>>;

  it('outlines a small region and adds a close-up', async () => {
    const image = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const visuals = await outlined(image, { x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    expect(visuals.map((visual) => visual.label)).toEqual([
      'Note 1: whole view, marked area outlined',
      'Note 1: close-up of the marked area',
    ]);
    const whole = await sharp(Buffer.from(visuals[0].url.split(',')[1], 'base64')).metadata();
    expect(Math.max(whole.width!, whole.height!)).toBe(1024);
  });

  it('marks a point without a close-up', async () => {
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#000000' } }).png().toBuffer();
    const visuals = await outlined(image, { x: 0.5, y: 0.5 });
    expect(visuals).toHaveLength(1);
    expect(visuals[0].url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});
