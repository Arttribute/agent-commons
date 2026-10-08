import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { buildGoogleModel } = require(
  join(
    root,
    'dist/nest/src/modules/model-provider/providers/google.provider.js',
  ),
);
const parameters = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    options: { $ref: '#/$defs/Options' },
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
const fetchOriginal = globalThis.fetch;
let sent;
globalThis.fetch = async (url, options) => {
  assert.ok(
    String(url instanceof Request ? url.url : url).startsWith(
      'https://generativelanguage.googleapis.com/',
    ),
  );
  sent = JSON.parse(options?.body ?? (await url.clone().text()));
  return new Response(
    'data: ' +
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'analyse',
                    args: { code: 'print(1)', options: { timeout: 30 } },
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      }) +
      '\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};
try {
  const model = buildGoogleModel({
    provider: 'google',
    modelId: 'gemini-3.5-flash-lite',
    apiKey: 'transport-test-only',
  });
  const result = await model
    .bindTools([
      {
        type: 'function',
        function: {
          name: 'analyse',
          description: 'Run a verified analysis',
          parameters,
        },
      },
    ])
    .invoke('Run the analysis.');
  const declarations = sent.tools.flatMap(
    (tool) => tool.functionDeclarations || [],
  );
  assert.deepEqual(declarations, [
    {
      name: 'analyse',
      description: 'Run a verified analysis',
      parametersJsonSchema: parameters,
    },
  ]);
  assert.equal(result.tool_calls[0].name, 'analyse');
  assert.deepEqual(result.tool_calls[0].args, {
    code: 'print(1)',
    options: { timeout: 30 },
  });
  assert.equal(JSON.stringify(parameters), before);
  console.log(
    'Actual Gemini SDK transport and streamed tool call passed; no provider credentials or network requests used.',
  );
} finally {
  globalThis.fetch = fetchOriginal;
}
