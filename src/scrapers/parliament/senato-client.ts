import type {
  ParliamentarianRecord,
  SparqlResponse,
} from "./types";
import { bindingValue } from "./types";

/**
 * Client for dati.senato.it SPARQL endpoint.
 *
 * No challenge here, but the WAF rejects queries with variable
 * predicates (`?s ?p ?o`), so every pattern must use explicit IRIs.
 * Note: the Senato dataset reuses part of the Camera OCD ontology —
 * group adhesions link via ocd:aderisce and are typed ocd:adesioneGruppo.
 */

const ENDPOINT = "https://dati.senato.it/sparql";
const LEGISLATURE = 19;

const SENATORS_QUERY = `
PREFIX osr: <http://dati.senato.it/osr/>
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT DISTINCT ?senatore ?nome ?cognome ?dataNascita ?cittaNascita ?gruppoNome ?gruppoBreve WHERE {
  ?senatore a osr:Senatore .
  ?senatore osr:mandato ?mandato .
  ?mandato osr:legislatura ${LEGISLATURE} .
  # The dataset also tracks Camera mandates of former senators (URIs C_*);
  # keep only actual Senate mandates (URIs S_*).
  FILTER(STRSTARTS(STR(?mandato), "http://dati.senato.it/mandato/S_"))
  FILTER NOT EXISTS { ?mandato osr:fine ?fineMandato }
  ?senatore foaf:firstName ?nome .
  ?senatore foaf:lastName ?cognome .
  OPTIONAL { ?senatore osr:dataNascita ?dataNascita }
  OPTIONAL { ?senatore osr:cittaNascita ?cittaNascita }
  OPTIONAL {
    ?senatore ocd:aderisce ?adesione .
    ?adesione osr:legislatura ${LEGISLATURE} .
    ?adesione osr:gruppo ?gruppo .
    ?gruppo osr:denominazione ?den .
    ?den osr:titolo ?gruppoNome .
    OPTIONAL { ?den osr:titoloBreve ?gruppoBreve }
    FILTER NOT EXISTS { ?adesione osr:fine ?fineAdesione }
    FILTER NOT EXISTS { ?den osr:fine ?fineDen }
  }
}`;

export class SenatoClient {
  private timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 90_000;
  }

  /** Fetch all senators currently in office (XIX legislature). */
  async fetchSenators(): Promise<ParliamentarianRecord[]> {
    const data = await this.query(SENATORS_QUERY);
    const byUri = new Map<string, ParliamentarianRecord>();

    for (const b of data.results.bindings) {
      const uri = bindingValue(b, "senatore");
      if (!uri) continue;

      const existing = byUri.get(uri);
      const record: ParliamentarianRecord = {
        sourceUri: uri,
        firstName: bindingValue(b, "nome") ?? "",
        lastName: bindingValue(b, "cognome") ?? "",
        chamber: "senato",
        gender: null, // Not exposed by the Senato dataset
        birthDate: bindingValue(b, "dataNascita"),
        birthPlace: bindingValue(b, "cittaNascita"),
        photoUrl: senatorPhotoUrl(uri),
        groupName: bindingValue(b, "gruppoNome") ?? existing?.groupName ?? null,
        groupShortName:
          bindingValue(b, "gruppoBreve") ?? existing?.groupShortName ?? null,
      };
      if (existing) {
        record.birthDate ??= existing.birthDate;
        record.birthPlace ??= existing.birthPlace;
      }
      byUri.set(uri, record);
    }

    return [...byUri.values()];
  }

  async query(sparql: string): Promise<SparqlResponse> {
    const url =
      `${ENDPOINT}?` + new URLSearchParams({ query: sparql });

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "User-Agent": "Politicase/0.1 (open-data transparency project)",
        Accept: "application/sparql-results+json",
      },
    });

    if (!response.ok) {
      throw new Error(`dati.senato.it returned HTTP ${response.status}`);
    }
    return (await response.json()) as SparqlResponse;
  }
}

/** Official senator portrait URL (public senato.it asset). */
function senatorPhotoUrl(sourceUri: string): string | null {
  const id = sourceUri.match(/senatore\/(\d+)/)?.[1];
  return id
    ? `https://www.senato.it/foto_senatori/leg19/${id}.jpg`
    : null;
}
