# Judgement store

**Tano × Corgi Creator Heist.** One product that helps one audience member make one
better decision, in the creator's voice, showing the rule behind every answer —
and measuring saves, shares and returns rather than clicks.

The valuable audience is quiet. Most high-value buyers never DM and never click
an affiliate link: they save, they forward, and they come back days later. So the
judgement has to be self-serve **before** a DM is sent, shareable on its own, and
measured on the signals quiet people actually leave.

This is not a chatbot. **No model runs when you ask a question.** The answer path
is a pure function over the creator's own notes.

---

## Run it

Node 20+. From a cold start, with no API keys at all:

```bash
npm install
```

```bash
npm run db:reset && npm run dev
```

Then open <http://localhost:3000/c/maya> and tap the three **Demo mode** chips.

```bash
npm test
```

118 tests, no server and no keys required.

---

## Architecture

```
  CAPTURE                 JUDGEMENT STORE            ROUTER  (pure, offline)
 ┌──────────────┐        ┌──────────────────┐      ┌──────────────────────────┐
 │ voice note   │        │ creators         │      │ 1 normalise              │
 │ notebook     │──┐     │ items            │      │ 2 classify  (9 modes)    │
 │ DM / post    │  │     │ judgement_units  │─────▶│ 3 extract constraints    │
 └──────────────┘  │     │ rules            │      │ 4 filter units           │
                   │     │ templates        │      │ 5 apply rules            │
          segment  │     └──────────────────┘      │ 6 rank                   │
          extract  │              ▲                │ 7 skip notes             │
        (LLM opt.) │              │ approve        │ 8 ask_back               │
                   ▼              │                │ 9 render + fillers       │
            ┌────────────┐   ┌─────────────┐       └───────────┬──────────────┘
            │ candidates │──▶│ APPROVAL UI │                   │
            └────────────┘   │ /creator/   │                   ▼
             never live      │  [slug]/    │        ┌──────────────────────┐
             until approved  │  review     │        │ answers (immutable,  │
                             └─────────────┘        │ content-addressed)   │
                                                    └──────────┬───────────┘
                                                               │
        DELIVERY                                               ▼
   ┌───────────────┬──────────────┬───────────────┬────────────────────┐
   │ /c/[slug]     │ /a/[id]      │ /c/../saves   │ OG card            │
   │ ask + chips   │ share page   │ my picks      │ /api/share/../card │
   └───────┬───────┴──────┬───────┴───────┬───────┴─────────┬──────────┘
           │              │               │                 │
           └──────────────┴───────┬───────┴─────────────────┘
                                  ▼
                          ┌───────────────┐        ┌──────────────────────┐
                          │ events        │───────▶│ INSIGHTS             │
                          │ shares, saves │        │ funnel, share chains │
                          │ visitors      │        │ return lag, time back│
                          └───────────────┘        └──────────┬───────────┘
                                                              ▼
                                                    /creator/[slug]
```

One codebase, creators as data. Adding a creator — or absorbing a twist at the
16:00 intelligence drop — is an edit to `data/<slug>.json` plus `npm run db:reset`.
No code changes.

### Layout

```
data/               maya.json, sofia.json, aditi.json — the case files, transcribed
src/db/             drizzle schema, libSQL client, migrations, typed JSON helpers
src/engine/         normalise · classify · constraints · filter · rules · rank
                    · render · fillers · hash · router   (pure, no IO)
src/ingest/         segment · extract (heuristic, or LLM behind a key)
src/insights/       live funnel, share chains, lag, time-back, cohort maths
src/app/            pages and route handlers
src/components/     AnswerCard, AskPanel, VoicePlayer, ReviewQueue, …
scripts/            migrate · seed · reset · generate-audio · try
tests/              118 vitest tests against a separate seeded database
```

---

## The nine modes

One router, nine modes, plus `none` for messages that are not questions.

| Mode | Looks like | Behaviour |
|---|---|---|
| `decide` | "just tell me" | exactly one pick |
| `budget` | "anything under £30?" | price filter, plus what to skip |
| `narrow` | "only 2 products", "which ONE" | capped at 2, or 1 when one is asked |
| `personal` | "what would YOU buy with your money?" | her own-use pick |
| `constrain` | sensitive skin, size, occasion | exclusions before ranking |
| `adapt` | "I already have X" | complements, never repeats what you own |
| `verdict` | "is it worth it?" | worth-it, buy-again, caveat |
| `route` | "how do I get there?" | ordered steps — or a question, if she has none |
| `lookup` | "where is this", "what shade" | the item, or one clarifying question |
| `none` | "i trust you", "buying it payday" | logged as a signal; no answer invented |

Silent Browsers and Forwarders are served across every mode by design: cards are
saveable with no message, returns are detected, `/a/[id]` is a standalone share
page, and shares carry a parent so chains are traceable.

### Ranking

Within budget → her score or verdict strength → her priority → stable tie-break
on id. Rule includes add +5, rule boosts add their own weight, and a named item
in `lookup` or `verdict` adds +20 so "is the Cloud Cream worth it" is about the
Cloud Cream. No randomness anywhere: fillers are seeded by the answer id.

---

## What the product refuses to do

This matters more than any feature here.

- **No LLM on the answer path.** Routing, rules, ranking and rendering are
  deterministic and work with the network unplugged. A model is used in exactly
  one place — offline ingestion — behind an optional key, with a heuristic
  fallback that does the same job.
- **Nothing invented.** No product, price, score, verdict, statistic or quote
  exists that is not in a case file. Where a creator would need to supply
  something, the record is a `candidate` with a TODO and it never reaches an answer.
- **Disclosure ships with every answer**, along with a working link to the human.
- **Seeded data is always labelled** "Sample from case file, not live", and the
  insights panel keeps live and sample numbers in separate sections.
- **Nothing is auto-approved.** Extraction proposes; a human promotes.
- **No audio or third-party call on the demo path.** Audio is pre-generated and
  cached, or falls back to the browser's own voice, or to text.

---

## Assumptions

Recorded rather than resolved, because they are the creators' calls to make.

1. **Maya's reply time.** Her brief says about 70 hours a month over 4,800 DMs
   and states the result as 52 seconds. The exact division is 52.5, so 52 is
   seeded to match her brief. Shown everywhere as an estimate.
2. **Budget is a per-item ceiling.** "Under £60" filters items priced above £60.
   When two picks each clear the ceiling but the basket does not, the answer says
   so: *"Both is £70, over your £60. If £60 is the whole budget, start with Red Reset."*
3. **A price in a verdict question is not a budget.** "Is it worth £38?" names the
   item; it does not ask for things under £38.
4. **Rule text is authored, quotes are not.** `rule_text` is plain-English
   description written from a creator's notes. It never puts words in her mouth;
   her actual words live in `note`, `caveat` and `voice_sample`, unedited.
   `asSentence()` adds a capital and a full stop to fragments like
   "buy once, wear forever" and changes nothing else.
5. **Maya's first-date answer.** Her notes say nothing about first dates, so the
   product asks her real filter question — *"Do you actually care about skincare
   or do you just want to look hot tomorrow?"* — and only then answers, from the
   highest-scoring base plus the SPF she calls nonnegotiable.
6. **Sofia's silk skirt is split in two.** Her note "best with trainers" is a
   pairing she actually gave, so the `adapt` unit is approved. Whether to *buy*
   it is a verdict she never gave, so that unit stays a candidate.
7. **Sofia's and Aditi's clarifying questions are operational, not judgement.**
   Size, occasion, budget, which room. Their real ask-backs have not been
   captured; flagged as a TODO.
8. **Aditi's Cannes verdict.** Her note ("everyone only saw the glamour") is
   approved because it is hers. The answer states plainly that she never put a
   number on the cost.
9. **Visitors are anonymous.** A localStorage id plus a cookie. No accounts, no
   email, nothing sent to the creator.
10. **Sample cohort maths is recomputed, never quoted.** Case-file headline stats
    are displayed separately, with their source.

### Open TODOs (surfaced in the UI, not hidden here)

| Creator | TODO |
|---|---|
| Maya | The **barrier oil** in her DRY rule has no product record — no price, no score, no brand. Nothing was invented for it; the rule says so out loud and a candidate is waiting. |
| Maya | **No fragrance attribute** exists on any product, so her SENSITIVE rule cannot screen for it. Implemented as an ask-back plus a visible caveat. |
| Maya | **approved_fillers** holds two neutral placeholders. Replace with phrases mined from her real transcripts before any live use. |
| Maya | The **retinol guard** is always on but no seeded product is tagged `active=retinol`. |
| Sofia | **Four items have her description but no verdict** (silk skirt, red slingback, grey knit, wide-leg denim). All candidates. |
| Sofia | **No stockist data**, though "where is it" is her most repeated question. Answers give item, size and price and say there is no link. |
| Sofia, Aditi | **No reply-hours figure** in either brief, so the time-back estimate is blank until set in the panel. |
| Aditi | **Every decision-type unit is a candidate.** Seed-stage offers, first-30-days plans: she has published no verdict, so the product asks or declines. |
| Aditi | **No recorded steps for "how do I get in"**, one of her four most repeated questions. |

---

## Environment

Everything is optional. With no file at all, the app runs on a local SQLite file.

```bash
DATABASE_URL=file:./data/app.db   # or a Turso/libSQL URL
DATABASE_AUTH_TOKEN=              # only for remote Turso
ANTHROPIC_API_KEY=                # OPTIONAL — offline extraction only
OPENAI_API_KEY=                   # OPTIONAL — offline transcription only
ELEVENLABS_API_KEY=               # OPTIONAL — offline audio pre-generation only
```

None of these are on the answer path. `scripts/generate-audio.mjs` also requires a
`voice_id` on the creator, which is consent the creator gives, not a default.

### Scripts

| Command | Does |
|---|---|
| `npm run db:migrate` | applies `src/db/migrations/*.sql`, tracked in `_migrations` |
| `npm run db:seed` | loads `data/*.json` with fixed timestamps |
| `npm run db:reset` | drops, migrates, seeds |
| `npm run generate-audio` | pre-generates mp3s for cached answers; skips existing files |
| `npm test` | 118 vitest tests |
| `npx tsx scripts/try.ts maya "i have dry skin and £60"` | ask the router from the terminal |

---

## 60-second demo scripts

### Maya — Hannah, 24, overwhelmed (three taps)

1. **Tap "Just tell me."**
2. **Tap "Maya I have a first date Friday HELP."** She does not answer. She asks
   her real filter question: *"Do you actually care about skincare or do you just
   want to look hot tomorrow?"* — rule `R-MAYA-DATE-ASK`.
3. **Tap "I just want to look hot tomorrow."**
   > Friday is a base problem, not a skincare problem. Tint Veil at £34. Best on
   > camera. And SPF 50 at £26, because that one is nonnegotiable. Nothing new and
   > active before Friday.

   Tint Veil 9.0, SPF 50 9.6, four rules shown by id, disclosure, waveform.

Then, in ten seconds each: **Save** (no message needed), **Share** (an OG card
carrying pick, score, rule and disclosure), and `/creator/maya` — the funnel, the
share chain, and *"6 of 6 buyers sent 0–1 DMs; 5+ savers convert 100% vs 20% and
spend £87 vs £38"*, recomputed from the sample, never quoted.

### Sofia — the silent saver

1. *"WHERE is this blazer I'm begging you"* → Black blazer, £145, "buy once, wear
   forever" — and plainly: no stockist link exists in her notes.
2. *"Anything like this but under £120? I'm not paying £400 lol"* → Loafers £120 and
   White tee £35, with the blazer named as over the line, and the basket total flagged.
3. *"I live in trainers. How would you change it?"* → *"I would not change the shoes."*
   The silk skirt, because "best with trainers" is her own note — rule `R-SOFIA-TRAINERS`.

Then `/creator/sofia/review`: four items she described but never gave a verdict on,
sitting in the queue, invisible to the audience.

### Aditi — two customers

1. *"WHICH event was this, I am begging you"* → she asks which one: Cannes week,
   the keynote, or a founder interview.
2. *"Ok but if you were me, would you take the seed-stage offer?"* → *"Aditi Mishra
   has not made a call on that yet, so this is not going to pretend she has."*
3. *"I took the job. What do I actually do in the first 30 days?"* → a question back,
   not invented steps — rule `R-ADITI-ROUTE-ASK`.

Then `/creator/aditi` → **What to make next**: the backstage answer converts at
251.9 sign-ups per 100K views; Cannes converts at 1.6. The post with the biggest
audience converted least.

---

## Closing lines

> **Maya** no longer needs to answer 4,800 DMs a month **because** the 12 questions
> she actually gets are answered in her voice, with her rule visible, before anyone
> opens her inbox.

> **Sofia** no longer needs to make 100 links **because** the five things she would
> text her sister are the only five the product can say.

> **Aditi** no longer needs to be in every room **because** the one true thing she
> said about the room she was in is now askable — and where she has not decided,
> the product says so instead of guessing.

---

## Deploying

**Vercel + Turso.** Create a Turso database, then set `DATABASE_URL`
(`libsql://…`) and `DATABASE_AUTH_TOKEN` in the Vercel project. Run
`npm run db:migrate && npm run db:seed` locally against those values once; the
migration runner is idempotent and tracks what it has applied. The same code
paths serve a local file and a remote database — nothing branches on which.

Route handlers are `force-dynamic` and the OG card runs on the Node runtime
(`@libsql/client` is a server external package). `public/audio/*.mp3` is
gitignored: run `npm run generate-audio` after deploying if a creator has given
you a consented `voice_id`, otherwise the fallback chain covers it.
