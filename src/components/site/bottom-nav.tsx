"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPinned, ShieldCheck, UserRound } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Latest", icon: Home },
  { href: "/countries", label: "Desks", icon: MapPinned },
  { href: "/leaders", label: "Leaders", icon: UserRound },
  { href: "/about", label: "About", icon: ShieldCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-around rounded-[26px] border border-border/80 bg-card/95 p-2 shadow-2xl shadow-black/15 backdrop-blur-2xl md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[430px] md:-translate-x-1/2">{ITEMS.map(({ href, label, icon: Icon }) => { const active = pathname === href; return <Link key={href} href={href} className={`flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-semibold transition ${active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`} aria-label={label} aria-current={active ? "page" : undefined}><Icon className="size-4" /><span>{label}</span></Link>; })}</nav>;
}
