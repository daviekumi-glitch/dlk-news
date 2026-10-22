import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function LeadersPage() {
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6"><div className="mx-auto max-w-3xl"><Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to D. L. K</Link><div className="mt-16 rounded-3xl border border-border bg-card p-8 sm:p-12"><ShieldCheck className="size-9 text-primary" /><h1 className="mt-6 text-4xl font-semibold tracking-tight">Public leaders</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">A sourced public-information desk for presidents and national leaders. Profiles will cover identity, office, public record, reported contributions and verified public statements. Private security details and unverified allegations will not be published.</p><p className="mt-6 text-sm text-muted-foreground">The profile data pipeline is the next foundation milestone. Current live reporting is available on the <Link className="text-primary underline" href="/">latest desk</Link>.</p></div></div></main>;
}
