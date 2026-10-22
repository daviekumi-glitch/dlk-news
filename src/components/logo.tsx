import { cn } from "@/lib/utils";

/**
 * Agent Mobile mark — a rounded square with a spark glyph.
 * Pure SVG so it stays crisp at every size and needs no asset pipeline.
 */
export function Logo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "brand-gradient inline-flex shrink-0 items-center justify-center rounded-xl shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        width={size * 0.6}
        height={size * 0.6}
        className="text-white"
      >
        <path
          d="M12 2.5l1.9 5.1a4 4 0 0 0 2.5 2.5l5.1 1.9-5.1 1.9a4 4 0 0 0-2.5 2.5L12 21.5l-1.9-5.1a4 4 0 0 0-2.5-2.5L2.5 12l5.1-1.9a4 4 0 0 0 2.5-2.5L12 2.5z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Logo size={28} />
      <span className="text-[0.9375rem] font-semibold tracking-tight">
        Agent <span className="brand-text-gradient">Mobile</span>
      </span>
    </span>
  );
}
