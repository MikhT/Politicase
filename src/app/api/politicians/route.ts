import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians?q=meloni&camera=camera&partito=fratelli-ditalia
 * Public read-only list of parliamentarians.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const chamber = params.get("camera");
  const partySlug = params.get("partito");

  const conditions: SQL[] = [];
  if (q) {
    const searchCondition = or(
      ilike(schema.politicians.firstName, `%${q}%`),
      ilike(schema.politicians.lastName, `%${q}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (chamber === "camera" || chamber === "senato") {
    conditions.push(eq(schema.politicians.chamber, chamber));
  }
  if (partySlug) {
    const [party] = await db
      .select({ id: schema.parties.id })
      .from(schema.parties)
      .where(eq(schema.parties.slug, partySlug));
    if (!party) return NextResponse.json({ politicians: [] });
    conditions.push(eq(schema.politicians.partyId, party.id));
  }

  const politicians = await db
    .select({
      slug: schema.politicians.slug,
      firstName: schema.politicians.firstName,
      lastName: schema.politicians.lastName,
      chamber: schema.politicians.chamber,
      party: schema.parties.shortName,
      partySlug: schema.parties.slug,
    })
    .from(schema.politicians)
    .leftJoin(schema.parties, eq(schema.parties.id, schema.politicians.partyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.politicians.lastName, schema.politicians.firstName);

  return NextResponse.json({ politicians });
}
