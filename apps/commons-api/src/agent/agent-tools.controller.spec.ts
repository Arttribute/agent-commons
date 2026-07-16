import { AgentToolsController } from './agent-tools.controller';

/**
 * Focused tests for the dynamic tool executor: URL/query building must not
 * double-encode values (Google rejects encoded RFC3339 timestamps), the Gmail
 * raw-message transform must produce valid base64url RFC822, and upstream
 * error bodies must be surfaced instead of swallowed.
 */
describe('AgentToolsController dynamic tool execution', () => {
  let controller: AgentToolsController;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // The methods under test don't touch injected services.
    controller = new AgentToolsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('query param encoding', () => {
    it('sends RFC3339 timestamps unmangled (no double encoding)', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn(async (url: any) => {
        requestedUrl = String(url);
        return {
          ok: true,
          json: async () => ({ items: [] }),
        } as any;
      }) as any;

      await (controller as any).invokeDynamicTool(
        {
          method: 'GET',
          baseUrl: 'https://www.googleapis.com',
          path: '/calendar/v3/calendars/primary/events',
          queryParams: {
            timeMin: '{timeMin}',
            maxResults: '{maxResults}',
            singleEvents: 'true',
          },
        },
        { timeMin: '2026-07-10T00:00:00Z', maxResults: 10 },
        { agentId: 'agent-1' },
      );

      const url = new URL(requestedUrl);
      expect(url.searchParams.get('timeMin')).toBe('2026-07-10T00:00:00Z');
      expect(url.searchParams.get('maxResults')).toBe('10');
      expect(url.searchParams.get('singleEvents')).toBe('true');
    });

    it('omits query params whose args were not provided', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn(async (url: any) => {
        requestedUrl = String(url);
        return { ok: true, json: async () => ({}) } as any;
      }) as any;

      await (controller as any).invokeDynamicTool(
        {
          method: 'GET',
          baseUrl: 'https://gmail.googleapis.com',
          path: '/gmail/v1/users/me/messages',
          queryParams: { q: '{q}', maxResults: '{maxResults}' },
        },
        { q: 'from:someone@example.com is:unread' },
        { agentId: 'agent-1' },
      );

      const url = new URL(requestedUrl);
      expect(url.searchParams.get('q')).toBe(
        'from:someone@example.com is:unread',
      );
      expect(url.searchParams.has('maxResults')).toBe(false);
    });

    it('still encodes path segment substitutions', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn(async (url: any) => {
        requestedUrl = String(url);
        return { ok: true, json: async () => ({}) } as any;
      }) as any;

      await (controller as any).invokeDynamicTool(
        {
          method: 'GET',
          baseUrl: 'https://sheets.googleapis.com',
          path: '/v4/spreadsheets/{spreadsheetId}/values/{range}',
        },
        { spreadsheetId: 'abc123', range: 'Sheet1!A1:D20' },
        { agentId: 'agent-1' },
      );

      expect(requestedUrl).toContain('/values/Sheet1!A1%3AD20');
    });
  });

  describe('upstream error surfacing', () => {
    it('includes the upstream error message in the thrown error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({
            error: {
              code: 400,
              message: "Invalid value '2026-07-10T00%3A00%3A00Z'",
            },
          }),
      })) as any;

      await expect(
        (controller as any).invokeDynamicTool(
          {
            method: 'GET',
            baseUrl: 'https://www.googleapis.com',
            path: '/calendar/v3/calendars/primary/events',
          },
          {},
          { agentId: 'agent-1' },
        ),
      ).rejects.toThrow(/Invalid value/);
    });

    it('explains scope problems on 403', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () =>
          JSON.stringify({
            error: {
              message: 'Request had insufficient authentication scopes.',
            },
          }),
      })) as any;

      await expect(
        (controller as any).invokeDynamicTool(
          {
            method: 'GET',
            baseUrl: 'https://gmail.googleapis.com',
            path: '/gmail/v1/users/me/messages',
            oauthProviderKey: 'google_workspace',
          },
          {},
          { agentId: 'agent-1' },
        ),
      ).rejects.toThrow(/insufficient authentication scopes[\s\S]*reconnect/);
    });
  });

  describe('gmailRawMessage body transform', () => {
    it('builds a base64url RFC822 message', () => {
      const result = (controller as any).applyBodyTransform('gmailRawMessage', {
        to: 'someone@example.com',
        subject: 'Hello',
        body: 'Hi there — this is a test.',
      });

      expect(result.raw).toBeDefined();
      expect(result.raw).not.toMatch(/[+/=]/); // base64url, unpadded

      const decoded = Buffer.from(
        result.raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      expect(decoded).toContain('To: someone@example.com');
      expect(decoded).toContain('MIME-Version: 1.0');
      expect(decoded).toContain('Hi there — this is a test.');
      // RFC2047-encoded subject
      expect(decoded).toContain(
        `Subject: =?UTF-8?B?${Buffer.from('Hello', 'utf8').toString('base64')}?=`,
      );
    });

    it('includes cc/bcc when provided and rejects missing recipient', () => {
      const result = (controller as any).applyBodyTransform('gmailRawMessage', {
        to: 'a@example.com',
        cc: 'b@example.com',
        bcc: 'c@example.com',
        subject: 's',
        body: 'b',
      });
      const decoded = Buffer.from(
        result.raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      expect(decoded).toContain('Cc: b@example.com');
      expect(decoded).toContain('Bcc: c@example.com');

      expect(() =>
        (controller as any).applyBodyTransform('gmailRawMessage', {
          subject: 's',
          body: 'b',
        }),
      ).toThrow(/recipient/);
    });
  });

  describe('X public write safety', () => {
    it('builds a post, reply, or quote body without leaking control args', () => {
      expect(
        (controller as any).applyBodyTransform('xCreatePost', {
          text: 'Hello from Agent Commons',
          confirmed: true,
        }),
      ).toEqual({ text: 'Hello from Agent Commons' });
      expect(
        (controller as any).applyBodyTransform('xCreatePost', {
          text: 'A reply',
          replyToPostId: '123',
          confirmed: true,
        }),
      ).toEqual({
        text: 'A reply',
        reply: { in_reply_to_tweet_id: '123' },
      });
      expect(() =>
        (controller as any).applyBodyTransform('xCreatePost', {
          text: 'Ambiguous',
          replyToPostId: '123',
          quotePostId: '456',
        }),
      ).toThrow(/both a reply and a quote/);
    });

    it('blocks a public write until explicit confirmation is present', async () => {
      await expect(
        (controller as any).invokeDynamicTool(
          {
            method: 'POST',
            baseUrl: 'https://api.x.com',
            path: '/2/tweets',
            bodyTransform: 'xCreatePost',
            requiresConfirmation: true,
          },
          { text: 'Not approved yet' },
          { agentId: 'agent-1' },
        ),
      ).rejects.toThrow(/explicit user confirmation/);
    });
  });

  describe('internal caller assertion', () => {
    const env = process.env;

    afterEach(() => {
      process.env = env;
    });

    it('rejects calls without the internal secret when configured', () => {
      process.env = {
        ...env,
        API_SECRET_KEY: 'shh',
        API_AUTH_REQUIRED: 'true',
      };
      expect(() =>
        (controller as any).assertInternalCaller(undefined),
      ).toThrow();
      expect(() => (controller as any).assertInternalCaller('wrong')).toThrow();
      expect(() =>
        (controller as any).assertInternalCaller('shh'),
      ).not.toThrow();
    });

    it('is a no-op when auth is disabled (local dev)', () => {
      process.env = {
        ...env,
        API_SECRET_KEY: 'shh',
        API_AUTH_REQUIRED: 'false',
      };
      expect(() =>
        (controller as any).assertInternalCaller(undefined),
      ).not.toThrow();
    });
  });
});
