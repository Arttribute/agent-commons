'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { OAuthProvider, OAuthProviderDetails } from '@/types/oauth';
import { useToast } from '@/hooks/use-toast';

function OAuthConnectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { status } = useSession();
  const [provider, setProvider] = useState<OAuthProviderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const providerKey = searchParams.get('provider');
  const returnUrl = searchParams.get('returnUrl') || '/studio';
  const requestedScopes = searchParams.get('scopes');
  const toolLabel = searchParams.get('label');

  const fetchProvider = useCallback(async (key: string) => {
    try {
      let res = await fetch(`/api/oauth/providers/${key}`);
      if (!res.ok && key === 'google_workspace') {
        const providersRes = await fetch('/api/oauth/providers');
        const providersData = await providersRes.json().catch(() => ({}));
        const alias = providersData.providers?.find((item: OAuthProvider) =>
          ['google_workspace', 'google', 'google_oauth'].includes(item.providerKey)
        );
        if (alias?.providerKey && alias.providerKey !== key) {
          res = await fetch(`/api/oauth/providers/${alias.providerKey}`);
        }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch provider');
      }
      const data = await res.json();
      setProvider(data.provider);
    } catch (error) {
      console.error('Error fetching provider:', error);
      toast({
        title: 'Error',
        description: 'Failed to load OAuth provider',
        variant: 'destructive',
      });
      router.push(returnUrl);
    } finally {
      setLoading(false);
    }
  }, [returnUrl, router, toast]);

  useEffect(() => {
    if (!providerKey) {
      toast({
        title: 'Error',
        description: 'Missing provider parameter',
        variant: 'destructive',
      });
      router.push(returnUrl);
      return;
    }

    // Fetch provider details
    fetchProvider(providerKey);
  }, [fetchProvider, providerKey, returnUrl, router, toast]);

  const handleConnect = async () => {
    if (!providerKey || !provider) return;
    if (status !== 'authenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.href)}`);
      return;
    }

    setConnecting(true);

    try {
      window.sessionStorage.setItem('oauthReturnUrl', returnUrl);
      window.sessionStorage.setItem('oauthProviderLabel', toolLabel || provider.displayName);
      const scopes = requestedScopes
        ? requestedScopes.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)
        : provider.defaultScopes;
      // Initiate OAuth flow
      const res = await fetch('/api/oauth/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerKey: provider.providerKey,
          scopes,
          redirectUri: `${window.location.origin}/api/oauth/callback/${provider.providerKey}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to initiate OAuth flow');
      }

      const data = await res.json();

      // Redirect to OAuth provider's authorization page
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error('Error connecting:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect to OAuth provider',
        variant: 'destructive',
      });
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!provider) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          {/* Provider Logo */}
          {provider.logoUrl && (
            <div className="mb-6">
              <img
                src={provider.logoUrl}
                alt={provider.displayName}
                className="h-16 w-16 mx-auto rounded-lg"
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Connect {toolLabel || provider.displayName}
          </h1>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {toolLabel
              ? `Authorize the scopes needed for ${toolLabel}.`
              : provider.description ||
              `Connect your ${provider.displayName} account to enable tools that require access to your ${provider.displayName} data.`}
          </p>

          {/* Permissions */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 text-left">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              This will allow agents to:
            </h2>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              {(requestedScopes
                ? requestedScopes.split(/\s+/).filter(Boolean)
                : provider.defaultScopes
              ).slice(0, 3).map((scope, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2">•</span>
                  <span className="break-all">{scope}</span>
                </li>
              ))}
              {(requestedScopes
                ? requestedScopes.split(/\s+/).filter(Boolean)
                : provider.defaultScopes
              ).length > 3 && (
                <li className="text-gray-500 dark:text-gray-500 italic">
                  and {(requestedScopes
                    ? requestedScopes.split(/\s+/).filter(Boolean)
                    : provider.defaultScopes
                  ).length - 3} more...
                </li>
              )}
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {connecting ? 'Connecting...' : `Connect ${toolLabel || provider.displayName}`}
            </button>

            <button
              onClick={() => router.push(returnUrl)}
              disabled={connecting}
              className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Security Note */}
          <p className="mt-6 text-xs text-gray-500 dark:text-gray-500">
            Your credentials are encrypted and stored securely. You can revoke
            access at any time from your settings.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OAuthConnectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <OAuthConnectContent />
    </Suspense>
  );
}
