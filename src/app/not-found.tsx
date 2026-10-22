import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={44} />
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you were looking for doesn&apos;t exist or has moved.
      </p>
      <Button variant="brand" asChild>
        <Link href="/chat">Back to chat</Link>
      </Button>
    </div>
  );
}
