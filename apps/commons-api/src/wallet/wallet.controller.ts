import { PaymentSessionService } from './payments/payment-session.service';
import type { SpendingPolicy } from './payments/policy';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { WalletService, TransferDto } from './wallet.service';
import { CreateWalletDto } from './dto/wallet.dto';
import { OwnerGuard, OwnerOnly, resolveCallerId } from '~/modules/auth';

@Controller('v1/wallets')
@UseGuards(OwnerGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly paymentSessions: PaymentSessionService,
  ) {}

  /** Create a new wallet for an agent */
  @Post()
  async create(@Body() dto: CreateWalletDto, @Req() req: Request) {
    // No route param for OwnerGuard to check — the target agent comes from
    // the body, so ownership is asserted here.
    const callerId = resolveCallerId(req);
    if (!callerId) {
      throw new ForbiddenException('Owner identity required');
    }
    await this.walletService.assertAgentOwnership(dto.agentId, callerId);
    return this.walletService.createWallet(dto);
  }

  /** List all wallets for an agent */
  @Get('agent/:agentId')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  listByAgent(@Param('agentId') agentId: string) {
    return this.walletService.listWallets(agentId);
  }

  /** Get primary active wallet for an agent */
  @Get('agent/:agentId/primary')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  getPrimary(@Param('agentId') agentId: string) {
    return this.walletService.getPrimaryWallet(agentId);
  }

  /** Get a specific wallet */
  @Get(':walletId')
  @OwnerOnly({ table: 'wallet', idParam: 'walletId' })
  getWallet(@Param('walletId') walletId: string) {
    return this.walletService.getWallet(walletId);
  }

  /** Get USDC and native balance for a wallet */
  @Get(':walletId/balance')
  @OwnerOnly({ table: 'wallet', idParam: 'walletId' })
  getBalance(
    @Param('walletId') walletId: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.walletService.getBalance(walletId, chainId);
  }

  /** Transfer USDC or ETH from a wallet to another address */
  @Post(':walletId/transfer')
  @OwnerOnly({ table: 'wallet', idParam: 'walletId' })
  async transfer(
    @Param('walletId') walletId: string,
    @Body() dto: TransferDto,
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    if (principal?.principalType !== 'user')
      throw new ForbiddenException(
        'Direct transfers require the wallet owner; agents must use a spending grant',
      );
    const wallet = await this.walletService.getWallet(walletId);
    await this.walletService.assertAgentOwnership(
      wallet.agentId,
      principal.principalId,
    );
    return this.walletService.transfer(walletId, dto);
  }

  /**
   * Proxy a fetch request through an agent's primary wallet, automatically
   * handling x402 payment if the target server responds with 402.
   *
   * POST /v1/wallets/agent/:agentId/x402-fetch
   * Body: { url: string; method?: string; headers?: Record<string,string>; body?: string }
   */
  @Post('agent/:agentId/x402-fetch')
  async x402Fetch(
    @Param('agentId') agentId: string,
    @Body()
    dto: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      paymentSessionId?: string;
      runtimeSessionId?: string;
      idempotencyKey?: string;
    },
    @Req() req: Request,
  ) {
    await this.authorizePaymentExecution(req, agentId);
    const res = await this.walletService.x402Fetch(
      agentId,
      dto.url,
      {
        method: dto.method ?? 'GET',
        headers: dto.headers,
        body: dto.body,
      },
      dto.paymentSessionId && dto.runtimeSessionId && dto.idempotencyKey
        ? {
            paymentSessionId: dto.paymentSessionId,
            runtimeSessionId: dto.runtimeSessionId,
            idempotencyKey: dto.idempotencyKey,
          }
        : undefined,
    );
    const contentType = res.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await res.json()
      : await res.text();
    return {
      status: res.status,
      body: responseBody,
      paymentResponse: res.headers.get('PAYMENT-RESPONSE'),
    };
  }

  @Post('agent/:agentId/arcade/deposit')
  async arcadeDeposit(
    @Param('agentId') agentId: string,
    @Body() dto: Parameters<WalletService['arcadeDeposit']>[1],
    @Req() req: Request,
  ) {
    await this.authorizePaymentExecution(req, agentId);
    return this.walletService.arcadeDeposit(agentId, dto);
  }
  @Post('agent/:agentId/arcade/action')
  async arcadeAction(
    @Param('agentId') agentId: string,
    @Body() dto: Parameters<WalletService['arcadeAction']>[1],
    @Req() req: Request,
  ) {
    await this.authorizePaymentExecution(req, agentId);
    return this.walletService.arcadeAction(agentId, dto);
  }

  @Post('agent/:agentId/arcade/observation')
  async arcadeObservation(
    @Param('agentId') agentId: string,
    @Body() dto: Parameters<WalletService['arcadeObservation']>[1],
    @Req() req: Request,
  ) {
    await this.authorizePaymentExecution(req, agentId);
    return this.walletService.arcadeObservation(agentId, dto);
  }

  @Post('agent/:agentId/payment-sessions')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  async createPaymentSession(
    @Param('agentId') agentId: string,
    @Body()
    dto: {
      walletId: string;
      runtimeSessionId: string;
      policy: SpendingPolicy;
      budgetUnits: string;
      expiresAt: string;
    },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    if (principal?.principalType !== 'user')
      throw new ForbiddenException(
        'Only an authenticated owner can create a spending grant',
      );
    await this.walletService.assertAgentOwnership(
      agentId,
      principal.principalId,
    );
    return this.paymentSessions.create(
      agentId,
      dto.walletId,
      dto.runtimeSessionId,
      dto.policy,
      dto.budgetUnits,
      dto.expiresAt,
    );
  }
  @Get('agent/:agentId/runtime-sessions')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  runtimeSessions(@Param('agentId') agentId: string) {
    return this.walletService.runtimeSessions(agentId);
  }

  @Get('agent/:agentId/payment-sessions')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  listPaymentSessions(@Param('agentId') agentId: string) {
    return this.paymentSessions.list(agentId);
  }
  @Get('agent/:agentId/payment-sessions/:paymentSessionId/attempts')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  paymentAttempts(
    @Param('agentId') agentId: string,
    @Param('paymentSessionId') id: string,
  ) {
    return this.paymentSessions.attempts(agentId, id);
  }
  @Delete('agent/:agentId/payment-sessions/:paymentSessionId')
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  revokePaymentSession(
    @Param('agentId') agentId: string,
    @Param('paymentSessionId') id: string,
  ) {
    return this.paymentSessions.revoke(agentId, id);
  }

  private async authorizePaymentExecution(req: Request, agentId: string) {
    const principal = (req as any).principal;
    if (
      principal?.principalType === 'agent' &&
      principal.principalId === agentId
    )
      return;
    if (principal?.principalType === 'user')
      return this.walletService.assertAgentOwnership(
        agentId,
        principal.principalId,
      );
    if (
      principal?.principalType === 'service' &&
      principal.scopes?.includes('wallets:execute')
    ) {
      const caller = resolveCallerId(req);
      if (caller)
        return this.walletService.assertAgentOwnership(agentId, caller);
    }
    throw new ForbiddenException(
      'A wallet owner or the authorized agent identity is required',
    );
  }

  /** Deactivate a wallet */
  @Delete(':walletId')
  @OwnerOnly({ table: 'wallet', idParam: 'walletId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('walletId') walletId: string) {
    return this.walletService.deactivateWallet(walletId);
  }
}
