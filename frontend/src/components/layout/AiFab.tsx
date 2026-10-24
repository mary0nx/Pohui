import { Sparkles } from "lucide-react";
import { Link } from "react-router";

export function AiFab() {
  return (
    <Link
      to="/assistant"
      aria-label="AI-ассистент"
      className="fixed right-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/30 transition active:scale-95"
      style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 16px)" }}
    >
      <Sparkles className="size-6" />
    </Link>
  );
}
