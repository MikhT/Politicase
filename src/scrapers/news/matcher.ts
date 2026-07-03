/**
 * Match politician names inside news text.
 *
 * Strategy (deliberately conservative to avoid false attributions):
 * - Match "Firstname Lastname" (strong signal), or
 * - Match bare "Lastname" only when the surname is unambiguous across
 *   the whole parliament AND is not a common Italian word.
 *
 * A news mention is NOT a quote. We store it as a "news" statement with
 * the title + description as text; AI enrichment (Phase 2) will later
 * distinguish direct declarations from mere mentions.
 */

export interface MatchablePolitician {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * Surnames that must never match alone: common Italian surnames plus
 * surnames that are ordinary words/proper-noun parts and would hit
 * phrases like "Piano Mattei", "la Chiesa", "il Monte" (verified false
 * positives from live ANSA data).
 */
const AMBIGUOUS_SURNAMES = new Set([
  // Common surnames
  "russo", "romano", "ferrari", "esposito", "ricci", "marino", "greco",
  "bruno", "gallo", "conti", "costa", "giordano", "rizzo", "lombardi",
  "leone", "longo", "mancini", "villa", "serra", "silvestri", "pace",
  "guerra", "monti", "bianchi", "rossi", "colombo", "de luca", "ferrara",
  // Ordinary words / proper-noun fragments
  "piano", "chiesa", "dalla chiesa", "monte", "colle", "campo", "fontana",
  "sala", "corte", "porta", "torre", "ponte", "fonte", "borghi", "prato",
  "rosso", "verde", "bianco", "nero", "ferro", "gemma", "speranza",
  "fede", "amato", "grande", "basso", "gentile", "franco", "mare",
  "candia", "castello", "conte", "re", "papa", "vescovo", "duca",
]);

export interface NameMatch {
  politicianId: number;
}

export class PoliticianMatcher {
  private fullNamePatterns: Array<{ id: number; regex: RegExp }> = [];
  private surnamePatterns: Array<{ id: number; regex: RegExp }> = [];

  constructor(politicians: MatchablePolitician[]) {
    // Count surname occurrences to detect ambiguity within parliament
    const surnameCount = new Map<string, number>();
    for (const p of politicians) {
      const key = p.lastName.toLowerCase();
      surnameCount.set(key, (surnameCount.get(key) ?? 0) + 1);
    }

    for (const p of politicians) {
      const first = escapeRegex(titleWord(p.firstName));
      const last = escapeRegex(titleWord(p.lastName));

      // "Giorgia Meloni" or "Meloni, Giorgia"
      this.fullNamePatterns.push({
        id: p.id,
        regex: new RegExp(`\\b${first}\\s+${last}\\b`, "i"),
      });

      const surnameKey = p.lastName.toLowerCase();
      const unique = (surnameCount.get(surnameKey) ?? 0) === 1;
      if (unique && !AMBIGUOUS_SURNAMES.has(surnameKey) && last.length >= 4) {
        this.surnamePatterns.push({
          id: p.id,
          regex: new RegExp(`\\b${last}\\b`),
        });
      }
    }
  }

  /** Return unique politician IDs mentioned in the text. */
  match(text: string): NameMatch[] {
    const found = new Set<number>();

    for (const { id, regex } of this.fullNamePatterns) {
      if (regex.test(text)) found.add(id);
    }
    // Surname-only: case-sensitive Title Case to avoid common-word hits
    for (const { id, regex } of this.surnamePatterns) {
      if (found.has(id)) continue;
      if (regex.test(text)) found.add(id);
    }

    return [...found].map((politicianId) => ({ politicianId }));
  }
}

function titleWord(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
