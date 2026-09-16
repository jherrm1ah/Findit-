import { renderBrandIcon } from "@/lib/brandIcon";

// A maskable icon: the OS can crop this into a circle, squircle, or any
// other shape it wants (Android adaptive icons, some Play Store surfaces).
// renderBrandIcon's `padded` option keeps the mark inside the safe zone so
// cropping never cuts off the glass or the border.
// ImageResponse sets Content-Type: image/png on its own — a plain route
// handler (unlike Next's special icon.tsx convention) doesn't accept a
// `contentType` export at all.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(512, { padded: true });
}
