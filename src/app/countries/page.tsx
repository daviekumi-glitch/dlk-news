"use client";

import Link from "next/link";
import { BottomNav } from "@/components/site/bottom-nav";
import { ArrowLeft, MapPin } from "lucide-react";

const desks = ["Malawi", "Zambia", "Tanzania", "South Africa", "Mozambique", "Zimbabwe", "Nigeria", "Kenya", "United Kingdom", "United States"];

export default function CountriesPage() {
  return <main className="min-h-screen bg-background px-4 pb-28 py-10 text-foreground sm:px-6"><div className="mx-auto max-w-5xl"><Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to D. L. K</Link><div className="mt-14"><MapPin className="size-9 text-primary" /><h1 className="mt-5 text-4xl font-semibold tracking-tight">Country desks</h1><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Choose a country desk to follow local reporting alongside the global context. Malawi is the first desk in the buildout.</p><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{desks.map((desk, index) => <button key={desk} disabled={index !== 0} className="rounded-2xl border border-border bg-card p-5 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-55"><div className="flex items-center justify-between"><span className="font-medium">{desk}</span>{index === 0 ? <span className="text-xs text-emerald-600">Active</span> : <span className="text-xs text-muted-foreground">Building</span>}</div></button>)}</div></div></div><BottomNav /></main>;
}
