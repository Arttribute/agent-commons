import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WalletService, TransferDto } from './wallet.service';
import { CreateWalletDto } from './dto/wallet.dto';

@Controller('v1/wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /** Create a new wallet for an agent */
  @Post()
  create(@Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(dto);
  }

  /** List all wallets for an agent */
  @Get('agent/:agentId')
  listByAgent(@Param('agentId') agentId: string) {
    return this.walletService.listWallets(agentId);
  }

  /** Get primary active wallet for an agent */
  @Get('agent/:agentId/primary')
  getPrimary(@Param('agentId') agentId: string) {
    return this.walletService.getPrimaryWallet(agentId);
  }

  /** Get a specific wallet */
  @Get(':walletId')
  getWallet(@Param('walletId') walletId: string) {
    return this.walletService.getWallet(walletId);
  }

  /** Get USDC and native balance for a wallet */
  @Get(':walletId/balance')
  getBalance(@Param('walletId') walletId: string) {
    return this.walletService.getBalance(walletId);
  }

  /** Transfer USDC or ETH from a wallet to another address */
  @Post(':walletId/transfer')
  transfer(@Param('walletId') walletId: string, @Body() dto: TransferDto) {
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
    @Body() dto: { url: string; method?: string; headers?: Record<string, string>; body?: string },
  ) {
    const res = await this.walletService.x402Fetch(agentId, dto.url, {
      method: dto.method ?? 'GET',
      headers: dto.headers,
      body: dto.body,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await res.json()
      : await res.text();
    return { status: res.status, body: responseBody };
  }

  /** Deactivate a wallet */
  @Delete(':walletId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('walletId') walletId: string) {
    return this.walletService.deactivateWallet(walletId);
  }
}
