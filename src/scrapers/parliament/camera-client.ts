import { createHash } from "node:crypto";
import type {
  ParliamentarianRecord,
  SparqlResponse,
} from "./types";
import { bindingValue } from "./types";

/**
 * Client for dati.camera.it SPARQL endpoint.
 *
 * The endpoint sits behind an anti-bot JavaScript challenge (F5/Volterra):
 * the server returns an HTML page with a small proof-of-work — find `i`
 * in [0, 99] such that SHA1(String(x + i)) === y — submitted via a form
 * together with a `hint` token. Cookies returned after a valid answer
 * authorize subsequent requests. The challenge may be issued more than
 * once in a row; we solve in a loop.
 */

const ENDPOINT = "https://dati.camera.it/sparql";
const LEGISLATURE_URI =
  "http://dati.camera.it/ocd/legislatura.rdf/repubblica_19";

const DEPUTIES_QUERY = `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT DISTINCT ?d ?cognome ?nome ?genere ?dataNascita ?luogoNascita ?foto ?gruppoNome WHERE {
  ?d a ocd:deputato; ocd:rif_leg <${LEGISLATURE_URI}> .
  ?d foaf:surname ?cognome; foaf:firstName ?nome .
  ?d ocd:rif_mandatoCamera ?mandato .
  FILTER NOT EXISTS { ?mandato ocd:endDate ?fineMandato }
  OPTIONAL { ?d foaf:gender ?genere }
  OPTIONAL { ?d foaf:depiction ?foto }
  OPTIONAL {
    ?d <http://purl.org/vocab/bio/0.1/Birth> ?nascita .
    ?nascita <http://purl.org/vocab/bio/0.1/date> ?dataNascita .
    OPTIONAL {
      ?nascita ocd:rif_luogo ?luogo .
      ?luogo <http://purl.org/dc/elements/1.1/title> ?luogoNascita
    }
  }
  OPTIONAL {
    ?d ocd:aderisce ?adesione .
    ?adesione ocd:rif_gruppoParlamentare ?gruppo .
    ?gruppo <http://purl.org/dc/elements/1.1/title> ?gruppoNome .
    FILTER NOT EXISTS { ?adesione ocd:endDate ?fineAdesione }
  }
}`;

/** Minimal cookie jar: accumulates cookies across challenge rounds. */
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  header(): string {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

export class CameraClient {
  private jar = new CookieJar();
  private timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 90_000;
  }

  /** Fetch all deputies currently in office (XIX legislature). */
  async fetchDeputies(): Promise<ParliamentarianRecord[]> {
    const data = await this.query(DEPUTIES_QUERY);
    const byUri = new Map<string, ParliamentarianRecord>();

    for (const b of data.results.bindings) {
      const uri = bindingValue(b, "d");
      if (!uri) continue;

      const existing = byUri.get(uri);
      const record: ParliamentarianRecord = {
        sourceUri: uri,
        firstName: bindingValue(b, "nome") ?? "",
        lastName: bindingValue(b, "cognome") ?? "",
        chamber: "camera",
        gender: bindingValue(b, "genere"),
        birthDate: bindingValue(b, "dataNascita"),
        birthPlace: bindingValue(b, "luogoNascita"),
        photoUrl: bindingValue(b, "foto"),
        groupName: bindingValue(b, "gruppoNome") ?? existing?.groupName ?? null,
        groupShortName: null,
      };
      // Merge: keep first non-null values on duplicate rows
      if (existing) {
        record.gender ??= existing.gender;
        record.birthDate ??= existing.birthDate;
        record.birthPlace ??= existing.birthPlace;
        record.photoUrl ??= existing.photoUrl;
      }
      byUri.set(uri, record);
    }

    return [...byUri.values()];
  }

  /** Run a SPARQL query, solving anti-bot challenges as needed. */
  async query(sparql: string): Promise<SparqlResponse> {
    const url =
      `${ENDPOINT}?` +
      new URLSearchParams({
        query: sparql,
        format: "application/sparql-results+json",
      });

    let body = await this.get(url);
    for (let round = 0; round < 8; round++) {
      if (!body.includes("js-challenge-form")) break;
      // The submit response may itself be another challenge; only
      // re-fetch the query once a round comes back clean.
      const afterSubmit = await this.solveChallenge(body);
      body = afterSubmit.includes("js-challenge-form")
        ? afterSubmit
        : await this.get(url);
    }

    if (body.includes("js-challenge-form")) {
      throw new Error("dati.camera.it: challenge loop did not converge");
    }
    return JSON.parse(body) as SparqlResponse;
  }

  /**
   * GET with manual redirect handling. The challenge submit responds
   * with a 301 that carries the authorization cookie (X-VOLTERRA-JS-CHL)
   * — automatic redirect following would drop it.
   */
  private async get(url: string, hops = 0): Promise<string> {
    if (hops > 5) throw new Error("dati.camera.it: too many redirects");

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "User-Agent": "Politicase/0.1 (open-data transparency project)",
        Cookie: this.jar.header(),
      },
    });
    this.jar.absorb(response);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        return this.get(new URL(location, url).toString(), hops + 1);
      }
    }
    return response.text();
  }

  /** Parse and answer one challenge page; returns the submit response body. */
  private async solveChallenge(html: string): Promise<string> {
    const x = Number(html.match(/var x =\s*(\d+)/)?.[1]);
    const y = html.match(/var y = "([0-9a-f]+)"/)?.[1];
    const hint = html.match(/name="hint" value="([0-9a-f]+)"/)?.[1];
    if (!Number.isFinite(x) || !y || !hint) {
      throw new Error("dati.camera.it: unrecognized challenge format");
    }

    let answer = -1;
    for (let i = 0; i <= 99; i++) {
      const digest = createHash("sha1")
        .update(String(x + i))
        .digest("hex");
      if (digest === y) {
        answer = i;
        break;
      }
    }
    if (answer < 0) {
      throw new Error("dati.camera.it: challenge has no solution in [0,99]");
    }

    // The challenge page JS waits 1s before submitting; mimic that.
    await new Promise((r) => setTimeout(r, 1_100));
    const submitUrl =
      `${ENDPOINT}?` +
      new URLSearchParams({ hint, answer: String(answer) });
    return this.get(submitUrl);
  }
}
