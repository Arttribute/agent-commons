"use client";
import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SessionProvider } from "next-auth/react";

type Props = {
  children: React.ReactNode;
};

export default function Providers({ children }: Props) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!privyAppId) {
    return <SessionProvider>{children}</SessionProvider>;
  }
  return (
    <SessionProvider>
      <PrivyProvider
        appId={privyAppId}
        config={{
          // Privy is wallet infrastructure only; Commons Identity owns login.
          loginMethods: ["wallet"],

        appearance: {
          theme: "light",
          // Additional appearance customizations, e.g. brand color:
          accentColor: "#676FFF",
          // ...
        },

        // (Optional) Embedded wallet creation. If you want to auto-create
        // embedded wallets for new users, set createOnLogin: 'users-without-wallets'
        embeddedWallets: {
          createOnLogin: "off",
        },
        }}
      >
        {children}
      </PrivyProvider>
    </SessionProvider>
  );
}
