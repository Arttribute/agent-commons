"use client";
import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SessionProvider } from "next-auth/react";
import { FlagsProvider } from "@/components/providers/flags-provider";

type Props = {
  children: React.ReactNode;
};

export default function Providers({ children }: Props) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!privyAppId) {
    return (
      <SessionProvider>
        <FlagsProvider>{children}</FlagsProvider>
      </SessionProvider>
    );
  }
  return (
    <SessionProvider>
      <FlagsProvider>
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
      </FlagsProvider>
    </SessionProvider>
  );
}
