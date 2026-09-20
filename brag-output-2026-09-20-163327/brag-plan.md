# Brag Plan: Judgement Store

## What is this app?

A creator's judgement, codified. One audience member asks a question and gets
that creator's real call — pick, score, the rule that fired — from a router that
is a pure function over her own notes. No model runs when you ask.

## The angle

Every AI creator product is a chatbot with a face on it. This one is the
opposite claim, and it can prove it: **the same question routed twice returns an
identical hash, and the external-call counter reads zero.** Open on the proof,
then show the product it buys you — a persona who answers from real notes, and
declines, warmly, when she has not made the call.

The refusal is the hero, not the answer. Anything can answer. Almost nothing
says "I have not made that call" and shows you the rule that made it say so.

## Hook (first 2–3 seconds)

Two ten-character hashes land side by side — `0ebe90a225` / `0ebe90a225` — and
the counter under them reads **EXTERNAL CALLS: 0**. No logo, no name yet. The
claim before the product.

## Key moments (the middle)

- The nine stages ticking down the screen with real output: `constrain ·
  confidence 0.533`, `budget_gbp=60 · skin_type=dry · concern=redness`,
  `3 fired: R-MAYA-REDNESS, R-MAYA-DRY, R-MAYA-GUARD-RETINOL`.
- Route time **4.92 ms**, replay **1.03 ms**, external calls **0**.
- Aditi's 3D head answering "what is the best event you have been to?" with
  *"Backstage Q&A. The best answer I ever gave. It was never recorded, which is
  the part that still annoys me."*
- The same persona declining the seed-stage offer — and the rule panel open
  underneath it, `R-ADITI-GUARD-ROOM` in plain English.
- The creator panel: the backstage answer converts at **251.9 sign-ups per 100K
  views**; Cannes, with twelve times the audience, converts at **1.6**.

## Outro / punchline

**Not a chatbot. A judgement store.**

## User flow worth showing

Entry → key action → result, twice over:

1. `/demo` — pick a probe, watch nine stages run, see two identical hashes.
2. `/u/aditi` — ask her something her notes cover; she answers and shows the rule.
3. `/u/aditi` — ask her something they do not; she declines in her own voice.
4. `/creator/aditi` — what the creator sees: what to make next, ranked by result.

## Tone

- Preset: `polished`
- Creative direction: engineering confidence — a systems film, not an ad
- Interpretation: fewer scenes, longer holds, no cleverness in the motion. The
  numbers are the drama. Type settles and stays put long enough to read. The one
  moment of warmth is Aditi's voice; everything around it is instrument-panel calm.

## Format: landscape — 1920x1080
## Duration: 80s target

**Deviation, recorded deliberately.** The skill's creative law is 15–25s. The
user asked for `--duration 80` for a 90-second hackathon demo slot, where the
job is to walk judges through a working system rather than stop a scroll. The
law's own escape clause is "not one second more without a reason"; this is the
reason. Pacing follows `polished` (long holds, few scenes) stretched across six
scenes rather than compressed into four.

## Visual identity (from the project)

- Background (audience surface): `#0b0d14` → `#05060a` radial
- Background (engine / creator surfaces): `#F3F5F7` paper, `#FBF9F6` card
- Accent: `#3B3663` Aditi indigo — secondary `#B4553F` Maya rust, `#37514A` Sofia green
- Text: `#f2f3f8` on dark, `#10131a` on light
- Deterministic-path marker: `#1a6b58` / `#57c7a6` (used in the architecture diagrams)
- Display font: IBM Plex Sans (600)
- Body / data font: IBM Plex Mono — the app sets rule ids and hashes in mono, and
  that is the texture of the whole first act
- Strongest visual element: the two identical hashes with a zero under them;
  second strongest is the glass rule panel over the shader background

## Share copy (draft)

Built a creator AI that answers from her real notes and says "I have not made
that call" when she hasn't — same question in, identical hash out, zero external
calls. Not a chatbot. A judgement store.

## Audio direction

- Role: sparse professional accents over a low bed
- Music: restrained electronic bed, `happy-beats-business-moves` family if the
  bundled cue presets fit; low in the mix throughout, never leading
- Music treatment: start at 0.0 under the hook, hold ~18% through act one, lift
  slightly at the persona reveal, fade out over the final card
- Music cue guidance: read the bundled cue preset for the selected track; place
  strongCue hits at the hash match (~2.5s), the persona reveal (~34s), and the
  final line (~74s). Use the beat grid for the nine-stage sequence only.
- Audio-reactive treatment: subtle — the shader background behind Aditi may
  respond to speech energy, as it already does in the app
- SFX posture: sparse, motion-matched. A dry tick per stage row, one soft
  confirm on the hash match, nothing on the text cards.
- Audio-coupled moments: the nine stages arriving one by one; the hash pair
  landing; the counter resolving to 0
- Restraint rule: no whooshes, no risers, no impact on the refusal scene. The
  refusal plays dry — that is the point of it.

## Storyboard

### Scene 1 — The claim — 9s
Black. Two mono hashes fade up side by side, `0ebe90a225` / `0ebe90a225`, then
the line **Identical id. Identical text.** settles under them. Beat. The counter
**EXTERNAL CALLS — 0** resolves last and holds.
Sequential/interaction: yes — hash one, then hash two, then the line, then the counter.
Audio intent: quiet confidence; one soft confirm when the second hash matches the first.
Audio-coupled idea: counter ticks to 0.
Music: low bed, barely present.
Transition mood: clean → Scene 2

### Scene 2 — Nine stages — 16s
Real `/demo` capture. The probe question sits at the top; the nine stage rows
arrive one by one with their actual output. Hold on `05 apply rules — 3 fired:
R-MAYA-REDNESS, R-MAYA-DRY, R-MAYA-GUARD-RETINOL`. Timing chips at the bottom:
**4.92 ms**, replay **1.03 ms**, **0 external calls**.
Sequential/interaction: yes — nine rows on the beat grid, then the timing chips.
Audio intent: mechanical, unhurried; a dry tick per row.
Audio-coupled idea: beat-aligned row reveal.
Transition mood: clean → Scene 3

### Scene 3 — One line of framing — 6s
Light card, big type: **No model runs when you ask.** Smaller under it:
*normalise · classify · constraints · filter · rules · rank · render*.
Sequential/interaction: none.
Audio intent: a held breath before the product.
Transition mood: soft → Scene 4

### Scene 4 — She answers — 18s
Cut to `/u/aditi`. The 3D head renders over the indigo shader. The question types
in: *what is the best event you have been to?* She answers:
**"Backstage Q&A. The best answer I ever gave. It was never recorded, which is
the part that still annoys me."** The rule panel opens underneath — `R-ADITI-BEST`
— and holds long enough to read.
Sequential/interaction: yes — question types in, answer settles, rule panel opens.
Audio intent: the one warm moment; music lifts slightly; background responds to speech.
Audio-coupled idea: typed question.
Transition mood: soft → Scene 5

### Scene 5 — She declines — 19s
Same surface, second question: *if you were me, would you take the seed-stage
offer?* She does not answer it:
**"I have not made that call, and I would rather say so than say something clever
about a room I was not in."** `R-ADITI-GUARD-ROOM` holds under it: *she would
rather say one true thing about a room she was actually in than ten clever things
about a room she was not.*
Sequential/interaction: yes — question types in, refusal settles, rule holds.
Audio intent: dry. Music drops back. No accent, no sting.
Audio-coupled idea: typed question only.
Transition mood: clean → Scene 6

### Scene 6 — What the creator sees, and the line — 12s
`/creator/aditi`: the what-to-make-next bars. **251.9** sign-ups per 100K views
on the backstage answer; **1.6** on Cannes, at twelve times the reach. Then the
card: **Not a chatbot. A judgement store.**
Sequential/interaction: yes — two bars race, the numbers count up, the line lands.
Audio intent: resolve; music fades out under the final card.
Audio-coupled idea: counters.
Transition mood: final hold.

**Music mood for this video:** restrained electronic, low and steady, never leading
**Audio summary:** A low bed that barely moves for forty seconds of proof, lifts once
when Aditi speaks, drops away entirely for the refusal, and resolves under the last line.
