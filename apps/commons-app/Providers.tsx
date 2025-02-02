"use client";
import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";

type Props = {
  children: React.ReactNode;
};

export default function Providers({ children }: Props) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        // (Optional) Customize the login methods displayed to users upfront:
        loginMethods: ["email", "wallet", "google"],

        appearance: {
          theme: "light",
          // Additional appearance customizations, e.g. brand color:
          accentColor: "#676FFF",
          // ...
        },

        // (Optional) Embedded wallet creation. If you want to auto-create
        // embedded wallets for new users, set createOnLogin: 'users-without-wallets'
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
