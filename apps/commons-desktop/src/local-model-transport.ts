import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

/** Ollama can buffer an entire tool call. Use the caller's explicit deadline,
 * without fetch's independent five-minute timeout between response chunks. */
export function requestLocalModel(url: string, options: { body: string; signal: AbortSignal }): Promise<Response> {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Local inference requires a loopback endpoint.');
  return new Promise((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
      method: 'POST', signal: options.signal,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) },
    }, (incoming) => {
      const status = incoming.statusCode || 502;
      try {
        resolve(new Response([204, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status }));
      } catch (error) { incoming.destroy(); reject(error); }
    });
    request.on('error', reject);
    request.end(options.body);
  });
}
