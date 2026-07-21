import { ToolInvocationService } from './tool-invocation.service';

/**
 * The shared dynamic tool executor (used by both the agent runtime and the
 * workflow executor): URL/query building must not double-encode values (Google
 * rejects encoded RFC3339 timestamps), the Gmail raw-message transform must
 * produce valid base64url RFC822, upstream error bodies must be surfaced, and
 * public writes must be gated on explicit confirmation.
 */
describe('ToolInvocationService', () => {
  let service: ToolInvocationService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // OAuth injection is only exercised for oauth2 tools, which these tests
    // don't hit, so a bare stub is sufficient.
    service = new ToolInvocationService({} as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('query param encoding', () => {
    it('sends RFC3339 timestamps unmangled (no double encoding)', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn(async (url: any) => {
        requestedUrl = String(url);
        return { ok: true, json: async () => ({ items: [] }) } as any;
      }) as any;

      await service.invokeDynamicTool(
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

      await service.invokeDynamicTool(
        {
          method: 'GET',
          baseUrl: 'https://gmail.googleapis.com',
          path: '/gmail/v1/users/me/messages',
          queryParams: { q: '{q}', maxResults: '{maxResults}' },
        },
        { q: 'from:someone@example.com is:unread' },
      );

      const url = new URL(requestedUrl);
      expect(url.searchParams.get('q')).toBe(
        'from:someone@example.com is:unread',
      );
      expect(url.searchParams.has('maxResults')).toBe(false);
    });

    it('throws a clear error when a required path template argument is missing', async () => {
      await expect(
        service.invokeDynamicTool(
          {
            method: 'GET',
            baseUrl: 'https://example.com',
            path: '/countries/{country}',
          },
          {},
        ),
      ).rejects.toThrow('Missing required dynamic API parameter: country');
    });

    it('still encodes path segment substitutions', async () => {
      let requestedUrl = '';
      global.fetch = jest.fn(async (url: any) => {
        requestedUrl = String(url);
        return { ok: true, json: async () => ({}) } as any;
      }) as any;

      await service.invokeDynamicTool(
        {
          method: 'GET',
          baseUrl: 'https://sheets.googleapis.com',
          path: '/v4/spreadsheets/{spreadsheetId}/values/{range}',
        },
        { spreadsheetId: 'abc123', range: 'Sheet1!A1:D20' },
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
            error: { code: 400, message: "Invalid value '2026-07-10T00%3A00%3A00Z'" },
          }),
      })) as any;

      await expect(
        service.invokeDynamicTool(
          {
            method: 'GET',
            baseUrl: 'https://www.googleapis.com',
            path: '/calendar/v3/calendars/primary/events',
          },
          {},
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
            error: { message: 'Request had insufficient authentication scopes.' },
          }),
      })) as any;

      await expect(
        service.invokeDynamicTool(
          {
            method: 'GET',
            baseUrl: 'https://gmail.googleapis.com',
            path: '/gmail/v1/users/me/messages',
            oauthProviderKey: 'google_workspace',
          },
          {},
        ),
      ).rejects.toThrow(/insufficient authentication scopes[\s\S]*reconnect/);
    });
  });

  describe('gmailRawMessage body transform', () => {
    it('builds a base64url RFC822 message', () => {
      const result = service.applyBodyTransform('gmailRawMessage', {
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
      expect(decoded).toContain(
        `Subject: =?UTF-8?B?${Buffer.from('Hello', 'utf8').toString('base64')}?=`,
      );
    });

    it('includes cc/bcc when provided and rejects missing recipient', () => {
      const result = service.applyBodyTransform('gmailRawMessage', {
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
        service.applyBodyTransform('gmailRawMessage', { subject: 's', body: 'b' }),
      ).toThrow(/recipient/);
    });
  });

  describe('X public write safety', () => {
    it('builds a post, reply, or quote body without leaking control args', () => {
      expect(
        service.applyBodyTransform('xCreatePost', {
          text: 'Hello from Agent Commons',
          confirmed: true,
        }),
      ).toEqual({ text: 'Hello from Agent Commons' });
      expect(
        service.applyBodyTransform('xCreatePost', {
          text: 'A reply',
          replyToPostId: '123',
          confirmed: true,
        }),
      ).toEqual({ text: 'A reply', reply: { in_reply_to_tweet_id: '123' } });
      expect(() =>
        service.applyBodyTransform('xCreatePost', {
          text: 'Ambiguous',
          replyToPostId: '123',
          quotePostId: '456',
        }),
      ).toThrow(/both a reply and a quote/);
    });

    it('blocks a public write until explicit confirmation is present', async () => {
      await expect(
        service.invokeDynamicTool(
          {
            method: 'POST',
            baseUrl: 'https://api.x.com',
            path: '/2/tweets',
            bodyTransform: 'xCreatePost',
            requiresConfirmation: true,
          },
          { text: 'Not approved yet' },
        ),
      ).rejects.toThrow(/explicit user confirmation/);
    });
  });
});
