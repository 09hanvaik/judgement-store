import { NextResponse } from 'next/server';
import { computeInsights } from '@/insights';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const insights = await computeInsights(slug);
  if (!insights) return NextResponse.json({ error: 'unknown_creator' }, { status: 404 });
  return NextResponse.json(insights);
}
