"use client";

import { CommonsLogo } from "@/components/layout/commons-logo";
import { Menubar, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";
import AccountMenu from "@/components/account/AccountMenu";
import Link from "next/link";

export default function AppBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-20 p-1.5 bg-background border-b border-border">
      <Menubar className="rounded-none border-none px-2 lg:px-4">
        <MenubarMenu>
          <MenubarTrigger>
            <Link href="/">
              <CommonsLogo />
            </Link>
          </MenubarTrigger>
        </MenubarMenu>
        <div className="grow" />
        <div className="flex">
          <AccountMenu />
        </div>
      </Menubar>
    </div>
  );
}
