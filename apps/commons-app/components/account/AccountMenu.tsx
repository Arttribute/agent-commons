"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import RandomPixelAvatar from "@/components/account/random-avatar";

function AccountMenu() {
  const { authState, login, logout } = useAuth();
  const { idToken, username, walletAddress } = authState;
  const isAuthenticated = !!idToken;
  return (
    <>
      {isAuthenticated ? (
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="rounded-full overflow-hidden">
                <RandomPixelAvatar
                  username={username || walletAddress || ""}
                  size={32}
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>{username}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/api-keys">API Keys</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={
                    process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ??
                    "/download/desktop"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Download desktop app
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/" passHref target="_blank">
                  Report Issue
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/" passHref target="_blank">
                  Give Feedback
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Logout Button */}
              <DropdownMenuItem
                onClick={() => {
                  logout();
                }}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div>
          <Button onClick={login} className="h-8">
            Login
          </Button>
        </div>
      )}
    </>
  );
}

export default AccountMenu;
