"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Routes", href: "/" },
  { label: "Compose", href: "/compose" },
  { label: "Team", href: "/team" },
  { label: "Settings", href: "/settings" },
  { label: "Account", href: "/account" },
] as const;

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-5 py-6" aria-label="Main navigation">
      <div className="relative">
        {/* Vertical route spine */}
        <div
          className="absolute left-[6px] top-4 bottom-4 w-[2px]"
          style={{
            background:
              "linear-gradient(to bottom, #c0caf5 0%, #c0caf5 60%, #7ee787 100%)",
            opacity: 0.22,
          }}
          aria-hidden="true"
        />

        <ul className="flex flex-col">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href} className="relative flex items-center">
                {/* Station dot */}
                <div
                  className={cn(
                    "relative z-10 w-[14px] h-[14px] rounded-full flex-shrink-0 border-2 transition-all duration-150",
                    active
                      ? "bg-transit-mint border-transit-mint shadow-[0_0_8px_rgba(126,231,135,0.5)]"
                      : "bg-transit-canvas border-transit-muted/50",
                  )}
                  aria-hidden="true"
                />
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "ml-3.5 py-3.5 text-sm font-medium tracking-wide transition-colors duration-150",
                    active
                      ? "text-transit-mint"
                      : "text-transit-muted hover:text-transit-periwinkle",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
