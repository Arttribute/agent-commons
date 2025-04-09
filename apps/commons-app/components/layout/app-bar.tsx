"use client";
import { Menubar, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";
//import { Sparkles } from "lucide-react";
import AccountMenu from "@/components/account/AccountMenu";
import Link from "next/link";
import Image from "next/image";
import MainMenu from "@/components/layout/main-menu";

export default function AppBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-20 p-1.5   bg-white border-b border-gray-400">
      <Menubar className="rounded-none border-none px-2 lg:px-4">
        <MenubarMenu>
          <div className=" lg:hidden"></div>
          <MenubarTrigger>
            <Link href="/">
              <Image
                src="/logo.jpg"
                alt="Agent Commons"
                width={80}
                height={20}
              />
            </Link>
          </MenubarTrigger>
        </MenubarMenu>
        <div className="grow" />
        <div className="ml-auto items-center justify-center">
          <div className="hidden lg:flex">
            <MainMenu />
          </div>
        </div>
        <div className="grow" />
        <div className="flex">
          <AccountMenu />
        </div>
      </Menubar>
    </div>
  );
}
