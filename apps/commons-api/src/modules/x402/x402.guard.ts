import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';

// ── Metadata key ─────────────────────────────────────────────────────────────

export const X402_METADATA = 'x402:paymentRequirements';

export interface X402PaymentConfig {
  /** Amount in USD e.g. 0.001 */
  amount: number;
  /** Wallet address that receives payment (defaults to env X402_PAYEE_ADDRESS) */
  payTo?: string;
  /** Human-readable description shown in the 402 response */
  description?: string;
  /** Network (default: base-sepolia) */
  network?: string;
}

/**
 * Marks a route as requiring an x402 micropayment.
 *
 * @example
 * \@RequirePayment({ amount: 0.001, description: 'Agent run fee' })
 * \@Post('run')
 * async runAgent() {}
 */
export const RequirePayment = (config: X402PaymentConfig) =>
  SetMetadata(X402_METADATA, config);

// ── Guard ─────────────────────────────────────────────────────────────────────

@Injectable()
export class X402Guard implements CanActivate {
  private readonly logger = new Logger(X402Guard.name);
  private readonly verifyFn: (payload: any, requirements: any) => Promise<any>;
  private readonly settleFn: (payload: any, requirements: any) => Promise<any>;

  constructor(private readonly reflector: Reflector) {
    // Lazy-require avoids ESM/CJS interop issues at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useFacilitator } = require('x402/verify');
    const facilitator = useFacilitator(
      process.env.X402_FACILITATOR_URL
        ? { url: process.env.X402_FACILITATOR_URL }
        : undefined,
    );
    this.verifyFn = facilitator.verify;
    this.settleFn = facilitator.settle;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<X402PaymentConfig | undefined>(
      X402_METADATA,
      [context.getHandler(), context.getClass()],
    );

    // Route has no payment requirement
    if (!config) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const payTo = config.payTo ?? process.env.X402_PAYEE_ADDRESS ?? '';
    if (!payTo) {
      this.logger.error('X402_PAYEE_ADDRESS env var is not set');
      res.status(500).json({ error: 'Payment configuration error on server' });
      return false;
    }

    const network = config.network ?? process.env.X402_NETWORK ?? 'base-sepolia';

    const paymentRequirements = {
      scheme: 'exact',
      network,
      maxAmountRequired: String(Math.round(config.amount * 1_000_000)), // USDC 6 decimals
      resource: `${req.method} ${req.path}`,
      description: config.description ?? 'Payment required',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: USDC_BY_NETWORK[network] ?? USDC_BY_NETWORK['base-sepolia'],
      outputSchema: null,
      extra: null,
    };

    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      return this.send402(res, paymentRequirements);
    }

    try {
      const payload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf-8'),
      );

      const verifyResult = await this.verifyFn(payload, paymentRequirements);

      if (!verifyResult.isValid) {
        this.logger.warn(`Invalid x402 payment: ${verifyResult.invalidReason}`);
        return this.send402(res, paymentRequirements, verifyResult.invalidReason);
      }

      // Settle (inform facilitator) — failure is non-blocking
      this.settleFn(payload, paymentRequirements).catch((err: Error) =>
        this.logger.warn(`x402 settle failed: ${err.message}`),
      );

      // Attach to request so controllers can inspect it
      (req as any).x402Payment = { payload, paymentRequirements };

      return true;
    } catch (err: any) {
      this.logger.warn(`x402 header decode error: ${err.message}`);
      return this.send402(res, paymentRequirements, 'Malformed payment header');
    }
  }

  private send402(res: Response, paymentRequirements: object, error?: string): false {
    res.status(402).json({
      x402Version: 1,
      error: error ?? 'Payment Required',
      accepts: [paymentRequirements],
    });
    return false;
  }
}

// ── USDC addresses by network ─────────────────────────────────────────────────

const USDC_BY_NETWORK: Record<string, string> = {
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'base':         '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'ethereum':     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'polygon':      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};
