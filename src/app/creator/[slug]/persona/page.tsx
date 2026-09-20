import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PersonaOnboarding } from '@/components/PersonaOnboarding';
import { personaConfig } from '@/persona/providers';
import { creatorBySlug } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function PersonaSetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await creatorBySlug(slug);
  if (!creator) notFound();

  const config = personaConfig(creator.voiceId);
  const first = creator.name.split(' ')[0];

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-24 pt-10"
      style={{ ['--accent' as string]: creator.accent }}
    >
      <header className="mb-8">
        <p className="label">Persona</p>
        <h1 className="text-2xl font-semibold">{creator.name}</h1>
        <p className="mt-2 text-sm text-muted">
          One front-facing portrait becomes a rigged 3D head. No modelling, no bone rigging, no
          blendshape sculpting — the provider ships ARKit shapes and the renderer drives them from
          her speech timings.
        </p>
      </header>

      <section className="card mb-6 px-5 py-4">
        <h2 className="label">What is configured</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li>
            Credential proxy:{' '}
            <strong>{config.daytonaUrl ? 'Daytona' : 'none — calls go direct from this server'}</strong>
          </li>
          <li>
            Speech and lip-sync:{' '}
            <strong>
              {config.daytonaUrl || config.hasElevenLabs
                ? creator.voiceId
                  ? 'ready'
                  : `no consented voice_id for ${first}`
                : 'not configured — browser voice with an estimated mouth'}
            </strong>
          </li>
          <li>
            Photo to model: <strong>{config.canGenerateFromPhoto ? config.avatarProvider : 'paste a model URL below'}</strong>
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          Every one of these is optional. With none of them the app still answers, still shows the
          rule, and still speaks using the browser&apos;s own voice.
        </p>
      </section>

      <PersonaOnboarding
        slug={creator.slug}
        name={creator.name}
        accent={creator.accent}
        personaUrl={creator.personaUrl}
        canGenerateFromPhoto={config.canGenerateFromPhoto}
      />

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href={`/u/${creator.slug}`}>
          Audience surface
        </Link>
        <Link className="underline underline-offset-2" href={`/creator/${creator.slug}`}>
          Creator panel
        </Link>
      </nav>
    </main>
  );
}
