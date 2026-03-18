// hooks/use-oauth-connections.ts

import { useState, useEffect } from 'react';
import {
  OAuthProvider,
  OAuthConnection,
  ListOAuthProvidersResponse,
  ListOAuthConnectionsResponse,
} from '@/types/oauth';
import { useToast } from '@/hooks/use-toast';

export function useOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/oauth/providers');
      if (!res.ok) {
        throw new Error('Failed to fetch providers');
      }

      const data: ListOAuthProvidersResponse = await res.json();
      setProviders(data.providers);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch providers';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return { providers, loading, error, refetch: fetchProviders };
}

export function useOAuthConnections(ownerId: string, ownerType: 'user' | 'agent' = 'user') {
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (ownerId) {
      fetchConnections();
    }
  }, [ownerId, ownerType]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        ownerId,
        ownerType,
      });

      const res = await fetch(`/api/oauth/connections?${params}`, {
        headers: {
          'x-initiator': ownerId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch connections');
      }

      const data: ListOAuthConnectionsResponse = await res.json();
      setConnections(data.connections);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch connections';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeConnection = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/oauth/connections/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'x-initiator': ownerId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to revoke connection');
      }

      toast({
        title: 'Success',
        description: 'Connection revoked successfully',
      });

      // Refresh connections list
      await fetchConnections();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to revoke connection';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const refreshToken = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/oauth/connections/${connectionId}/refresh`, {
        method: 'POST',
        headers: {
          'x-initiator': ownerId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to refresh token');
      }

      toast({
        title: 'Success',
        description: 'Token refreshed successfully',
      });

      // Refresh connections list
      await fetchConnections();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to refresh token';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const testConnection = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/oauth/connections/${connectionId}/test`, {
        headers: {
          'x-initiator': ownerId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to test connection');
      }

      const data = await res.json();

      toast({
        title: data.accessTokenValid ? 'Connection Valid' : 'Connection Invalid',
        description: data.accessTokenValid
          ? 'Your connection is working correctly'
          : data.error || 'Your connection needs to be refreshed',
        variant: data.accessTokenValid ? 'default' : 'destructive',
      });

      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to test connection';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  return {
    connections,
    loading,
    error,
    refetch: fetchConnections,
    revokeConnection,
    refreshToken,
    testConnection,
  };
}
