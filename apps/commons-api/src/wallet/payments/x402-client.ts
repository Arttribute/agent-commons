import { BadRequestException } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { safeFetch } from '~/utils/safe-fetch';
import { assertRequirement, type SpendingPolicy } from './policy';
import { readSettlement } from './x402-settlement';
export interface PaymentExecution {
  policy: SpendingPolicy;
  privateKey: Hex;
  address: string;
  reserve(amount: string): Promise<string>;
  finish(
    id: string,
    state: 'settled' | 'unknown',
    receipt: unknown,
  ): Promise<void>;
}
export async function payX402Challenge(
  url: string,
  init: RequestInit,
  challenge: Response,
  execution: PaymentExecution,
): Promise<Response> {
  // Dynamic imports isolate the protocol stack from free-wallet paths and support Nest CJS builds.
  const [{ x402Client, x402HTTPClient }, { ExactEvmScheme }] =
    await Promise.all([
      import('@x402/core/client'),
      import('@x402/evm/exact/client'),
    ]);
  const client = new x402Client().setSpendControls({
    allowedAssets: [
      {
        network: execution.policy.network,
        asset: execution.policy.asset,
        maxAmountPerPayment: execution.policy.maxPaymentUnits,
      },
    ],
  });
  if (execution.policy.network === 'hedera:testnet') {
    const [{ ExactHederaScheme }, { createClientHederaSigner, PrivateKey }] =
      await Promise.all([
        import('@x402/hedera/exact/client'),
        import('@x402/hedera'),
      ]);
    const accountResponse = await fetch(
      `https://testnet.mirrornode.hedera.com/api/v1/accounts/${execution.address}`,
      { signal: AbortSignal.timeout(10000), redirect: 'error' },
    );
    if (!accountResponse.ok)
      throw new BadRequestException(
        'Activate and fund this existing ECDSA wallet on Hedera testnet first',
      );
    const account = (await accountResponse.json()) as {
      account: string;
      evm_address: string;
    };
    if (
      account.evm_address?.toLowerCase() !== execution.address.toLowerCase() ||
      !/^0\.0\.\d+$/.test(account.account)
    )
      throw new BadRequestException(
        'Hedera account does not match this wallet',
      );
    const associationResponse = await fetch(
      `https://testnet.mirrornode.hedera.com/api/v1/accounts/${account.account}/tokens?token.id=0.0.429274`,
      { signal: AbortSignal.timeout(10000), redirect: 'error' },
    );
    if (!associationResponse.ok)
      throw new BadRequestException('Unable to check Hedera USDC association');
    const association = (await associationResponse.json()) as {
      tokens: { token_id: string }[];
    };
    if (!association.tokens?.some((t) => t.token_id === '0.0.429274'))
      throw new BadRequestException(
        'Associate testnet USDC with this Hedera account before paying',
      );
    client.register(
      'hedera:testnet',
      new ExactHederaScheme(
        createClientHederaSigner(
          account.account,
          PrivateKey.fromStringECDSA(execution.privateKey.slice(2)),
          { network: 'hedera:testnet' },
        ),
      ),
    );
  } else
    client.register(
      execution.policy.network,
      new ExactEvmScheme(privateKeyToAccount(execution.privateKey)),
    );
  client.registerPolicy((version, requirements) =>
    version === 2
      ? requirements.filter((r) => {
          try {
            assertRequirement(execution.policy, r, url);
            return true;
          } catch {
            return false;
          }
        })
      : [],
  );
  const httpClient = new x402HTTPClient(client);
  const header = challenge.headers.get('PAYMENT-REQUIRED');
  if (!header || header.length > 65536)
    throw new BadRequestException(
      'A bounded x402 v2 PAYMENT-REQUIRED header is required',
    );
  const required = httpClient.getPaymentRequiredResponse((name) =>
    challenge.headers.get(name),
  );
  let attemptId: string | undefined;
  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    assertRequirement(execution.policy, selectedRequirements, url);
    attemptId = await execution.reserve(selectedRequirements.amount);
  });
  try {
    const payload = await httpClient.createPaymentPayload(required);
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(
      httpClient.encodePaymentSignatureHeader(payload),
    ))
      headers.set(name, value);
    const response = await safeFetch(url, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    // A rejected payment (for example an unfunded wallet) has no settlement
    // header. Preserve that 402 response instead of throwing an unrelated 500.
    const settlement = readSettlement(response, (getHeader) =>
      httpClient.getPaymentSettleResponse(getHeader),
    );
    if (attemptId)
      await execution.finish(
        attemptId,
        settlement?.success && !!settlement.transaction ? 'settled' : 'unknown',
        settlement ?? { status: response.status },
      );
    return response;
  } catch (error) {
    if (attemptId)
      await execution.finish(attemptId, 'unknown', {
        reason: 'No confirmed receipt; budget remains reserved',
      });
    throw error;
  }
}
