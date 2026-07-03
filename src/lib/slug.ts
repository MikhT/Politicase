/**
 * Build a URL-safe slug from a politician's name.
 * "MELONI Giorgia" -> "giorgia-meloni"
 */
export function slugify(...parts: string[]): string {
  return parts
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Normalize an ALL-CAPS name to Title Case.
 * "MARIA ROSARIA" -> "Maria Rosaria"
 */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s|'|-)/)
    .map((part) =>
      /^[a-zà-ú]/.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part,
    )
    .join("");
}
