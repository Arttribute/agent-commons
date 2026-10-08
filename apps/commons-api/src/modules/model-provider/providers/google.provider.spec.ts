import { googleJsonToolDefinitions } from './google.provider';

describe('Gemini JSON tool schemas', () => {
  it('keeps definitions, references, validation and named properties intact on the JSON Schema field', () => {
    const parameters = {
      type: 'object',
      properties: {
        code: { type: 'string' },
        options: { $ref: '#/$defs/Options' },
        $defs: { type: 'string' },
      },
      required: ['code'],
      additionalProperties: false,
      $defs: {
        Options: {
          type: 'object',
          properties: { timeout: { type: 'integer', minimum: 1 } },
          required: ['timeout'],
        },
      },
    };
    const before = JSON.stringify(parameters);
    expect(
      googleJsonToolDefinitions([
        {
          type: 'function',
          function: {
            name: 'analyse',
            description: 'Run a verified analysis',
            parameters,
          },
        },
      ]),
    ).toEqual([
      {
        functionDeclarations: [
          {
            name: 'analyse',
            description: 'Run a verified analysis',
            parametersJsonSchema: parameters,
          },
        ],
      },
    ]);
    expect(JSON.stringify(parameters)).toBe(before);
  });
  it('preserves provider-native tools and handles functions without arguments', () => {
    const native = { googleSearch: {} };
    const output = googleJsonToolDefinitions([
      native as any,
      { type: 'function', function: { name: 'status' } } as any,
    ]);
    expect(output).toEqual([
      native,
      {
        functionDeclarations: [
          { name: 'status', description: 'A function available to call.' },
        ],
      },
    ]);
    expect(output[0]).toBe(native);
  });
});
