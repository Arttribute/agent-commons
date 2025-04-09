import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";

export default function MainMenu({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={cn("flex items-center space-x-4 lg:space-x-6", className)}
      {...props}
    >
      <Menubar className="rounded-none border-b border-none px-2 lg:px-4">
        <MenubarMenu>
          <MenubarTrigger className="text-sm ">About</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              {" "}
              <Link href="/" rel="noopener noreferrer" target="_blank">
                About Arttribute
              </Link>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              <Link href="/licenses" rel="noopener noreferrer" target="_blank">
                {" "}
                Arttribute Licences
              </Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-sm ">Build</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <Link
                href="https://docs.arttribute.io/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {" "}
                Commons API
              </Link>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              {" "}
              <Link href="/" rel="noopener noreferrer">
                {" "}
                API Documentation
              </Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-sm ">Discover</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <Link href="/blog" rel="noopener noreferrer" target="_blank">
                {" "}
                Blog
              </Link>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              {" "}
              <Link href="/" rel="noopener noreferrer">
                {" "}
                Quests
              </Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </nav>
  );
}
