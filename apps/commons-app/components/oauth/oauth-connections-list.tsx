'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useOAuthProviders,
  useOAuthConnections,
} from '@/hooks/use-oauth-connections';
import { OAuthConnection, OAuthConnectionStatus } from '@/types/oauth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Trash2,
  RefreshCw,
  TestTube,
  Plus,
} from 'lucide-react';

interface OAuthConnectionsListProps {
  ownerId: string;
  ownerType?: 'user' | 'agent';
}

export function OAuthConnectionsList({
  ownerId,
  ownerType = 'user',
}: OAuthConnectionsListProps) {
  const router = useRouter();
  const { providers, loading: providersLoading } = useOAuthProviders();
  const {
    connections,
    loading: connectionsLoading,
    revokeConnection,
    refreshToken,
    testConnection,
  } = useOAuthConnections(ownerId, ownerType);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] =
    useState<OAuthConnection | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleConnect = (providerKey: string) => {
    router.push(`/oauth/connect?provider=${providerKey}&returnUrl=/studio`);
  };

  const handleRevoke = async () => {
    if (!selectedConnection) return;

    setActionLoading(selectedConnection.connectionId);
    try {
      await revokeConnection(selectedConnection.connectionId);
      setRevokeDialogOpen(false);
      setSelectedConnection(null);
    } catch (error) {
      // Error already handled by hook
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async (connectionId: string) => {
    setActionLoading(connectionId);
    try {
      await refreshToken(connectionId);
    } catch (error) {
      // Error already handled by hook
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (connectionId: string) => {
    setActionLoading(connectionId);
    try {
      await testConnection(connectionId);
    } catch (error) {
      // Error already handled by hook
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusIcon = (status: OAuthConnectionStatus) => {
    switch (status) {
      case OAuthConnectionStatus.ACTIVE:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case OAuthConnectionStatus.EXPIRED:
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case OAuthConnectionStatus.REVOKED:
        return <XCircle className="h-5 w-5 text-gray-500" />;
      case OAuthConnectionStatus.ERROR:
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: OAuthConnectionStatus) => {
    switch (status) {
      case OAuthConnectionStatus.ACTIVE:
        return 'Active';
      case OAuthConnectionStatus.EXPIRED:
        return 'Expired';
      case OAuthConnectionStatus.REVOKED:
        return 'Revoked';
      case OAuthConnectionStatus.ERROR:
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const loading = providersLoading || connectionsLoading;

  // Get connected provider keys
  const connectedProviderKeys = new Set(
    connections.map((c) => c.providerKey)
  );

  // Available providers (not yet connected)
  const availableProviders = providers.filter(
    (p) => !connectedProviderKeys.has(p.providerKey) && p.isActive
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connected Providers */}
      {connections.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Connected Accounts</h3>
          <div className="space-y-4">
            {connections.map((connection) => (
              <Card key={connection.connectionId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {connection.providerLogoUrl && (
                        <img
                          src={connection.providerLogoUrl}
                          alt={connection.providerDisplayName}
                          className="h-10 w-10 rounded"
                        />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {connection.providerDisplayName}
                        </CardTitle>
                        <CardDescription>
                          {connection.providerUserEmail || 'No email'}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(connection.status)}
                      <span className="text-sm font-medium">
                        {getStatusText(connection.status)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <p>
                        Last used:{' '}
                        {connection.lastUsedAt
                          ? new Date(connection.lastUsedAt).toLocaleDateString()
                          : 'Never'}
                      </p>
                      <p>Usage count: {connection.usageCount}</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(connection.connectionId)}
                        disabled={actionLoading === connection.connectionId}
                      >
                        <TestTube className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRefresh(connection.connectionId)}
                        disabled={actionLoading === connection.connectionId}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedConnection(connection);
                          setRevokeDialogOpen(true);
                        }}
                        disabled={actionLoading === connection.connectionId}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                  {connection.lastError && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-300">
                      <strong>Error:</strong> {connection.lastError}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available Providers */}
      {availableProviders.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Available Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableProviders.map((provider) => (
              <Card key={provider.providerId} className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-2">
                    {provider.logoUrl && (
                      <img
                        src={provider.logoUrl}
                        alt={provider.displayName}
                        className="h-10 w-10 rounded"
                      />
                    )}
                    <CardTitle className="text-base">
                      {provider.displayName}
                    </CardTitle>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {provider.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    onClick={() => handleConnect(provider.providerKey)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {connections.length === 0 && availableProviders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              No OAuth providers available at this time.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke OAuth Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke your{' '}
              {selectedConnection?.providerDisplayName} connection? This will
              disable all tools that use this OAuth connection. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
