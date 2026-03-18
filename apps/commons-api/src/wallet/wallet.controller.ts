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
import { WalletService } from './wallet.service';
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

  /** Deactivate a wallet */
  @Delete(':walletId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('walletId') walletId: string) {
    return this.walletService.deactivateWallet(walletId);
  }
}
