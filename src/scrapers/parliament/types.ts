/**
 * Shared types for parliamentary open-data ingestion
 * (dati.camera.it + dati.senato.it SPARQL endpoints).
 */

export interface ParliamentarianRecord {
  /** Stable source URI, e.g. http://dati.camera.it/ocd/deputato.rdf/d309220_19 */
  sourceUri: string;
  firstName: string;
  lastName: string;
  chamber: "camera" | "senato";
  gender: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  photoUrl: string | null;
  /** Raw parliamentary group name from the source */
  groupName: string | null;
  /** Short group name if provided (Senato has titoloBreve) */
  groupShortName: string | null;
}

export interface SparqlBinding {
  [variable: string]: { type: string; value: string } | undefined;
}

export interface SparqlResponse {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

export function bindingValue(
  binding: SparqlBinding,
  variable: string,
): string | null {
  return binding[variable]?.value ?? null;
}
