// app/api/oauth/[...path]/route.ts
import { NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

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
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');
    const { searchParams } = new URL(request.url);

    // Build query string
    const queryString = searchParams.toString();
    const url = queryString
      ? `${baseUrl}/v1/oauth/${path}?${queryString}`
      : `${baseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Copy important headers
    const initiator = request.headers.get('x-initiator');
    if (initiator) {
      headers['x-initiator'] = initiator;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    // Handle redirect responses (from OAuth callback)
    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location');
      if (location) {
        return NextResponse.redirect(location);
      }
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('OAuth GET error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');
    const body = await request.json();

    const url = `${baseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Copy important headers
    const initiator = request.headers.get('x-initiator');
    if (initiator) {
      headers['x-initiator'] = initiator;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('OAuth POST error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/oauth/[...path]
 * Handles:
 * - PUT /api/oauth/connections/:connectionId - Update connection metadata
 */
export async function PUT(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');
    const body = await request.json();

    const url = `${baseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Copy important headers
    const initiator = request.headers.get('x-initiator');
    if (initiator) {
      headers['x-initiator'] = initiator;
    }

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
  } catch (error: any) {
    console.error('OAuth PUT error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/oauth/[...path]
 * Handles:
 * - DELETE /api/oauth/connections/:connectionId - Revoke connection
 */
export async function DELETE(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');

    const url = `${baseUrl}/v1/oauth/${path}`;

    // Forward headers from the original request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Copy important headers
    const initiator = request.headers.get('x-initiator');
    if (initiator) {
      headers['x-initiator'] = initiator;
    }

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
  } catch (error: any) {
    console.error('OAuth DELETE error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
