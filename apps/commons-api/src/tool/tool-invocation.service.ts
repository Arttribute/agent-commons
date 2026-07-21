import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { safeFetch } from '~/utils/safe-fetch';
import { OAuthTokenInjectionService } from '~/oauth/oauth-token-injection.service';

/** The `apiSpec` shape shared by DB, space, and app-integration tools. */
export interface DynamicToolApiSpec {
  method: string;
  baseUrl: string;
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: any;
  bodyTransform?: string;
  authType?: string;
  oauthProviderKey?: string;
  oauthTokenLocation?: 'header' | 'query' | 'body';
  oauthTokenKey?: string;
  oauthTokenPrefix?: string;
  requiresConfirmation?: boolean;
}

export interface DynamicInvocationContext {
  /** Wallet address of the user who started the conversation/session. */
  sessionInitiator?: string;
  /** Wallet address of the agent/workflow owner — used to resolve OAuth. */
  agentOwnerId?: string;
  /** Skip the requiresConfirmation gate (e.g. an approved workflow step). */
  skipConfirmation?: boolean;
}

/**
 * Single source of truth for executing a tool's `apiSpec` against an external
 * API — OAuth token injection, named body transforms (e.g. Gmail's base64url
 * RFC822 `raw`), SSRF-guarded fetch, and upstream error surfacing.
 *
 * Both the agent runtime (AgentToolsController) and the workflow executor use
 * this so app-integration nodes (Gmail, Calendar, GitHub, …) behave identically
 * whether an agent calls the tool or a workflow step runs it.
 */
@Injectable()
export class ToolInvocationService {
  private readonly logger = new Logger(ToolInvocationService.name);

  constructor(
    private readonly oauthTokenInjection: OAuthTokenInjectionService,
  ) {}

  async invokeDynamicTool(
    apiSpec: DynamicToolApiSpec,
    parsedArgs: Record<string, any>,
    context: DynamicInvocationContext = {},
  ): Promise<any> {
    const { method, baseUrl, path, headers, queryParams, bodyTemplate } =
      apiSpec;

    if (
      apiSpec.requiresConfirmation &&
      !context.skipConfirmation &&
      parsedArgs.confirmed !== true
    ) {
      throw new BadRequestException(
        'This public write action requires explicit user confirmation. Show the exact action and content to the user, then retry with confirmed=true only after they approve it.',
      );
    }

    // Fail fast when a required PATH template argument is missing — substituting
    // an empty segment (e.g. "/messages/{id}" → "/messages/") silently hits the
    // wrong endpoint. Query params are exempt: an omitted query value is valid.
    this.assertPathTemplateInputs(path, parsedArgs);

    // 1) Build the URL. Path segments are URI-encoded during substitution;
    // query values are substituted raw because URLSearchParams encodes them
    // itself (encoding twice mangles RFC3339 timestamps and reserved chars).
    let finalUrl = `${baseUrl}${this.replaceTemplate(path, parsedArgs, { encode: true })}`;
    const url = new URL(finalUrl);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        const value = this.replaceTemplate(v, parsedArgs, { encode: false });
        if (value !== '') url.searchParams.set(k, value);
      }
    }
    finalUrl = url.toString();

    // 2) Build request body for non-GET.
    let requestBody: any = undefined;
    const methodUpper = method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(methodUpper)) {
      if (apiSpec.bodyTransform) {
        requestBody = this.applyBodyTransform(apiSpec.bodyTransform, parsedArgs);
      } else if (bodyTemplate) {
        requestBody = this.buildBodyFromTemplate(bodyTemplate, parsedArgs);
      } else if (parsedArgs && Object.keys(parsedArgs).length > 0) {
        requestBody = parsedArgs;
      }
    }

    let httpRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: any;
    } = { url: finalUrl, method, headers: headers ?? {}, body: requestBody };

    // 3) Inject OAuth token if required.
    if (apiSpec.authType === 'oauth2' && apiSpec.oauthProviderKey) {
      try {
        httpRequest = await this.oauthTokenInjection.injectOAuthToken({
          toolConfig: apiSpec,
          sessionInitiator: context.sessionInitiator,
          agentOwnerId: context.agentOwnerId,
          httpRequest,
        });
      } catch (oauthError: any) {
        throw new BadRequestException(
          `OAuth authorization failed for provider "${apiSpec.oauthProviderKey}": ${oauthError.message} ` +
            `The user must connect (or reconnect) this provider in Studio → Tools before this tool can run.`,
        );
      }
    }

    // 4) Execute (SSRF-guarded: URL is user-controlled and we inject tokens).
    const response = await safeFetch(httpRequest.url, {
      method: httpRequest.method,
      headers: httpRequest.headers,
      body: httpRequest.body ? JSON.stringify(httpRequest.body) : undefined,
    });

    if (!response.ok) {
      const detail = await this.extractUpstreamError(response);
      if (response.status === 401 || response.status === 403) {
        throw new BadRequestException(
          `Upstream API rejected the request (${response.status}): ${detail}. ` +
            `The connected ${apiSpec.oauthProviderKey ?? 'API'} account is likely missing the required scopes — ` +
            `the user should reconnect the provider and grant the needed permissions.`,
        );
      }
      throw new BadRequestException(
        `Upstream API error (${response.status} ${response.statusText}): ${detail}`,
      );
    }
    return await response.json();
  }

  /** Pull a human-readable error message out of an upstream API response. */
  private async extractUpstreamError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        return (
          parsed?.error?.message ??
          parsed?.error_description ??
          (typeof parsed?.error === 'string' ? parsed.error : undefined) ??
          parsed?.message ??
          text.slice(0, 500)
        );
      } catch {
        return text.slice(0, 500) || response.statusText;
      }
    } catch {
      return response.statusText;
    }
  }

  /**
   * Named body transforms for tools whose request body cannot be expressed as a
   * JSON template (e.g. Gmail's base64url RFC822 `raw` message).
   */
  applyBodyTransform(transform: string, args: Record<string, any>): any {
    switch (transform) {
      case 'gmailRawMessage': {
        const to = String(args.to ?? '').trim();
        const subject = String(args.subject ?? '');
        const body = String(args.body ?? '');
        if (!to) {
          throw new BadRequestException(
            'Missing required "to" recipient for Gmail send',
          );
        }
        const headers = [
          `To: ${to}`,
          args.cc ? `Cc: ${String(args.cc)}` : null,
          args.bcc ? `Bcc: ${String(args.bcc)}` : null,
          `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: 7bit',
        ].filter(Boolean);
        const rfc822 = `${headers.join('\r\n')}\r\n\r\n${body}`;
        const raw = Buffer.from(rfc822, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        return { raw };
      }
      case 'xCreatePost': {
        const text = String(args.text ?? '').trim();
        if (!text) throw new BadRequestException('Post text is required');
        if (text.length > 25_000) {
          throw new BadRequestException('Post text is too long');
        }
        const replyToPostId = String(args.replyToPostId ?? '').trim();
        const quotePostId = String(args.quotePostId ?? '').trim();
        if (replyToPostId && quotePostId) {
          throw new BadRequestException(
            'A post cannot be both a reply and a quote; provide only one target',
          );
        }
        return {
          text,
          ...(replyToPostId
            ? { reply: { in_reply_to_tweet_id: replyToPostId } }
            : {}),
          ...(quotePostId ? { quote_tweet_id: quotePostId } : {}),
        };
      }
      default:
        throw new BadRequestException(`Unknown bodyTransform "${transform}"`);
    }
  }

  /** Throw a clear error if any {placeholder} in a path has no argument. */
  private assertPathTemplateInputs(
    template: string,
    args: Record<string, any>,
  ): void {
    const missing = Array.from(template.matchAll(/\{([^}]+)\}/g))
      .map((match) => match[1])
      .filter(
        (key) =>
          args[key] === undefined || args[key] === null || args[key] === '',
      );
    if (missing.length) {
      throw new BadRequestException(
        `Missing required dynamic API parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
  }

  replaceTemplate(
    template: string,
    args: Record<string, any>,
    options: { encode: boolean } = { encode: true },
  ): string {
    return template.replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = args[key];
      if (value === undefined || value === null) return '';
      return options.encode
        ? encodeURIComponent(String(value))
        : String(value);
    });
  }

  /** Recursively replace {placeholders} in a JSON template object. */
  buildBodyFromTemplate(template: any, args: Record<string, any>): any {
    if (Array.isArray(template)) {
      return template.map((elem) => this.buildBodyFromTemplate(elem, args));
    } else if (template && typeof template === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(template)) {
        result[key] = this.buildBodyFromTemplate(val, args);
      }
      return result;
    } else if (typeof template === 'string') {
      const matched = template.match(/^\{(.+)\}$/);
      if (matched) return args[matched[1]];
      return template;
    }
    return template;
  }
}
