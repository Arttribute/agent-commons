import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { StreamMonitorService } from './stream-monitor.service';

// Use a distinct path to avoid conflicting with the primary SpaceController 'spaces' root path.
@Controller({ version: '1', path: 'spaces-stream' })
export class SpaceStreamController {
  constructor(private readonly monitor: StreamMonitorService) {}

  // Returns latest composite PNG for a space
  @Get(':spaceId/composite.png')
  async getComposite(@Param('spaceId') spaceId: string, @Res() res: Response) {
    const data = this.monitor.getLatestFrameDataForSpace(spaceId);
    if (!data.latestFrameUrl) throw new NotFoundException('No composite yet');
    // data URL -> buffer
    const base64 = data.latestFrameUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }
}
