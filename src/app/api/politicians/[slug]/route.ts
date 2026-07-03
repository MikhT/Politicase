import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians/[slug]
 * Full profile: bio, party, recent statements.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const [politician] = await db
    .select({
      slug: schema.politicians.slug,
      firstName: schema.politicians.firstName,
      lastName: schema.politicians.lastName,
      chamber: schema.politicians.chamber,
      birthDate: schema.politicians.birthDate,
      birthPlace: schema.politicians.birthPlace,
      groupName: schema.politicians.groupName,
      party: schema.parties.name,
      partyShort: schema.parties.shortName,
      partySlug: schema.parties.slug,
      id: schema.politicians.id,
    })
    .from(schema.politicians)
    .leftJoin(schema.parties, eq(schema.parties.id, schema.politicians.partyId))
    .where(eq(schema.politicians.slug, slug));

  if (!politician) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statements = await db
    .select({
      title: schema.statements.title,
      text: schema.statements.originalText,
      sourceType: schema.statements.sourceType,
      sourceName: schema.statements.sourceName,
      sourceUrl: schema.statements.sourceUrl,
      publishedAt: schema.statements.publishedAt,
    })
    .from(schema.statements)
    .where(eq(schema.statements.politicianId, politician.id))
    .orderBy(desc(schema.statements.publishedAt))
    .limit(50);

  const { id: _id, ...publicProfile } = politician;
  return NextResponse.json({ politician: publicProfile, statements });
}
