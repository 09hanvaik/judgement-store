'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Audio chain, in order: a pre-generated mp3, then the browser's own speech
 * synthesis, then text only. Nothing is generated over the network at demo time.
 */

type Source = 'mp3' | 'speech' | 'text';

interface Props {
  text: string;
  audioUrl: string | null;
  name: string;
  accent: string;
}

export function VoicePlayer({ text, audioUrl, name, accent }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [source, setSource] = useState<Source>(audioUrl ? 'mp3' : 'speech');
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const draw = useCallback(
    (amplitudes: Uint8Array | null, t: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return 0;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const bars = 42;
      let peak = 0;
      for (let i = 0; i < bars; i += 1) {
        let value: number;
        if (amplitudes && amplitudes.length > 0) {
          const index = Math.floor((i / bars) * amplitudes.length);
          value = Math.abs(amplitudes[index] - 128) / 128;
        } else {
          // Speech synthesis exposes no analyser node, so the bars follow a
          // smooth deterministic envelope rather than pretending to be data.
          value = 0.25 + 0.2 * Math.sin(t / 120 + i / 2.2) + 0.15 * Math.sin(t / 47 + i);
          value = Math.max(0.04, Math.min(1, Math.abs(value)));
        }
        peak = Math.max(peak, value);
        const barHeight = Math.max(2, value * height * 0.9);
        const x = (i / bars) * width;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.25 + value * 0.75;
        ctx.fillRect(x + 1, (height - barHeight) / 2, Math.max(2, width / bars - 2), barHeight);
      }
      ctx.globalAlpha = 1;
      return peak;
    },
    [accent],
  );

  const loop = useCallback(
    (analyser: AnalyserNode | null) => {
      const buffer = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      const step = (t: number) => {
        if (analyser && buffer) analyser.getByteTimeDomainData(buffer);
        setLevel(draw(buffer, t));
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [draw],
  );

  const playSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSource('text');
      return;
    }
    setSource('speech');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.onend = () => {
      setPlaying(false);
      stopLoop();
    };
    utterance.onerror = () => {
      setPlaying(false);
      setSource('text');
      stopLoop();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
    loop(null);
  }, [loop, stopLoop, text]);

  const toggle = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      setPlaying(false);
      stopLoop();
      return;
    }

    const element = audioRef.current;
    if (audioUrl && element) {
      try {
        await element.play();
        setSource('mp3');
        setPlaying(true);
        if (!contextRef.current) {
          const AudioCtor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const context = new AudioCtor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaElementSource(element).connect(analyser);
          analyser.connect(context.destination);
          contextRef.current = context;
          analyserRef.current = analyser;
        }
        await contextRef.current?.resume();
        loop(analyserRef.current);
        return;
      } catch {
        // No cached mp3 for this answer yet — fall through to speech.
      }
    }
    playSpeech();
  }, [audioUrl, loop, playSpeech, playing, stopLoop]);

  const mouthOpen = 2 + level * 12;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Stop ${name}` : `Play ${name}'s answer`}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2"
        style={{ outlineColor: accent }}
      >
        <Portrait name={name} accent={accent} mouthOpen={mouthOpen} speaking={playing} />
      </button>

      <div className="min-w-0 flex-1">
        <canvas ref={canvasRef} width={320} height={40} className="h-10 w-full" aria-hidden />
        <p className="label mt-1">
          {playing
            ? source === 'mp3'
              ? 'Playing her recorded answer'
              : 'Playing with your browser voice'
            : source === 'text'
              ? 'Audio unavailable — text only'
              : 'Tap the portrait to hear it'}
        </p>
      </div>

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="none"
          onEnded={() => {
            setPlaying(false);
            stopLoop();
          }}
          onError={() => setSource('speech')}
        />
      ) : null}
    </div>
  );
}

function Portrait({
  name,
  accent,
  mouthOpen,
  speaking,
}: {
  name: string;
  accent: string;
  mouthOpen: number;
  speaking: boolean;
}) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      role="img"
      aria-label={`${name} portrait placeholder`}
    >
      <circle cx="28" cy="28" r="27" fill="#fff" stroke={accent} strokeWidth="1.5" />
      <text
        x="28"
        y="23"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fill={accent}
        opacity={speaking ? 0.3 : 0.75}
      >
        {initials}
      </text>
      <circle cx="21" cy="30" r="1.6" fill={accent} opacity="0.7" />
      <circle cx="35" cy="30" r="1.6" fill={accent} opacity="0.7" />
      <ellipse cx="28" cy="39" rx="7" ry={mouthOpen} fill={accent} opacity={speaking ? 0.9 : 0.25} />
    </svg>
  );
}
