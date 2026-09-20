import { NextResponse } from 'next/server';
import { loadAnswer } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const answer = await loadAnswer(id);
  if (!answer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ answer });
}
