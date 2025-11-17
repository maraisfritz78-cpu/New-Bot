import { cn } from "@/lib/utils";

export const Logo = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("h-6 w-6", className)}
  >
    <title>Liquidator Bot Logo</title>
    <path d="M4 20V4h8" fill="none" stroke="hsl(var(--primary))" />
    <path d="M12 12l4-4 4 4" fill="none" stroke="hsl(var(--accent))" />
    <path d="M16 8v8" fill="none" stroke="hsl(var(--accent))" />
  </svg>
);
