import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function PoliticianPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [politician] = await db
    .select({
      id: schema.politicians.id,
      firstName: schema.politicians.firstName,
      lastName: schema.politicians.lastName,
      chamber: schema.politicians.chamber,
      birthDate: schema.politicians.birthDate,
      birthPlace: schema.politicians.birthPlace,
      photoUrl: schema.politicians.photoUrl,
      groupName: schema.politicians.groupName,
      partyName: schema.parties.name,
      partyShort: schema.parties.shortName,
      partyColor: schema.parties.color,
    })
    .from(schema.politicians)
    .leftJoin(schema.parties, eq(schema.parties.id, schema.politicians.partyId))
    .where(eq(schema.politicians.slug, slug));

  if (!politician) notFound();

  const statements = await db
    .select()
    .from(schema.statements)
    .where(eq(schema.statements.politicianId, politician.id))
    .orderBy(desc(schema.statements.publishedAt))
    .limit(50);

  return (
    <div>
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Tutti i parlamentari
      </Link>

      <section className="mt-4 flex items-start gap-5 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {politician.firstName} {politician.lastName}
          </h1>
          <p className="mt-1 text-gray-600">
            <span
              className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
              style={{ backgroundColor: politician.partyColor ?? "#999" }}
            />
            {politician.partyName ?? politician.groupName ?? "Gruppo non noto"}{" "}
            · {politician.chamber === "camera" ? "Camera dei Deputati" : "Senato della Repubblica"}
          </p>
          {(politician.birthDate || politician.birthPlace) && (
            <p className="mt-1 text-sm text-gray-500">
              {politician.birthPlace}
              {politician.birthDate &&
                ` — ${new Date(politician.birthDate).toLocaleDateString("it-IT")}`}
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-primary">
          Indici di Coerenza
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          In arrivo: coerenza col programma del partito, coerenza personale
          nel tempo e coerenza tra voti e dichiarazioni, calcolate con AI su
          tutte le dichiarazioni raccolte.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-primary">
          Dichiarazioni e menzioni ({statements.length})
        </h2>
        {statements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            Nessuna dichiarazione raccolta finora. Le fonti vengono
            scansionate periodicamente.
          </p>
        ) : (
          <ul className="space-y-3">
            {statements.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    {s.sourceName}
                  </span>
                  <time>
                    {new Date(s.publishedAt).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                </div>
                {s.title && <p className="font-medium">{s.title}</p>}
                <p className="mt-1 text-sm text-gray-600">{s.originalText}</p>
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-secondary hover:underline"
                >
                  Fonte originale →
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
