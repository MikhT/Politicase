import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const statements = await db
    .select({
      id: schema.statements.id,
      title: schema.statements.title,
      originalText: schema.statements.originalText,
      sourceName: schema.statements.sourceName,
      sourceUrl: schema.statements.sourceUrl,
      publishedAt: schema.statements.publishedAt,
      politicianSlug: schema.politicians.slug,
      politicianFirstName: schema.politicians.firstName,
      politicianLastName: schema.politicians.lastName,
      partyShort: schema.parties.shortName,
      partyColor: schema.parties.color,
    })
    .from(schema.statements)
    .innerJoin(
      schema.politicians,
      eq(schema.politicians.id, schema.statements.politicianId),
    )
    .leftJoin(schema.parties, eq(schema.parties.id, schema.politicians.partyId))
    .orderBy(desc(schema.statements.publishedAt))
    .limit(100);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-primary">
        Feed dichiarazioni
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-600">
        Le menzioni e dichiarazioni più recenti dei parlamentari, raccolte
        dalle fonti aperte monitorate.
      </p>

      {statements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
          Nessuna dichiarazione ancora. Esegui l&apos;ingestione news.
        </p>
      ) : (
        <ul className="space-y-3">
          {statements.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <Link
                  href={`/politici/${s.politicianSlug}`}
                  className="flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.partyColor ?? "#999" }}
                  />
                  {s.politicianFirstName} {s.politicianLastName}
                </Link>
                {s.partyShort && <span>({s.partyShort})</span>}
                <span>·</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                  {s.sourceName}
                </span>
                <time>
                  {new Date(s.publishedAt).toLocaleDateString("it-IT")}
                </time>
              </div>
              {s.title && <p className="font-medium">{s.title}</p>}
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-secondary hover:underline"
              >
                Fonte originale →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
