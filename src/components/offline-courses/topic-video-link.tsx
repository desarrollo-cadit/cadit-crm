import { ExternalLink, Video } from "lucide-react";
import { parseVimeoUrl, vimeoPageUrl } from "@/lib/vimeo";

/**
 * Staff sees the link, not the player: the library screens are for checking
 * content, and the one embedded player (constitution 1.4.0) lives in the
 * student portal. The same parser decides "has a video" here and there, so a
 * URL the portal would treat as "no video" says so here too.
 *
 * Shared by the read-only course page and the editor (T11b).
 */
export function TopicVideoLink({ url, shown }: { url: string | null; shown: "before" | "after" }) {
  const ref = parseVimeoUrl(url);
  if (!ref) {
    return <p className="text-xs text-muted-foreground">Sin video.</p>;
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs">
      <a
        href={vimeoPageUrl(ref)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-brand-text underline-offset-2 hover:underline"
      >
        <Video className="h-3.5 w-3.5" aria-hidden />
        Ver video en Vimeo
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
      <span className="text-muted-foreground">
        · se muestra {shown === "before" ? "antes" : "después"} del texto
      </span>
    </p>
  );
}
