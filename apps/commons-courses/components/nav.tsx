"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuItem, Popover } from "@/components/ui/popover";

const links = [
  { href: "/courses", label: "Courses" },
  { href: "/skills", label: "Skills" },
];

export function Nav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const userName = session?.user?.name || session?.user?.email || "Account";
  const userInitial = userName.slice(0, 1).toUpperCase();
  const authCallback = pathname === "/" || pathname.startsWith("/auth/") ? "/dashboard" : pathname;
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(authCallback)}`;
  const signUpHref = `/auth/signup?callbackUrl=${encodeURIComponent(authCallback)}`;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const avatar = session?.user?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={session.user.image} alt="" className="h-full w-full object-cover" />
  ) : (
    userInitial
  );

  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-200",
        scrolled ? "border-border bg-white/90 backdrop-blur" : "border-transparent bg-white",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-900">
              <FlaskConical className="h-3.5 w-3.5 text-white" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium tracking-tight text-foreground">CommonLab</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink key={link.href} href={link.href} active={isActive(link.href)}>
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <NavLink href="/educator" active={isActive("/educator")}>
            Teach
          </NavLink>
          {session ? (
            <Popover
              align="end"
              className="w-60 p-1.5"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Open account menu"
                  aria-expanded={open}
                  className="ml-2 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-xs font-medium text-white ring-offset-2 transition hover:ring-2 hover:ring-border"
                >
                  {avatar}
                </button>
              )}
            >
              {({ close }) => (
                <div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm">{userName}</p>
                    {session.user?.email ? (
                      <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                    ) : null}
                  </div>
                  <div className="border-t border-border pt-1">
                    <MenuLink href="/dashboard" icon={LayoutDashboard} onClick={close}>
                      My learning
                    </MenuLink>
                    <MenuLink href="/educator" icon={GraduationCap} onClick={close}>
                      Educator console
                    </MenuLink>
                    <MenuLink href="/account" icon={Settings} onClick={close}>
                      Account
                    </MenuLink>
                    <MenuLink href="/account#learning-profile" icon={SlidersHorizontal} onClick={close}>
                      Learning preferences
                    </MenuLink>
                  </div>
                  <div className="mt-1 border-t border-border pt-1">
                    <MenuItem icon={LogOut} onClick={() => signOut()}>
                      Sign out
                    </MenuItem>
                  </div>
                </div>
              )}
            </Popover>
          ) : (
            <>
              <NavLink href={signInHref} active={false}>
                Sign in
              </NavLink>
              <Link
                href={signUpHref}
                className="ml-1 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              >
                Start learning
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-1 border-b border-border bg-white px-4 pb-4 md:hidden">
          {[...links, { href: "/educator", label: "Teach" }].map((link) => (
            <MobileLink key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
              {link.label}
            </MobileLink>
          ))}
          {session ? (
            <>
              <div className="my-2 flex items-center gap-3 border-t border-border pt-3">
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-xs font-medium text-white">
                  {avatar}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{userName}</span>
                  {session.user?.email ? (
                    <span className="block truncate text-xs text-muted-foreground">{session.user.email}</span>
                  ) : null}
                </span>
              </div>
              <MobileLink href="/dashboard" onClick={() => setMobileOpen(false)}>
                My learning
              </MobileLink>
              <MobileLink href="/account" onClick={() => setMobileOpen(false)}>
                Account
              </MobileLink>
              <button onClick={() => signOut()} className="rounded-md px-2 py-2 text-left text-sm text-stone-700">
                Sign out
              </button>
            </>
          ) : (
            <>
              <MobileLink href={signInHref} onClick={() => setMobileOpen(false)}>
                Sign in
              </MobileLink>
              <MobileLink href={signUpHref} onClick={() => setMobileOpen(false)}>
                Start learning
              </MobileLink>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active ? "bg-accent text-foreground" : "text-stone-600 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function MobileLink({ href, onClick, children }: { href: string; onClick: () => void; children: ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="rounded-md px-2 py-2 text-sm text-stone-700 hover:bg-muted">
      {children}
    </Link>
  );
}

function MenuLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  icon: typeof Settings;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 opacity-70" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
