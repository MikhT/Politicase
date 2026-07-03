/**
 * Normalize raw parliamentary group names (Camera + Senato) into
 * canonical party entries with official colors.
 *
 * Group names in the source data are verbose, e.g.
 * "PARTITO DEMOCRATICO - ITALIA DEMOCRATICA E PROGRESSISTA (PD-IDP) (13.10.2022 - )"
 * We match on keywords and map to a clean canonical record.
 */

export interface CanonicalParty {
  slug: string;
  name: string;
  shortName: string;
  color: string;
}

const PARTY_RULES: Array<{ pattern: RegExp; party: CanonicalParty }> = [
  {
    pattern: /fratelli d'italia/i,
    party: {
      slug: "fratelli-ditalia",
      name: "Fratelli d'Italia",
      shortName: "FdI",
      color: "#003366",
    },
  },
  {
    pattern: /partito democratico/i,
    party: {
      slug: "partito-democratico",
      name: "Partito Democratico",
      shortName: "PD",
      color: "#E2001A",
    },
  },
  {
    pattern: /movimento 5 stelle|movimento cinque stelle/i,
    party: {
      slug: "movimento-5-stelle",
      name: "MoVimento 5 Stelle",
      shortName: "M5S",
      color: "#FFD700",
    },
  },
  {
    pattern: /\blega\b/i,
    party: {
      slug: "lega",
      name: "Lega",
      shortName: "Lega",
      color: "#008C45",
    },
  },
  {
    pattern: /forza italia/i,
    party: {
      slug: "forza-italia",
      name: "Forza Italia",
      shortName: "FI",
      color: "#0087DC",
    },
  },
  {
    pattern: /azione\s*-\s*popolari|azione-popolari|\bazione\b.*renew/i,
    party: {
      slug: "azione",
      name: "Azione - Popolari Europeisti Riformatori",
      shortName: "Azione",
      color: "#1E3A5F",
    },
  },
  {
    pattern: /italia viva|iv-c-re|renew europe.*italia viva/i,
    party: {
      slug: "italia-viva",
      name: "Italia Viva",
      shortName: "IV",
      color: "#FF69B4",
    },
  },
  {
    pattern: /verdi e sinistra/i,
    party: {
      slug: "alleanza-verdi-sinistra",
      name: "Alleanza Verdi e Sinistra",
      shortName: "AVS",
      color: "#4CAF50",
    },
  },
  {
    pattern: /noi moderati/i,
    party: {
      slug: "noi-moderati",
      name: "Noi Moderati",
      shortName: "NM",
      color: "#2E5FA3",
    },
  },
  {
    pattern: /autonomie|svp|südtiroler|sudtiroler/i,
    party: {
      slug: "per-le-autonomie",
      name: "Per le Autonomie (SVP-PATT)",
      shortName: "Aut",
      color: "#777777",
    },
  },
  {
    pattern: /misto/i,
    party: {
      slug: "gruppo-misto",
      name: "Gruppo Misto",
      shortName: "Misto",
      color: "#9E9E9E",
    },
  },
];

export function normalizeGroup(
  rawName: string | null,
): CanonicalParty | null {
  if (!rawName) return null;
  for (const rule of PARTY_RULES) {
    if (rule.pattern.test(rawName)) return rule.party;
  }
  // Unknown group: keep it visible rather than dropping it
  return {
    slug: rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60),
    name: cleanGroupName(rawName),
    shortName: cleanGroupName(rawName).slice(0, 20),
    color: "#666666",
  };
}

/** Strip trailing date ranges like "(13.10.2022 - )" from group names. */
function cleanGroupName(raw: string): string {
  return raw
    .replace(/\(\d{1,2}\.\d{1,2}\.\d{4}[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
