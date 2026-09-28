"use client";

import { Loader2 } from "lucide-react";
import { AuthShell, AuthTitle, authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/auth-shell";
import { describeOAuthScope } from "@/lib/oauth-scope-labels";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { OAuthProvider, OAuthProviderDetails } from "@/types/oauth";
import { useToast } from "@/hooks/use-toast";
import { safeInternalReturnUrl } from "@/lib/safe-return-url";

function OAuthConnectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { status } = useSession();
  const [provider, setProvider] = useState<OAuthProviderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerKey = searchParams.get("provider");
  const returnUrl = safeInternalReturnUrl(searchParams.get("returnUrl"));
  const requestedScopes = searchParams.get("scopes");
  const toolLabel = searchParams.get("label");

  const fetchProvider = useCallback(
    async (key: string) => {
      try {
        let res = await fetch(`/api/oauth/providers/${key}`);
        if (!res.ok && key === "google_workspace") {
          const providersRes = await fetch("/api/oauth/providers");
          const providersData = await providersRes.json().catch(() => ({}));
          const alias = providersData.providers?.find((item: OAuthProvider) =>
            ["google_workspace", "google", "google_oauth"].includes(
              item.providerKey,
            ),
          );
          if (alias?.providerKey && alias.providerKey !== key) {
            res = await fetch(`/api/oauth/providers/${alias.providerKey}`);
          }
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch provider");
        }
        const data = await res.json();
        setProvider(data.provider);
      } catch (error) {
        console.error("Error fetching provider:", error);
        toast({
          title: "Error",
          description: "Failed to load OAuth provider",
          variant: "destructive",
        });
        router.push(returnUrl);
      } finally {
        setLoading(false);
      }
    },
    [returnUrl, router, toast],
  );

  useEffect(() => {
    if (!providerKey) {
      toast({
        title: "Error",
        description: "Missing provider parameter",
        variant: "destructive",
      });
      router.push(returnUrl);
      return;
    }

    // Fetch provider details
    fetchProvider(providerKey);
  }, [fetchProvider, providerKey, returnUrl, router, toast]);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    window.sessionStorage.setItem("oauthReturnUrl", returnUrl);
    if (toolLabel)
      window.sessionStorage.setItem("oauthProviderLabel", toolLabel);
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/native/start?direct=1&callbackUrl=${encodeURIComponent(current)}`;
  }, [returnUrl, status, toolLabel]);

  const handleConnect = async () => {
    if (!providerKey || !provider) return;
    if (status !== "authenticated") {
      const current = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/api/auth/native/start?direct=1&callbackUrl=${encodeURIComponent(current)}`;
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      window.sessionStorage.setItem("oauthReturnUrl", returnUrl);
      window.sessionStorage.setItem(
        "oauthProviderLabel",
        toolLabel || provider.displayName,
      );
      const scopes = requestedScopes
        ? requestedScopes
            .split(/\s+/)
            .map((scope) => scope.trim())
            .filter(Boolean)
        : provider.defaultScopes;
      // Initiate OAuth flow
      const res = await fetch("/api/oauth/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerKey: provider.providerKey,
          scopes,
          redirectUri: `${window.location.origin}/api/oauth/callback/${provider.providerKey}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ||
              data.message ||
              "Failed to initiate OAuth flow";
        throw new Error(message);
      }

      const data = await res.json();

      // Redirect to OAuth provider's authorization page
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error("Error connecting:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to connect to OAuth provider";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell className="flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
      </AuthShell>
    );
  }

  if (!provider) {
    return null;
  }

  const scopes = (requestedScopes ? requestedScopes.split(/\s+/).filter(Boolean) : provider.defaultScopes)
    .map(describeOAuthScope)
    .filter((scope, index, all) => all.indexOf(scope) === index);

  return (
    <AuthShell>
      {provider.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={provider.logoUrl} alt="" className="mb-4 h-10 w-10 rounded-[10px]" />
      )}
      <AuthTitle description="Your agents use this connection when a tool needs it. You can disconnect at any time in Settings.">
        Connect {toolLabel || provider.displayName}
      </AuthTitle>
      {status === "unauthenticated" && (
        <p className="mb-4 flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing a secure connection
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>
      )}
      {scopes.length > 0 && (
        <>
          <p className="mb-2 text-[13px] text-stone-600">Agents will be able to:</p>
          <ul className="mb-5 divide-y divide-stone-200 rounded-[12px] border border-stone-200">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-start gap-2.5 px-3 py-2.5 text-[13px] text-stone-700">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
                {scope}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex gap-2">
        <button onClick={() => router.push(returnUrl)} disabled={connecting} className={authSecondaryButtonClass}>
          Cancel
        </button>
        <button onClick={handleConnect} disabled={connecting} className={authPrimaryButtonClass}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {connecting ? "Connecting" : "Connect"}
        </button>
      </div>
    </AuthShell>
  );
}

export default function OAuthConnectPage() {
  return (
    <Suspense fallback={<AuthShell className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-stone-400" /></AuthShell>}>
      <OAuthConnectContent />
    </Suspense>
  );
}
