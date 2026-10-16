import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  OperationsService,
  REPORTS,
  type ReportName,
} from './operations.service';
import { assertOpsReader } from './operations-auth';

@Controller('v1/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get('reports/:report')
  async report(
    @Req() req: any,
    @Param('report') report: string,
    @Query() query: Record<string, string>,
  ) {
    assertOpsReader(req.principal);
    if (!REPORTS.includes(report as ReportName))
      throw new BadRequestException('Unknown report');
    const userId = query.userId ?? '',
      days = Number(query.days ?? 30),
      offset = Number(query.offset ?? 0),
      ids = query.ids ? query.ids.split(',') : [];
    const validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
    if (
      (userId && !validId(userId)) ||
      ![7, 30, 90, 365].includes(days) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      ids.length > 50 ||
      ids.some((id) => !validId(id)) ||
      (['account', 'agents'].includes(report) && !userId)
    )
      throw new BadRequestException('Invalid report filters');
    return {
      data: await this.operations.report(report as ReportName, {
        userId,
        days,
        offset,
        ids,
      }),
    };
  }
}
