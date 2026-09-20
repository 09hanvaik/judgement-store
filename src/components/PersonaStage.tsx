'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getVisitorId, logEvent, markVisit } from '@/lib/visitor';
import type { CardAnswer, CardCreator } from '@/lib/card';
import type { PersonaHandle } from '@/persona/PersonaAvatar';
import type { VisemeTrack } from '@/persona/visemes';

// three.js only ships to browsers that actually have a persona to render.
const PersonaAvatar = dynamic(() => import('@/persona/PersonaAvatar').then((m) => m.PersonaAvatar), {
  ssr: false,
});

/**
 * The audience surface. Same deterministic answer as every other surface —
 * this one just gives it a presence to come from.
 *
 * The speaking presence is a WebGL/Canvas stand-in for the 3D persona: it is
 * driven by the browser's own speech synthesis, so it needs no keys, no network
 * and no third-party service on the demo path. See docs/persona-pipeline.md for
 * where a rigged 3D head would slot in behind the same interface.
 */

interface Props {
  creator: CardCreator;
  suggestions: string[];
  /** A rigged GLB. Absent until the creator generates one; the orb stands in. */
  personaUrl: string | null;
  /** Opt-in live synthesis for lines that were never pre-generated. */
  live: boolean;
}

interface AskState {
  kind: 'answer' | 'ask_back' | 'signal' | 'no_match';
  answer?: CardAnswer;
  askBack?: { question: string; ruleId: string | null; ruleText: string; options: Array<{ label: string; constraints?: Record<string, unknown> }> };
  signal?: { type: string; text: string; offerSave: boolean };
  noMatch?: { text: string; question: string | null };
}

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/** Slow drifting field. Cheap enough to hold 60fps on a laptop while presenting. */
const FRAG = `
precision mediump float;
uniform vec2 r; uniform float t; uniform float a; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
float n(vec2 x){ return sin(x.x) * sin(x.y); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * r) / min(r.x, r.y);
  float d = length(uv);
  float w = n(uv * 3.0 + vec2(t * 0.22, t * 0.17))
          + 0.5 * n(uv * 6.2 - vec2(t * 0.13, t * 0.19))
          + 0.25 * n(uv * 11.0 + vec2(t * 0.31, -t * 0.11));
  w = w * (0.55 + a * 0.85);
  vec3 col = mix(c1, c2, smoothstep(-1.0, 1.0, w));
  col = mix(col, c3, smoothstep(0.15, 1.15, d + w * 0.16));
  col += a * 0.10 * smoothstep(0.85, 0.0, d);
  col -= 0.035 * smoothstep(0.2, 1.3, d);
  gl_FragColor = vec4(col, 1.0);
}`;

function hexToVec(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ];
}

export function PersonaStage({ creator, suggestions, personaUrl, live }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(0);
  const avatarRef = useRef<PersonaHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [avatarOk, setAvatarOk] = useState<boolean | null>(personaUrl ? null : false);
  const [text, setText] = useState('');
  const [state, setState] = useState<AskState | null>(null);
  const [pending, setPending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const first = creator.name.split(' ')[0];

  useEffect(() => {
    const visit = markVisit(`u.${creator.slug}`);
    if (visit.isReturn) {
      void logEvent({
        type: 'return_visit',
        creatorSlug: creator.slug,
        payload: { days_since_first_seen: visit.daysSince, surface: 'persona' },
      });
    }
  }, [creator.slug]);

  // --- shader background -----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return; // CSS gradient underneath carries the look.

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(program, 'r');
    const uT = gl.getUniformLocation(program, 't');
    const uA = gl.getUniformLocation(program, 'a');
    gl.uniform3fv(gl.getUniformLocation(program, 'c1'), hexToVec('#0b0d14'));
    gl.uniform3fv(gl.getUniformLocation(program, 'c2'), hexToVec(creator.accent));
    gl.uniform3fv(gl.getUniformLocation(program, 'c3'), hexToVec('#05060a'));

    let raf = 0;
    const start = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uR, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      gl.uniform1f(uT, reduced ? 0 : (now - start) / 1000);
      gl.uniform1f(uA, levelRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [creator.accent]);

  // --- speech ---------------------------------------------------------------

  /**
   * Cache first. A pre-generated track plays its own audio and drives the mouth
   * from real timings; anything else falls back to the browser's voice with an
   * estimated mouth. Either way the words are already decided — this only
   * chooses how they are delivered.
   */
  const deliver = useCallback(
    async (line: string, answerId?: string | null) => {
      try {
        const response = await fetch('/api/persona/speak', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ creatorSlug: creator.slug, text: line, answerId, live }),
        });
        const data = (await response.json()) as { track?: VisemeTrack & { audioUrl: string | null } };
        const track = data.track;
        if (!track) return false;

        if (track.audioUrl) {
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = track.audioUrl;
          audio.onplay = () => setSpeaking(true);
          audio.onended = () => {
            setSpeaking(false);
            avatarRef.current?.stop();
            levelRef.current = 0;
          };
          await audio.play();
          avatarRef.current?.play(track, audio);
          return true;
        }

        // No audio, but the estimated frames still shape the mouth in time
        // with the browser voice.
        avatarRef.current?.play(track, null);
      } catch {
        // Fall through to browser speech.
      }
      return false;
    },
    [creator.slug, live],
  );

  const speakInBrowser = useCallback((line: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 1.0;
    let raf = 0;
    const started = performance.now();
    const pulse = (now: number) => {
      const s = (now - started) / 1000;
      // Envelope stands in for phoneme amplitude until a real viseme track exists.
      levelRef.current = Math.max(0, 0.35 + 0.45 * Math.sin(s * 11) * Math.sin(s * 2.3));
      raf = requestAnimationFrame(pulse);
    };
    utterance.onstart = () => {
      setSpeaking(true);
      raf = requestAnimationFrame(pulse);
    };
    const stop = () => {
      setSpeaking(false);
      cancelAnimationFrame(raf);
      levelRef.current = 0;
    };
    utterance.onend = stop;
    utterance.onerror = stop;
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback(
    async (line: string, answerId?: string | null) => {
      const played = await deliver(line, answerId);
      if (!played) speakInBrowser(line);
    },
    [deliver, speakInBrowser],
  );

  const ask = useCallback(
    async (input: { text?: string; constraints?: Record<string, unknown> }) => {
      setPending(true);
      setSaved(false);
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            creatorSlug: creator.slug,
            visitorId: getVisitorId(),
            text: input.text ?? '',
            chipConstraints: input.constraints,
            src: 'persona',
          }),
        });
        const data = (await response.json()) as AskState;
        if (data.kind === 'answer' && data.answer) {
          setState({ kind: 'answer', answer: { ...data.answer, creator } });
          void speak(data.answer.renderedText, data.answer.id);
        } else {
          setState(data);
          const line =
            data.kind === 'ask_back'
              ? data.askBack?.question
              : data.kind === 'signal'
                ? data.signal?.text
                : data.noMatch?.text;
          if (line) void speak(line);
        }
      } finally {
        setPending(false);
      }
    },
    [creator, speak],
  );

  async function save() {
    if (state?.kind !== 'answer' || !state.answer) return;
    setSaved(true);
    await fetch('/api/saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: getVisitorId(), answerId: state.answer.id, src: 'persona' }),
    }).catch(() => setSaved(false));
  }

  const answer = state?.kind === 'answer' ? state.answer : undefined;
  const spoken =
    answer?.renderedText ??
    (state?.kind === 'ask_back'
      ? state.askBack?.question
      : state?.kind === 'signal'
        ? state.signal?.text
        : state?.kind === 'no_match'
          ? state.noMatch?.text
          : undefined);

  return (
    <div className="stage" style={{ ['--accent' as string]: creator.accent }}>
      <canvas ref={canvasRef} className="stage-bg" aria-hidden />

      <div className="stage-inner">
        <header className="glass head">
          {personaUrl && avatarOk !== false ? (
            <span className="persona" data-speaking={speaking}>
              <PersonaAvatar
                ref={avatarRef}
                modelUrl={personaUrl}
                accent={creator.accent}
                onReady={setAvatarOk}
                className="persona-canvas"
              />
            </span>
          ) : (
            <span className="orb" data-speaking={speaking} aria-hidden>
              <span className="orb-ring" />
              <span className="orb-core">{first[0]}</span>
            </span>
          )}
          <span className="head-text">
            <strong>{creator.name}</strong>
            <span>{creator.niche}</span>
          </span>
          <span className="badge">AI</span>
        </header>

        <p className="disclosure">{creator.disclosureText}</p>

        <section className="glass panel" aria-live="polite">
          {spoken ? (
            <p className="said">{spoken}</p>
          ) : (
            <p className="said muted">
              Ask {first} something. She answers from what she has actually decided, and says so when
              she has not.
            </p>
          )}

          {answer && answer.picks.length > 0 ? (
            <ul className="picks">
              {answer.picks.map((pick) => (
                <li key={pick.unitId}>
                  <span className="pick-name">{pick.itemName ?? 'Her call'}</span>
                  {pick.priceGbp !== null ? <span className="pill">£{pick.priceGbp}</span> : null}
                  {pick.score !== null ? <span className="pill solid">{pick.score.toFixed(1)}/10</span> : null}
                  {pick.note ? <span className="pick-note">{pick.note}</span> : null}
                  {pick.caveat ? <span className="pick-caveat">{pick.caveat}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {state?.kind === 'ask_back' && state.askBack?.options?.length ? (
            <div className="row">
              {state.askBack.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="glass btn"
                  onClick={() => void ask({ text, constraints: option.constraints })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {(answer?.firedRules.length ?? 0) > 0 || state?.kind === 'ask_back' ? (
            <details className="rules">
              <summary>The rule that fired</summary>
              <ul>
                {answer
                  ? answer.firedRules.map((rule) => (
                      <li key={rule.id}>
                        <code>{rule.id}</code>
                        {rule.text}
                      </li>
                    ))
                  : (
                      <li>
                        <code>{state?.askBack?.ruleId ?? 'required fact'}</code>
                        {state?.askBack?.ruleText}
                      </li>
                    )}
              </ul>
            </details>
          ) : null}

          {answer ? (
            <div className="row">
              <button type="button" className="glass btn" onClick={save} disabled={saved}>
                {saved ? 'Saved' : 'Save this'}
              </button>
              <button type="button" className="glass btn" onClick={() => void speak(answer.renderedText, answer.id)}>
                Hear it again
              </button>
              <Link className="glass btn" href={`/a/${answer.id}`}>
                Open share page
              </Link>
            </div>
          ) : null}
        </section>

        <form
          className="glass ask"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) void ask({ text });
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Say something to ${first}`}
            aria-label={`Ask ${first}`}
          />
          <button type="submit" disabled={pending || !text.trim()}>
            {pending ? '…' : 'Ask'}
          </button>
        </form>

        <div className="row wrap">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="glass chipx"
              onClick={() => {
                setText(suggestion);
                void ask({ text: suggestion });
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <footer className="foot">
          <Link href={`/c/${creator.slug}/saves`}>My picks</Link>
          <Link href={`/c/${creator.slug}/ask-directly`}>Ask {first} directly</Link>
          <Link href="/demo">How this answer was built</Link>
        </footer>
      </div>
    </div>
  );
}
