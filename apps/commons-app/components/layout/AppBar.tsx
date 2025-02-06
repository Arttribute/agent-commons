"use client";
import { Menubar, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";
import AccountMenu from "@/components/account/AccountMenu";
import Link from "next/link";
export default function AppBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-10 p-1 bg-white border-b">
      <Menubar className="rounded-none border-none px-2 lg:px-4">
        <MenubarMenu>
          <div className=" lg:hidden"></div>
          <MenubarTrigger>
            <Link href="/">
              <div className="flex">
                <p className="p-1 whitespace-pre-wrap bg-gradient-to-r from-blue-600 via-pink-500 to-indigo-500 bg-clip-text text-center text-xl font-bold leading-none tracking-tighter text-transparent">
                  Agent commons
                </p>
              </div>
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
