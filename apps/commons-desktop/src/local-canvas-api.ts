import type { PrivateLocalRuntime } from './runtime';
import type { LocalApiResult } from './local-knowledge-api';

export async function handleLocalCanvasApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): Promise<LocalApiResult> {
  try {
    const parts = url.pathname.split('/').filter(Boolean).slice(2).map(decodeURIComponent);
    let data: unknown;
    if (parts.join('/') === 'models' && method === 'GET') data = runtime.canvasModelCatalog();
    else if (parts.join('/') === 'projects/open' && method === 'POST' && typeof body.artifactId === 'string') data = runtime.canvas.open(body.artifactId);
    else if (parts[0] === 'projects' && parts[1]) {
      const projectId = parts[1];
      if (parts.length === 2 && method === 'GET') data = runtime.canvas.get(projectId);
      else if (parts.length === 2 && method === 'PATCH') data = runtime.canvas.patch(projectId, body);
      else if (parts.length === 3 && parts[2] === 'annotations' && method === 'POST') data = runtime.canvas.createNote(projectId, body);
      else if (parts.length === 4 && parts[2] === 'annotations' && method === 'PATCH') data = runtime.canvas.updateNote(projectId, parts[3], body);
      else return { status: 404, body: { message: 'Unsupported Local Canvas operation' } };
    } else return { status: 404, body: { message: 'Unsupported Local Canvas operation' } };
    return { status: 200, body: { data } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local Canvas operation failed';
    return { status: message.includes('not found') ? 404 : 400, body: { message } };
  }
}
