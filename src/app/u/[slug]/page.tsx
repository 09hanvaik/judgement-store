import { notFound } from 'next/navigation';
import { PersonaStage } from '@/components/PersonaStage';
import { creatorBySlug } from '@/lib/store';
import { readCaseFile } from '@/lib/casefile';
import './persona.css';

export const dynamic = 'force-dynamic';

export default async function PersonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();

  const caseFile = readCaseFile(slug);
  const suggestions = (caseFile?.archetypes ?? []).slice(0, 3).map((a) => a.demo_text);
  const demos = caseFile?.demos ?? [];

  return (
    <PersonaStage
      creator={{
        slug: creator.slug,
        name: creator.name,
        accent: creator.accent,
        disclosureText: creator.disclosureText,
        niche: creator.niche,
      }}
      suggestions={suggestions}
      demos={demos}
      personaUrl={creator.personaUrl}
      live={process.env.PERSONA_LIVE === '1'}
    />
  );
}
