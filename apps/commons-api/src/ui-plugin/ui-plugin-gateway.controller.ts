import {
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import {
  GatewayError,
  UiPluginGatewayService,
  type GatewayRequest,
} from './ui-plugin-gateway.service';

@Controller({ version: '1', path: 'ui-plugins' })
export class UiPluginGatewayController {
  constructor(private readonly gateway: UiPluginGatewayService) {}

  /**
   * JSON-RPC shaped responses so the web host can relay results and errors to
   * the app frame without translating HTTP semantics.
   */
  @Post(':pluginId/gateway')
  async dispatch(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Body() body: { request?: GatewayRequest; confirmed?: boolean },
  ) {
    const principal = (request as any).principal as ApiKeyPrincipal | undefined;
    const ownerId = resolveCallerId(request);
    if (!ownerId) {
      return { error: { code: -32001, message: 'Sign in to use this app.' } };
    }
    try {
      const result = await this.gateway.dispatch(
        ownerId,
        pluginId,
        body?.request ?? ({} as GatewayRequest),
        {
          confirmed: body?.confirmed === true,
          workspaceId: principal?.workspaceId ?? null,
        },
      );
      return { result };
    } catch (error) {
      if (error instanceof GatewayError) {
        return { error: { code: error.code, message: error.message } };
      }
      if (error instanceof HttpException) {
        const response = error.getResponse() as any;
        const message =
          typeof response === 'string'
            ? response
            : Array.isArray(response?.message)
              ? response.message.join(', ')
              : (response?.message ?? error.message);
        return {
          error: {
            code: error.getStatus() === 403 ? -32001 : -32050,
            message: String(message).slice(0, 300),
          },
        };
      }
      return {
        error: {
          code: -32603,
          message: 'The Commons request could not be completed.',
        },
      };
    }
  }
}
