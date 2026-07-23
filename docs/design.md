# Brazilian Portuguese Offline Practice App — Design Document

## Context

You maintain a small Obsidian vault (21 files, ~20 real notes — one is an image-only
placeholder) covering Brazilian Portuguese grammar, and want to turn it into an active-recall
practice system rather than passive flashcard review. This document is the discovery/design
output requested: no code is written yet. It restates the workflow, evaluates the architecture
(with particular attention to Android/PWA offline feasibility, since that was flagged as the
main technical risk), defines data schemas and behaviours for every functional requirement, and
lays out a staged build plan.

Two architecture-defining questions were resolved with you during the first pass:
- **Hosting**: GitHub Pages (public static site) for the app shell + published content.
- **Content generation**: done interactively by asking Claude Code to draft candidates per
  note/batch — no separate script or API key.

### Revision history

**Round 1** — five changes approved:
1. Progress export is backup/restore only, not bidirectional sync — the phone is the sole
   authoritative practice device in v1.
2. Simplified identity: a permanent `id` lives directly in each approved YAML question, assigned
   once and kept through edits. `publish.js` uses a content hash to detect changes and bump
   `version`. No separate identity-registry file, no fuzzy match-hint matching.
3. *(superseded by Round 2 — see below)*
4. Image-only notes and Obsidian image-asset handling are excluded from v1. *Telling the Time*
   can get manually-authored questions, or be revisited once/if converted to text-based Markdown.
5. "Again" ratings requeue within the current session where there's room, in addition to (not
   instead of) being scheduled again for the next day via normal spaced review.

**Round 2** — one change: full Obsidian note snapshots are back in the published bundle
(reversing round 1's item 3). You confirmed you're comfortable with the GitHub Pages site being
public, including your notes and question content. Follow-up check confirmed round 1's item 4
stands unchanged: the one image-only note (*Telling the Time.md*) stays excluded from v1 either
way, since it has no extractable text and is the vault's only note with an embedded image
(verified by search — no other note references an image). Because full note browsing is back,
the "reference extract" concept invented in round 1 specifically as a substitute for it is no
longer needed and has been removed — source citations link directly to the real rendered note.

---

## 1. Vault inspection findings (grounds the rest of the design)

Location: `C:\Users\Sawye\OneDrive\Note Storage\Knowledge Base\Brazilian Portuguese`

- 21 files: `Bits and Bobs/` (6 notes: Algum & Nenhum, Bom/Boa/Bem, Common Structures, Making
  Comparisons, Telling the Time, Tão and Tanto) and `Grammar/` (Articles, Prepositions, plus
  `Adjectives/`, `Pronouns/`, `Verbs/` subfolders — 5, 6, 4 notes respectively). No other vaults
  or note stores found.
- **No YAML frontmatter, no tags, no consistent heading structure anywhere.** Several notes
  (Tão and Tanto, Algum & Nenhum, Demonstrative Pronouns, Imperative Mood) have no H1 title at
  all — they open directly with conversational prose ("Excellent choice...", "Great question —
  ..."). Topic/subtopic metadata cannot be parsed structurally; it's assigned during the
  generation/review step (folder path is a reasonable topic default, subtopic is judgement-based).
- Notes are long (180–805 lines), prose-heavy, written in a teaching/tutorial voice with tables,
  ASCII decision trees, blockquotes, and — importantly — **bolded Portuguese/English example
  sentence pairs throughout**. These pairs are the richest raw material for translation questions.
- Several notes already contain hand-built "Mini practice" sections (numbered prompts + an
  answer key), e.g. *Tão and Tanto.md* and *Direct Object Pronouns.md*. These can be extracted
  almost mechanically as a first, low-risk batch of seed questions before any semantic
  generation work.
- **Edge case, excluded from v1**: `Bits and Bobs/Telling the Time.md` is 0 lines of text — it's
  a single pasted screenshot (`![[Pasted image ...png]]`). Confirmed via a vault-wide search that
  it's the *only* note with an embedded image. No image handling or OCR is built for v1; the note
  is simply omitted from the published note bundle, and questions for this topic, if wanted, are
  hand-authored directly in YAML like any manually-written question.
- No Obsidian community plugins are installed (checked `.obsidian/` — only core plugins
  configured), so there's no existing spaced-repetition/flashcard plugin data to migrate from.

**Implication**: question generation cannot be a rigid Markdown parser (no reliable frontmatter,
headings, or tags to key off). It has to be a semantic, human-reviewed extraction process —
matching the "ask Claude Code directly" decision. Full note text, by contrast, needs no such
review gate — it's mirrored as-is, since it's simply your own existing, already-authoritative
writing.

---

## 2. Goals and non-goals

**Optimise for**: active recall/production, bidirectional translation, grammar-in-context,
targeted weakness review, offline reliability, simple maintenance, notes-as-source-of-truth,
inspectable/editable question data, easy suppression of bad questions, minimal infrastructure.

**Explicitly not building (v1 or ever)**: multi-user support, cloud accounts, social/leaderboard
features, speech recognition, text-to-speech, online AI at runtime, app-store distribution,
complex gamification, microservices, a polished visual design system.

**Deferred beyond v1**: image-asset handling/OCR for image-only notes (currently just *Telling
the Time.md*), automatic bidirectional progress sync, fuzzy-matched question identity. Each is a
reasonable v2+ idea if it turns out to matter in practice, not a rejected idea.

**Accepted trade-off**: the GitHub Pages site (app + all published questions + full note text)
is public at an obscure URL. You've confirmed you're comfortable with this — nothing sensitive
lives in the vault, and your personal progress/attempt history never leaves your device either
way (see §16).

---

## 3. User workflow (restated)

**Laptop, occasionally** (whenever a note is added/edited, or you want more questions):
1. Edit notes in Obsidian as normal — the vault stays the single source of truth and is never
   written to by any tooling.
2. Ask Claude Code to draft candidate questions for a note or topic. Claude reads the note and
   writes candidates into a human-readable review file (YAML), grounded in that note's actual
   examples/rules, tagged with a source reference. New candidates have no `id` yet.
3. You review the candidates in a text editor: edit wording, add accepted alternatives, fix
   explanations, assign topic/difficulty, approve or reject. If an edit is really a correction to
   a previously-approved question, you keep its existing `id` field untouched. Nothing is
   published silently.
4. Run one small local "publish" script (deterministic, no AI) that validates the approved
   question/scenario files, assigns a permanent `id` to any newly-approved item lacking one
   (writing it back into the source YAML), recomputes each item's content hash and bumps
   `version` where it changed, mirrors the vault's note text (skipping the one image-only note),
   and compiles everything into a single versioned content bundle.
5. `git push` — GitHub Pages rebuilds. Nothing further to do; the phone picks it up next time it
   has connectivity.

**Phone, daily** (the sole authoritative practice device, fully offline after first install):
1. Open the installed app. Start a session: pick a size (fixed number or unlimited), topics,
   question types, and a source filter (random / topic / weak / mistakes / due / custom).
2. Answer questions. Deterministic types are graded instantly with concise feedback and a link to
   the actual source note; open/speaking types reveal a model answer and ask for a self-rating.
   Anything rated "Again" gets one more shot later in the same session if there's room left, in
   addition to being scheduled for tomorrow either way.
3. From any answer screen, ignore/flag a bad question on the spot if needed.
4. See a session summary (accuracy, weakest topics, mistakes to revisit).
5. Browse/search the full note text directly when you want to look something up in depth.
6. Occasionally: tap "Export progress" to write a backup JSON to the phone's Downloads folder
   (Syncthing, already configured, can carry it to the laptop as a plain file). This is a safety
   backup, not a routine sync step — normal use never requires it.

**Laptop, optionally**: open the same GitHub Pages URL in a desktop browser — the PWA isn't
phone-exclusive — but its local progress is its own, separate from the phone's, unless you
explicitly import a backup file there.

---

## 4. Recommended architecture

A single static web app (Progressive Web App), no backend, no database server:

```
Obsidian vault (source of truth, untouched by tooling)
        │  (you ask Claude Code to draft question candidates)
        │  (publish.js also mirrors note text directly, no review gate needed for that part)
        ▼
review/*.yaml, scenarios/*.yaml   — human-edited candidate + approved content, one file per note
        │  (local "publish" script: validate, assign ids, hash/version, compile, mirror notes)
        ▼
content-bundle vX.json  (questions, scenarios, full note text — no images)
        │  (git push)
        ▼
GitHub Pages (static site: app shell + content-bundle) — public, at an obscure URL
        │  (HTTPS fetch, cached by service worker)
        ▼
Phone: installed PWA — the sole authoritative practice device
        │  (IndexedDB, entirely local)
        ▼
Progress data (attempts, ratings, schedule, user-set status flags)
        │  (manual "Export" → Downloads folder → Syncthing, backup only)
        ▼
Laptop-visible backup file (restore-on-demand only, not auto-imported)
```

Two independent, one-directional data flows:
- **Content flows laptop → phone** via the published bundle (git + GitHub Pages + service
  worker cache) — this now includes full note text, mirrored automatically, alongside the
  human-reviewed questions/scenarios.
- **Progress backs up phone → laptop** via manual export + Syncthing/OneDrive as a plain file
  drop — a safety net and device-migration path, never a live/synchronised database, and never
  auto-restored.

**Stack recommendation**: plain HTML/CSS/TypeScript with a minimal build step (Vite), no UI
framework. At this scale a framework buys nothing and costs maintenance surface. IndexedDB
accessed directly (or via the tiny `idb` wrapper) — no ORM-like layer needed.

---

## 5. Alternatives considered

| Option | Why not chosen |
|---|---|
| Native Android app (Kotlin) | Heavier toolchain, no cross-device reuse, contradicts "no app-store" preference for simple updates, more maintenance surface than a static web app. |
| React Native / Capacitor-wrapped app, sideloaded APK | Solves nothing the PWA doesn't already solve here; no native APIs (e.g. speech recognition) are needed. Revisit only if PWA install/update friction proves unworkable. |
| Self-hosted LAN-only static server | Rejected in favour of GitHub Pages, for availability away from home Wi-Fi and simpler "just git push" updates — and you've confirmed you're comfortable with the resulting public hosting. |
| Standalone content-generation script + Claude API key | Rejected in favour of asking Claude Code interactively — removes an API-key/cost/runtime dependency for an occasional process. |
| Live-syncing a database file (e.g. SQLite) between devices via Syncthing | Rejected — concurrent writers to one file risk corruption; single-writer-per-device (phone owns IndexedDB) avoids that class of bug entirely. |
| Automatic/continuous bidirectional progress sync | Rejected — the phone is the single authoritative practice device in v1; a manual backup/restore file is far simpler than reconciling two writers. |
| Fuzzy content-similarity matching to detect "is this an edit of an existing question" | Rejected — adds real complexity for a solo-authored, low-volume content set; a human-owned explicit `id` field in the YAML is simpler and just as reliable at this scale. |
| CSV for question review | Rejected — accepted-answers lists, explanations, and nested scenario prompts don't flatten into rows cleanly. YAML chosen for human-editability and reasonable diffs. |
| Curated "reference extract" content type as a browsing substitute | Considered in round 1, then **removed** in round 2 — it existed only to compensate for full notes being excluded; once full note snapshots are back in the bundle, a source citation can link straight to the real note, which is simpler and strictly more useful than a separately curated summary. |
| Bundling the one embedded image (Telling the Time.md) | Rejected for v1 — confirmed it's the vault's only image-bearing note and has zero surrounding text; not worth an asset pipeline for one note. Manually-authored questions or converting the note to text are both simpler paths, revisit later if wanted. |

---

## 6. Android/offline feasibility analysis (the key risk area)

**Service workers require HTTPS (or localhost).** A PWA opened from `file://` cannot register a
service worker and cannot get full "Add to Home Screen" standalone/offline behaviour — only a
plain bookmark shortcut. This is why the app shell must be served from a real HTTPS origin at
least once (GitHub Pages) — after that first load, the service worker caches everything and the
app works with zero connectivity indefinitely, until the next update check.

**Chrome on Android does not support the File System Access API** (`showDirectoryPicker` and
persistent folder handles are desktop-only). This rules out "point the PWA at the
Syncthing-synced vault folder and read the notes live" — there's no API for a mobile PWA to
watch or persistently read an arbitrary filesystem folder. This is why note text, like question
content, is **mirrored into the versioned bundle at publish time** rather than read live: the
phone always has a complete, current-as-of-last-publish copy of your notes available offline,
without needing any live folder access at all.

**OneDrive on Android does not expose a plain writable filesystem folder** to a browser the way a
desktop OneDrive sync folder does — its Android app manages cloud-backed, on-demand files through
its own UI/APIs, not a dependable plain directory a PWA's file picker can casually reach.
**Syncthing is the dependable option** for anything that needs to move phone → laptop: the
official Syncthing Android app materialises real files in normal Android storage (with storage
permission granted), including the Downloads folder if configured to watch it.

**Practical mechanism for the progress backup** (backup only, not sync): the app triggers a
normal browser file download (a JSON blob via an `<a download>` link), which Android saves to
`/Download/`. If Syncthing is pointed at that folder, the backup reaches the laptop
automatically. Nothing on the laptop ever writes back automatically — restoring is a deliberate,
manual "Import backup" action on whichever device needs it, not something that runs on its own.

**IndexedDB persistence risk**: Android can evict a site's storage under storage pressure if it's
not "installed"/persistent. Mitigation: call `navigator.storage.persist()` on first launch, and
treat the periodic backup export as the real safety net regardless.

**Update propagation**: service worker updates aren't always picked up instantly. The app should
show a small "update available — tap to reload" banner once detected, rather than relying on
silent background updates you might not notice.

**Bundle size note**: with full note text now included, the content bundle is larger (~20 notes
of prose, maybe a few hundred KB total) but still trivially small for a service-worker cache —
no practical offline-storage concern at this scale.

**Conclusion**: PWA is feasible and is the right call, provided (a) it's installed from a real
HTTPS origin, (b) content (questions, scenarios, and now full note text) is delivered as
versioned bundles rather than live folder reads, and (c) the progress backup rides on
Syncthing-watched Downloads as a one-way safety net, not a live sync.

---

## 7. Repository / component structure

```
/vault-tools/               — publish script (small, dependency-light Node or Python)
    review/                 — one YAML file per source note: candidate + approved questions
    scenarios/              — conversation scenario YAML files
    publish.(js|py)         — validates, assigns ids, hashes/versions, mirrors note text, compiles
/app/                       — the PWA itself
    src/
        session/            — session config, question selection/filtering, Again-requeue logic
        checking/           — per-type answer checking logic
        review/             — spaced-review scheduling
        storage/            — IndexedDB access, backup export/import
        ui/                 — screens (practice, browse/search notes, progress, manage)
        content/            — fetch/cache the published bundle, Markdown renderer for notes
    public/
        content-bundle.json — latest published bundle (questions, scenarios, note text)
    service-worker.ts
/docs/                       — this design doc, maintenance notes for future-you
```

No `identity-registry.json` (round 1) and no `extracts/` folder (round 2 — superseded by direct
note linking). Two independently runnable pieces — `vault-tools` (laptop-only) and `app` (the
deployed PWA) — sharing only the JSON schema.

---

## 8. Content publishing workflow

1. **Draft**: ask Claude Code, e.g. "generate candidate questions for
   `Grammar/Verbs/Subjunctive.md`, focus on present-subjunctive triggers." Claude writes/updates
   `vault-tools/review/verbs-subjunctive.yaml` with new entries at `status: candidate`, `id`
   omitted, each carrying `source_note`/`source_heading` and a short rationale comment.
2. **Review**: open the YAML, edit freely. Set `status: approved` (or `rejected` /
   `needs_editing`). If this entry is a correction to something previously approved, its `id`
   field is already present from before — just don't touch it.
3. **Publish**: run `publish.js`. It:
   - Reads all `review/*.yaml` and `scenarios/*.yaml`.
   - Ignores anything not `status: approved`.
   - For each approved item missing an `id`, assigns the next sequential id in that topic's
     namespace (e.g. `verbs-subjunctive-0008`) and **writes it back into the source YAML file** —
     the id becomes permanent from that point on, living in the file itself.
   - Computes a `content_hash` over the meaningful fields and compares it to the `content_hash`
     already recorded in that same YAML entry. A change bumps `version`; the id never changes.
   - **Mirrors note text directly from the vault** — no review/approval gate needed, since this
     is just your own already-authoritative writing being displayed read-only. Every `.md` file
     is included verbatim except `Telling the Time.md` (skipped: no extractable text).
   - Emits `content-bundle.json` (questions, scenarios, full note text) plus a monotonic
     `bundle_version`.
   - Fails loudly on schema violations for the question/scenario side.
4. **Deploy**: commit + `git push`; GitHub Pages serves the new bundle.

No separate registry file: the durable state (`id`, `content_hash`, `version`) lives directly in
the YAML source files, which is also git-tracked for free history. This satisfies "must not
silently publish generated content" (for questions/scenarios) while keeping note mirroring
simple and gate-free, since it's not generated content at all — it's a direct copy of what's
already in the vault. The vault itself is never written to in either direction.

---

## 9. Data schemas

### Question (published, read-only on phone)
```yaml
id: verbs-subjunctive-0007          # permanent once assigned; lives in this file, not a registry
version: 2                          # bumped when content_hash changes under this id
content_hash: "sha256:...."         # written back by publish.js each run
type: fill_blank                    # en_to_pt | pt_to_en | fill_blank | choose_form |
                                     # correct_sentence | context_choice | build_sentence |
                                     # open_completion | explain_difference | speak_aloud
topic: Verbs
subtopic: Subjunctive — present triggers
direction: null                     # en_to_pt | pt_to_en, only for translation types
difficulty: medium                  # easy | medium | hard
register: spoken                    # spoken | written | neutral
prompt: "Espero que ele _____ amanhã. (vir)"
accepted_answers:
  - text: "venha"
    accent_sensitive: true
distractors: []                     # for choose_form / context_choice / multiple choice
model_answers: []                   # for open/self-assessed types
useful_structures: []                # for open/speak-aloud types
explanation: "Espero que triggers the present subjunctive..."
source:
  note: "Grammar/Verbs/Subjunctive.md"   # links directly to the real rendered note (§15)
  heading: "The Five Core Verbs"
status: approved                     # candidate | approved | rejected | needs_editing — authoring-side
generation_version: 3
created_at: 2026-05-01
updated_at: 2026-06-14
```

### Note (published, read-only on phone — mirrored, not reviewed)
```jsonc
{
  "path": "Grammar/Verbs/Subjunctive.md",
  "title": "Brazilian Portuguese – Master Guide to the Subjunctive", // best-effort: first H1, else filename
  "topic": "Verbs",                  // folder-derived
  "headings": ["The Big Picture", "The Decision Tree", "Step 1 – Is it a Fact?", "..."],
  "body_markdown": "# Brazilian Portuguese – Master Guide...\n\n..." // full text, rendered client-side
}
```
Every vault note is mirrored verbatim except `Bits and Bobs/Telling the Time.md` (image-only, no
text — omitted from the bundle entirely in v1).

### Progress record (phone-local, IndexedDB, keyed by `id` — never by `id+version`)
```jsonc
{
  "question_id": "verbs-subjunctive-0007",
  "last_seen_version": 2,
  "user_status": "active",           // active | ignored | flagged_bad | needs_editing | duplicate
  "user_status_reason": null,
  "attempts": 12,
  "correct": 9,
  "incorrect": 3,
  "last_reviewed_at": "2026-07-20T19:04:00Z",
  "next_review_at": "2026-07-25T00:00:00Z",
  "ease": 2.3,
  "interval_days": 4,
  "recent_history": [
    {"at": "2026-07-20T19:04:00Z", "rating": "good", "hint_used": false}
    // bounded ring buffer, last ~10 entries
  ]
}
```

### Session config (ephemeral; optionally saved as a named preset)
```jsonc
{
  "count": 30,                       // or "unlimited"
  "topics": ["Verb tenses", "Subjunctive", "Prepositions"],
  "types": ["en_to_pt", "pt_to_en", "fill_blank", "correct_sentence"],
  "source_filter": "random",         // random | topic | weak | mistakes | due | custom
  "include_ignored": false
}
```

### Session result (phone-local, one per completed session)
```jsonc
{
  "session_id": "2026-07-23T07:10Z",
  "config": { /* snapshot of the config above */ },
  "items": [
    {"question_id": "...", "version": 2, "final_result": "correct", "final_rating": "good", "requeued": true},
    {"question_id": "...", "version": 1, "final_result": "ignored_mid_session"}
  ],
  "summary": {"answered": 30, "correct": 23, "incorrect": 7, "accuracy": 0.77,
              "weakest_topics": ["Preterite vs imperfect", "Indirect object pronouns"]}
}
```
`answered`/`correct`/`incorrect`/`accuracy` are computed from each distinct question's **final**
outcome in the session (a question rated Again then retried successfully counts once, as
correct) — see §13 for the requeue mechanics behind `requeued`.

### Conversation scenario (published, read-only on phone)
```yaml
id: scenario-childhood-0002
version: 1
title: Talking about childhood
target_grammar: [Imperfect]
difficulty: medium
opening_prompt: "Onde você morava?"
follow_up_prompts:
  - "O que você fazia depois da escola?"
  - "Você praticava algum esporte?"
model_responses:
  - "Eu morava em uma cidade pequena perto de São Paulo."
useful_structures: [morava, fazia, gostava, costumava]
accepted_answer_patterns: []        # optional loose keyword hints for mode A, not full grading
source: ["Grammar/Verbs/Tenses Overview.md"]
```

*(No identity-registry schema, no reference-extract schema — both removed; identity lives
entirely in the question fields above, and note citations link directly to the mirrored note.)*

---

## 10. Question checking rules

Two checking modes, explicitly separated:

**`exact` (deterministic)** — en→pt, pt→en (constrained), fill-in-the-blank,
choose-the-correct-form, correct-the-sentence, context-based choice, build-a-sentence.
- Normalise both sides: trim, collapse whitespace, case-fold, strip terminal/duplicate
  punctuation.
- Compare against every entry in `accepted_answers`, twice: accent-sensitive and
  accent-stripped. Three outcomes: **fully correct**, **correct except for accent**, **incorrect**.
- Recommended default: "correct except for accent" counts as correct for scheduling (interval
  advances normally) but is visually flagged so the slip doesn't go unnoticed.
- If the typed answer matches none of the accepted answers, don't hard-fail an
  unanticipated-but-valid phrasing: show the accepted/model answers and offer an "actually
  correct" self-override, which is also a natural moment to note "consider adding this as an
  accepted answer" for your next laptop-side review pass (a manual note-to-self, not an
  automated write-back).

**`self_assessed`** — open sentence completion, explain-the-difference, speak-aloud, guided
conversation (mode A). No pass/fail is computed. The app shows `model_answers`/
`useful_structures` and a concise `explanation`, then asks for a self-rating on the same
four-point scale used everywhere (§13): *Could not answer / Difficult / Mostly correct / Easy*.

**Guided written conversation is a hybrid**: optional soft keyword/pattern nudges against
`accepted_answer_patterns`, never a grade — judgement is always model-answer comparison +
self-rating. An offline deterministic checker cannot reliably grade arbitrary Portuguese, so the
app doesn't pretend to.

**Feedback shown on any incorrect/self-rated-low answer**: your answer → suggested/model answer →
one-line "why" → a link to the actual source note, opening it at (or scrolled to) the relevant
heading (§15) — no separate curated extract layer, since the real note is available directly.

---

## 11. Ignore / flag / restore behaviour

Two status layers, kept apart:
- **Authoring status** (`candidate | approved | rejected | needs_editing`) — lives in the
  published question data, set during laptop-side review. Controls what's ever included in a
  publish.
- **User status** (`active | ignored | flagged_bad | needs_editing | duplicate`) — lives
  phone-side in the progress record, **keyed by stable `id`, never by `id+version`**. Settable
  from the answer screen and from a dedicated management/restore view.

Rules:
- Anything other than `active` is immediately excluded from random practice, scheduled/due
  review, weakness practice, mistake review, and topic-accuracy/overdue calculations — no
  re-publish needed.
- `flagged_bad` requires a reason from the fixed list (incorrect answer, ambiguous prompt,
  unnatural Portuguese, duplicate, outside current scope, source note needs correction, other).
- Nothing is ever deleted. The restore view lists all non-active questions with their reason and
  lets you flip them back to `active` at any time.
- **Regeneration safety**: because user status is keyed by the permanent `id` (§12), editing a
  question on the laptop (bumping `version` under the same `id`) never touches or resets your
  ignored/flagged status. The restore view shows "updated since you flagged it" (version-at-flag
  vs current version) as a hint to go re-check, rather than silently auto-unflagging.

---

## 12. Stable-ID and regeneration strategy

1. Every approved question carries a permanent `id` field directly in its YAML entry. It is
   assigned once — either by you during review, or automatically by `publish.js` (next
   sequential id in the topic namespace, written back into the source file) the first time an
   item without one is approved.
2. Editing a question later (fixing wording, adding an accepted answer, correcting the
   explanation) is just editing that YAML file — the `id` line isn't touched, so it's retained
   automatically. There is no separate registry to keep in sync and nothing to reconcile.
3. `publish.js` recomputes `content_hash` (over prompt/answers/type) on every run and compares it
   to the value already stored in that entry. A change bumps `version`; the `id` never changes as
   a result of content changes.
4. **No fuzzy matching**: if Claude drafts a new candidate that happens to cover the same grammar
   point as an existing approved question, it's a plain human editorial call during review
   whether to edit the existing entry (keep its `id`) or approve a genuinely separate new one
   (gets a fresh `id`). At this vault's scale (~20 notes) this is a light, occasional judgement
   call, not a burden worth automating.
5. Consequence: progress history, spaced-review schedule, and user status all survive edits
   automatically, since none of them are keyed by version or content — only by the durable `id`.
   Edit history is implicit in git history of the YAML files.
6. Note text (§9) has no identity/versioning concept at all — it's mirrored wholesale on every
   publish and simply reflects the vault as it currently stands.

---

## 13. Progress and review logic

**Rating scale — unified across the app**: *Again / Difficult / Good / Easy* is the same scale
for both deterministic results and self-assessment (*Could not answer / Difficult / Mostly
correct / Easy*) — one scheduler input, not two parallel concepts.

| Deterministic result | Auto-selected rating | Self-assessed types |
|---|---|---|
| Incorrect | Again | Could not answer → Again |
| Correct, hint used | Difficult (auto-downgraded) | Difficult |
| Correct, no hint | Good (default) | Mostly correct → Good |
| — | user may still override to Easy | Easy |

**Scheduler**: simplified SM-2/Leitner-style (ease factor + interval in days). `Again` resets the
interval to ~1 day and nudges ease down slightly; `Good` multiplies the interval by the ease
factor; `Easy` multiplies more aggressively and bumps ease up; `Difficult` advances the interval
only slightly. Exact multipliers are a build-time tuning detail.

**"Again" within-session requeue**: rating a question "Again" does two independent things:
1. **Session-level (in-memory only)**: if the current session's remaining queue has room, the
   same question is reinserted later in the queue — not immediately next, to avoid annoying
   back-to-back repetition (e.g. inserted a handful of questions later, or shuffled into the
   remaining pool). Capped at **one requeue per question per session**, so a genuinely
   hard/unlearnable-today item doesn't loop indefinitely or drag the session out. A fixed-size
   session that's almost finished, or a very small custom session, may simply not have room to
   requeue — that's fine, it still falls through to point 2.
2. **Schedule-level (persisted, always happens)**: regardless of whether the in-session retry
   happened or succeeded, `next_review_at` is set to the normal short "Again" interval (~1 day
   out), exactly as if the requeue mechanism didn't exist. The requeue is a same-session bonus
   chance, not a replacement for tomorrow's Due Review appearance.
- The session's target `count` refers to distinct questions; requeues are extra attempts layered
  on top, so a "30 question" session may show more than 30 total prompts if some get a retry. The
  session summary (§9) counts each distinct question once, by its final outcome.

**"Practise anything immediately" requirement**: due-review scheduling only governs the *Due
Review* mode. Every other mode ignores `next_review_at` entirely and pulls from all `active`
questions matching the filter.

**Topic accuracy / overdue counts** exclude any question whose `user_status != active`, computed
as `correct / (correct + incorrect)` over active questions only, refreshed on demand.

---

## 14. Conversation-mode design

**Mode A — guided written conversation**: scripted scenario (§9) with typed responses. Checking
is the hybrid from §10: optional soft nudges + always model-answer comparison + self-rating. Not
"AI conversation" — scenario, prompts, and model answers are all pre-authored content from §8.

**Mode B — speak before reveal**: prompt shown → user speaks aloud (nothing recorded) → user taps
"reveal" → model response(s), useful vocabulary, target grammar shown → self-rating recorded
against the scenario (tracked at the scenario level, since a scenario already declares its
`target_grammar` for topic rollups).

---

## 15. Search & note browsing design

Full note browsing is back in v1 (round 2). The published bundle includes every vault note's
full text (§9), except the one image-only note. Search is a client-side substring/keyword scan
over an in-memory index built from note titles, headings, and body text, plus question
prompts/explanations — at this scale (~20 notes, a few hundred questions) a plain scan is
effectively instant; no search library or index format is needed.

Results show note title, best-matching heading, a short extract, and an "open full note" action
that renders the bundled Markdown client-side (tables, blockquotes, code fences, etc. — the same
formatting already used throughout the vault). Tapping a source citation from a question's
feedback opens the actual note, scrolled to the relevant heading where practical. The app never
writes back to the vault or the bundle from this view — read-only, satisfying "must not modify
lesson notes automatically."

`Telling the Time.md` won't appear in search/browse results in v1 (no text to index or render);
this is a known, accepted gap tied to round 1's image-handling exclusion, not an oversight.

---

## 16. Sync, backup and restore design

- **Content** (laptop → phone): git-published static bundle — questions, scenarios, and now full
  note text — fetched over HTTPS, cached offline by the service worker, update banner on new
  version. Not touched by Syncthing/OneDrive.
- **Progress backup** (phone → laptop, one-way, manual): "Export progress" → browser download →
  Android `/Download/` → Syncthing (watching that folder) → appears on the laptop as a plain
  JSON file. This is a **safety backup**, checked/created at your discretion — not a routine
  sync step, and nothing on the laptop consumes it automatically.
- **Restore** (deliberate, on-demand only): "Import progress" on whichever device needs it —
  typically a replacement phone, or recovering from a storage-eviction event. The phone remains
  the authoritative practice device; restoring is a manual, occasional action, never automatic.
- Rejected: any design where a live database file is itself the synced artifact, and any design
  that treats the backup as a bidirectional channel — single-writer-per-device (the phone owns
  IndexedDB) avoids merge/corruption risk entirely.
- Note content and your progress data are on entirely separate channels with different
  visibility: note/question content is public on GitHub Pages (accepted trade-off, §2); progress
  data never leaves your own devices except as a file you explicitly move yourself.

---

## 17. Implementation phases

0. **This design** — approval gate.
1. **Content pipeline MVP**: `vault-tools/` scaffold (`review/`, `scenarios/`), YAML schemas + a
   couple of hand-drafted example files (including extracting the vault's existing "mini
   practice" Q&A pairs as free seed content), `publish.js` with id-assignment + hash/version bump
   logic, schema validation, and note-mirroring (skip `Telling the Time.md`), producing a first
   real `content-bundle.json`. Validate by hand-reviewing generated output for 3–4 notes.
2. **Practice shell**: static site skeleton, service worker + offline caching, IndexedDB progress
   storage, session config screen, rendering + checking for all `exact`-mode question types,
   the Again within-session requeue mechanic, session summary.
3. **Self-assessed types**: open completion, explain-the-difference, speak-aloud reveal flow;
   unified rating scale wired into the scheduler (§13).
4. **Practice modes**: random/topic/weak/mistake/due/custom filters; ignore/flag/restore UI and
   management view; topic-accuracy dashboard.
5. **Conversation scenarios**: both modes, scenario authoring added to the content pipeline.
6. **Note browsing & search**: client-side search over questions + full mirrored note text,
   Markdown rendering, "open source note" links from question feedback.
7. **Backup/restore validated end-to-end on a real phone**: install flow, `persist()` call,
   export → Syncthing → laptop file verified, manual import/restore verified, update-banner flow
   verified.
8. **Polish/hardening**: edge cases (empty topic sets, ending an unlimited session, offline-first
   cold start with no cached bundle yet, the excluded image-only note not breaking search/browse),
   and a short maintenance doc for future-you (how to add a note, draft/review/publish, deploy).

Each phase is independently testable and shippable — you could stop after phase 2 or 3 and
already have a usable daily-practice tool.

---

## 18. Testing strategy

- **Unit tests**: answer normalisation/accent-tier checking, `publish.js` id-assignment +
  version-bump logic + note-mirroring (including correctly skipping the image-only note), the
  scheduler's interval math including the Again-requeue mechanic, topic-accuracy aggregation
  excluding ignored/flagged questions.
- **Manual/exploratory testing**, desktop + real Android phone: install-to-homescreen flow,
  airplane-mode offline verification, service-worker update banner, IndexedDB surviving an app
  restart, note search/browse rendering correctly, and the backup export → Syncthing → laptop
  file appearing correctly (a one-way check, not a round trip).
- No e2e browser automation for v1.

---

## 19. Risks and remaining notes

**Risks**:
- LLM-drafted questions may be unnatural or ambiguous until the drafting process is iterated on —
  mitigated by the human-approval gate; nothing reaches the phone unreviewed.
- Android service-worker update checks are opportunistic — mitigated by an explicit "check for
  updates" action alongside the passive banner.
- IndexedDB eviction is the one true data-loss risk, however rare once installed+persisted —
  mitigated by `persist()` plus treating periodic backup export as mandatory hygiene, not optional.
- The vault's inconsistent structure (no headings in some notes) means topic/subtopic assignment
  for *questions* will sometimes be a judgement call during review — acceptable; note mirroring
  itself is unaffected since it doesn't depend on heading structure.
- Manual human judgement (not tooling) is the only safeguard against accidentally creating a
  near-duplicate question under a new `id` instead of editing an existing one (fuzzy matching was
  deliberately dropped) — acceptable at this content volume, worth revisiting only if the vault
  grows substantially.
- Your notes and question bank are publicly reachable at an obscure GitHub Pages URL — an
  accepted trade-off (§2), not a bug, but worth remembering if the vault's content ever changes
  character (e.g. you start adding anything more personal than grammar notes).

**Recommended defaults (not blocking, revisit if they feel wrong once you're using the app)**:
- Accent-only mismatches count as correct-with-a-visual-flag for scheduling purposes (§10).
- Scenario-level (not per-prompt) progress tracking for conversation mode (§14).
- Again-requeue capped at one retry per question per session (§13).
- Sequential topic-prefixed slugs for ids (`topic-0007`), assigned by `publish.js` when absent.

No further blocking decisions are needed to begin implementation.

---

## 20. Recommended decisions summary

- Hosting: **GitHub Pages**, public static site — confirmed acceptable, including full note text.
- Content generation: **interactive Claude Code drafting**, no script/API key for v1.
- Stack: **vanilla TS/HTML/CSS + Vite**, no UI framework, no ORM.
- Review format: **YAML**, one file per source note, human-edited directly; `id`/`content_hash`/
  `version` live in the file itself. Note text needs no review gate — mirrored verbatim.
- Identity: **explicit permanent `id` field + content-hash versioning**, no fuzzy matching, no
  separate registry.
- Content scope (v1): **questions, scenarios, and full note text** (excluding the one image-only
  note) — no image-asset pipeline.
- Progress: **manual backup/restore only**, phone is sole authoritative device, never
  auto-imported.
- Scheduler: **simplified SM-2/Leitner**, one unified 4-point rating scale, with an in-session
  Again-requeue (capped at 1) layered on top of the normal next-day scheduling.
