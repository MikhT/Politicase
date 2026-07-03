import Link from "next/link";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  camera?: string;
  partito?: string;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const chamber = params.camera === "camera" || params.camera === "senato"
    ? params.camera
    : undefined;
  const partySlug = params.partito;

  const conditions: SQL[] = [];
  if (q) {
    const searchCondition = or(
      ilike(schema.politicians.firstName, `%${q}%`),
      ilike(schema.politicians.lastName, `%${q}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (chamber) conditions.push(eq(schema.politicians.chamber, chamber));

  const parties = await db
    .select()
    .from(schema.parties)
    .orderBy(schema.parties.name);

  if (partySlug) {
    const party = parties.find((p) => p.slug === partySlug);
    if (party) conditions.push(eq(schema.politicians.partyId, party.id));
  }

  const politicians = await db
    .select({
      id: schema.politicians.id,
      slug: schema.politicians.slug,
      firstName: schema.politicians.firstName,
      lastName: schema.politicians.lastName,
      chamber: schema.politicians.chamber,
      partyName: schema.parties.shortName,
      partyColor: schema.parties.color,
    })
    .from(schema.politicians)
    .leftJoin(schema.parties, eq(schema.parties.id, schema.politicians.partyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.politicians.lastName, schema.politicians.firstName);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      camera: sql<number>`count(*) filter (where chamber = 'camera')::int`,
      senato: sql<number>`count(*) filter (where chamber = 'senato')::int`,
    })
    .from(schema.politicians);

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-primary">
          La politica italiana, misurata con i fatti
        </h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          {counts.total} parlamentari in carica — {counts.camera} deputati e{" "}
          {counts.senato} senatori — con dichiarazioni tracciate da fonti
          aperte ufficiali.
        </p>
      </section>

      <form method="get" className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Cerca per nome o cognome…"
          className="w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <select
          name="camera"
          defaultValue={chamber ?? ""}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Camera e Senato</option>
          <option value="camera">Solo Camera</option>
          <option value="senato">Solo Senato</option>
        </select>
        <select
          name="partito"
          defaultValue={partySlug ?? ""}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Tutti i gruppi</option>
          {parties.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.shortName ?? p.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Filtra
        </button>
      </form>

      <p className="mb-4 text-sm text-gray-500">
        {politicians.length} risultati
      </p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {politicians.map((p) => (
          <li key={p.id}>
            <Link
              href={`/politici/${p.slug}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-primary hover:shadow-sm"
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: p.partyColor ?? "#999" }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {p.firstName} {p.lastName}
                </span>
                <span className="block text-xs text-gray-500">
                  {p.partyName ?? "—"} ·{" "}
                  {p.chamber === "camera" ? "Camera" : "Senato"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
