// Turning a business name into a public URL segment.
//
// Pure and dependency-free on purpose: slug rules are the kind of thing that
// look obvious and then quietly mangle a real Nigerian business name, so all
// of it is unit-tested in storeSlug.test.ts without a database.

// Segments that would collide with a real or plausible future route, plus a
// few that would read as official FindIt pages. A seller called "Admin
// Gadgets" is welcome; a store living at /store/admin is not.
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "store",
  "stores",
  "seller",
  "sellers",
  "product",
  "products",
  "search",
  "browse",
  "login",
  "signup",
  "account",
  "profile",
  "settings",
  "support",
  "help",
  "about",
  "findit",
  "new",
  "edit",
  "null",
  "undefined",
]);

export const MAX_SLUG_LENGTH = 48;
const MIN_SLUG_LENGTH = 3;

// A slug that reached the database. Anything user-facing must match this
// before it is trusted as a lookup key, so a crafted path segment can never
// reach a query as something other than a plain slug.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length >= MIN_SLUG_LENGTH &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// The base slug for a business name, before uniqueness is settled.
//
// Handles what actually turns up in Nigerian business names: ampersands
// ("Ade & Sons"), apostrophes ("Mama Nkechi's Kitchen"), dots in
// abbreviations ("B.T. Electronics"), accented characters, emoji, and
// decorative punctuation. Returns "" when nothing usable survives — the
// caller decides the fallback rather than this function inventing one.
export function slugifyStoreName(name: string): string {
  if (typeof name !== "string") return "";

  return (
    name
      .normalize("NFKD")
      // Strip combining marks left behind by the decomposition above, so
      // "Adéṣínà" becomes "adesina" rather than losing the letter entirely.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // "&" is common enough in business names to be worth keeping as a
      // word rather than dropping, which would turn "Ade & Sons" into
      // "ade-sons" and lose the reading.
      .replace(/&/g, " and ")
      // An apostrophe joins the word it splits ("mama nkechi's" ->
      // "nkechis"), unlike every other punctuation mark, which separates.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LENGTH)
      // The slice can leave a trailing hyphen.
      .replace(/-+$/g, "")
  );
}

// The candidate slugs to try, in order, for a business name. The caller
// walks this list and takes the first one the database accepts, so
// uniqueness is decided by the unique index rather than by a check-then-
// insert that two concurrent requests could both pass.
//
// `attempt` 0 is the bare slug; later attempts append a suffix. A reserved
// or too-short base is suffixed from the start rather than rejected, so a
// seller genuinely called "Api" still gets a working store.
export function storeSlugCandidate(name: string, attempt: number, suffix?: string): string {
  const base = slugifyStoreName(name);

  // Nothing usable survived — a name that was entirely emoji, punctuation or
  // a script this transliteration doesn't cover.
  const seed = base.length >= MIN_SLUG_LENGTH ? base : `${base ? `${base}-` : ""}store`;

  if (attempt === 0 && !isReservedSlug(seed) && isValidSlug(seed)) return seed;

  // Deterministic for attempt 1 and 2 so the common "two shops, same name"
  // case produces readable -2 / -3 slugs; random beyond that so a large
  // collision set doesn't degrade into a long sequential scan.
  const tail = attempt <= 2 ? String(attempt + 1) : suffix || String(attempt + 1);
  const trimmed = seed.slice(0, MAX_SLUG_LENGTH - tail.length - 1).replace(/-+$/g, "");
  return `${trimmed}-${tail}`;
}
