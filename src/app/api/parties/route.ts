import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties
 * Parliamentary groups with member counts.
 */
export async function GET() {
  const parties = await db
    .select({
      slug: schema.parties.slug,
      name: schema.parties.name,
      shortName: schema.parties.shortName,
      color: schema.parties.color,
      members: sql<number>`count(${schema.politicians.id})::int`,
    })
    .from(schema.parties)
    .leftJoin(
      schema.politicians,
      eq(schema.politicians.partyId, schema.parties.id),
    )
    .groupBy(schema.parties.id)
    .orderBy(sql`count(${schema.politicians.id}) desc`);

  return NextResponse.json({ parties });
}
