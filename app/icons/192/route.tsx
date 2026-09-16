import { renderBrandIcon } from "@/lib/brandIcon";

// ImageResponse sets Content-Type: image/png on its own — a plain route
// handler (unlike Next's special icon.tsx convention) doesn't accept a
// `contentType` export at all.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(192);
}
