// app/api/oauth/[...path]/route.ts
import { NextResponse } from 'next/server';
import { backendAuthHeaders } from '@/lib/api-headers';
import { getCurrentCommonsUser, requireCurrentCommonsUser } from '@/lib/current-user';

const baseUrl =
  process.env.NEST_API_BASE_URL ||
  process.env.NEXT_PUBLIC_NEST_API_BASE_URL ||
  process.env.AGENT_COMMONS_API_URL ||
  process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;

function requireBaseUrl() {
  if (!baseUrl) {
    throw new Error('Agent Commons API base URL is not configured');
  }
  return baseUrl.replace(/\/$/, '');
}

function redactSecrets(value: string) {
  return value
    .replace(/\bsk_(test|live)_[A-Za-z0-9_]+/g, 'sk_$1_[redacted]')
    .replace(/\bpk_(test|live)_[A-Za-z0-9_]+/g, 'pk_$1_[redacted]')
    .replace(/\bwhsec_[A-Za-z0-9_]+/g, 'whsec_[redacted]');
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? redactSecrets(error.message) : 'Unknown error';
}

function logOAuthProxyError(method: string, error: unknown) {
  console.error(`OAuth ${method} error:`, {
    message: getSafeErrorMessage(error),
  });
}

/**
 * Catch-all OAuth API proxy
 * Forwards all requests to /api/oauth/* to the NestJS backend at /v1/oauth/*
 */

/**
 * GET /api/oauth/[...path]
 * Handles:
 * - GET /api/oauth/providers - List providers
 * - GET /api/oauth/providers/:providerKey - Get provider details
 * - GET /api/oauth/connections - List user's connections
 * - GET /api/oauth/connections/:connectionId - Get connection details
 * - GET /api/oauth/connections/:connectionId/test - Test connection
 * - GET /api/oauth/callback/:providerKey - OAuth callback
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathArray } = await params;
    const path = pathArray.join('/');
    const { searchParams } = new URL(request.url);
    const serviceAllowed = path.startsWith('providers') || path.startsWith('callback/');
    const user = await getCurrentCommonsUser();

    // Build query string
    const forwardedParams = new URLSearchParams(searchParams);
    if (path === 'connections' && user?.userId) {
      forwardedParams.set('ownerId', user.userId);
      forwardedParams.set('ownerType', 'user');
    }
    const queryString = forwardedParams.toString();
    const apiBaseUrl = requireBaseUrl();
    const url = queryString
      ? `${apiBaseUrl}/v1/oauth/${path}?${queryString}`
      : `${apiBaseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      ...(await backendAuthHeaders({ allowServiceKey: serviceAllowed })),
      'Content-Type': 'application/json',
    };

    // Copy important headers
    if (user?.userId) {
      headers['x-initiator'] = user.userId;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });

    // Handle redirect responses (from OAuth callback)
    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location');
      if (location) {
        return NextResponse.redirect(new URL(location, request.url));
      }
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    logOAuthProxyError('GET', error);
    return NextResponse.json({ error: 'OAuth request failed.' }, { status: 500 });
  }
}

/**
 * POST /api/oauth/[...path]
 * Handles:
 * - POST /api/oauth/connect - Initiate OAuth flow
 * - POST /api/oauth/connections/:connectionId/refresh - Refresh token
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathArray } = await params;
    const path = pathArray.join('/');
    const body = await request.json();
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;

    const apiBaseUrl = requireBaseUrl();
    const url = `${apiBaseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      ...(await backendAuthHeaders()),
      'Content-Type': 'application/json',
    };

    headers['x-initiator'] = user.userId;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, ownerId: user.userId, ownerType: 'user' }),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    logOAuthProxyError('POST', error);
    return NextResponse.json({ error: 'OAuth request failed.' }, { status: 500 });
  }
}

/**
 * PUT /api/oauth/[...path]
 * Handles:
 * - PUT /api/oauth/connections/:connectionId - Update connection metadata
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathArray } = await params;
    const path = pathArray.join('/');
    const body = await request.json();
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;

    const apiBaseUrl = requireBaseUrl();
    const url = `${apiBaseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      ...(await backendAuthHeaders()),
      'Content-Type': 'application/json',
    };

    // Copy important headers
    headers['x-initiator'] = user.userId;

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    logOAuthProxyError('PUT', error);
    return NextResponse.json({ error: 'OAuth request failed.' }, { status: 500 });
  }
}

/**
 * DELETE /api/oauth/[...path]
 * Handles:
 * - DELETE /api/oauth/connections/:connectionId - Revoke connection
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathArray } = await params;
    const path = pathArray.join('/');
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;

    const apiBaseUrl = requireBaseUrl();
    const url = `${apiBaseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      ...(await backendAuthHeaders()),
      'Content-Type': 'application/json',
    };

    // Copy important headers
    headers['x-initiator'] = user.userId;

    const res = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    logOAuthProxyError('DELETE', error);
    return NextResponse.json({ error: 'OAuth request failed.' }, { status: 500 });
  }
}
