# Content-expansion plan — vault note inventory, coverage, and proposed quotas

## Status

**Planning only — no question content has been authored as part of this document.** Per your
instruction, the full question bank will not be generated until you approve the inventory and
quotas below. This is a review artifact.

## Scope note: which question types this proposal uses

The content schema (`vault-tools/publish.js`) supports 10 question types, but the app UI
(`IMPLEMENTED_QUESTION_TYPES` in [selection.ts](app/src/session/selection.ts#L12)) currently only
renders 4 of them:

- `en_to_pt` (exact-checked)
- `open_completion`, `explain_difference`, `speak_aloud` (self-assessed, Phase 3)

The other 6 exact-checked types (`pt_to_en`, `fill_blank`, `choose_form`, `correct_sentence`,
`context_choice`, `build_sentence`) have no rendering path in the app yet — that's a pre-existing,
separate scope gap (noted in the Phase 3 plan), not addressed here. All quotas below use only the
4 implemented types, matching how the 7 existing review files are authored today.

## Vault inventory

The vault has 22 grammar notes. 1 is excluded from publishing (image-only, no extractable text),
leaving 21 eligible. 7 already have approved review questions (32 total). 14 have none yet.

Topics are derived from `publish.js`'s actual `deriveTopic()` logic: a note 3+ path segments deep
under `Grammar/` takes its subfolder name as topic (e.g. `Grammar/Verbs/X.md` → `Verbs`); anything
else takes its top-level folder name (`Bits and Bobs`, or bare `Grammar` for direct-child notes
like `Articles.md`/`Prepositions.md`).

### Already covered (7 notes, 32 approved questions — no action needed)

| Note | Topic | Approved questions |
|---|---|---|
| `Bits and Bobs/Tão and Tanto.md` | Bits and Bobs | 7 |
| `Bits and Bobs/Making Comparisons.md` | Bits and Bobs | 4 |
| `Bits and Bobs/Algum & Nenhum.md` | Bits and Bobs | 3 |
| `Bits and Bobs/Bom, Boa & Bem.md` | Bits and Bobs | 3 |
| `Grammar/Pronouns/Direct Object Pronouns.md` | Pronouns | 7 |
| `Grammar/Verbs/Subjunctive.md` | Verbs | 5 |
| `Grammar/Verbs/Imperative Mood.md` | Verbs | 3 |

### Excluded (1 note — unchanged, no action needed)

| Note | Topic | Reason |
|---|---|---|
| `Bits and Bobs/Telling the Time.md` | Bits and Bobs | Image-only content, no extractable text (`EXCLUDED_NOTES` in publish.js) |

### Uncovered (14 notes — proposed quotas below)

## Proposed quotas for uncovered notes

Counts are an initial proposal, sized roughly to each note's teaching depth (a dense multi-section
cheat sheet gets more than a short single-concept note). Type mix sticks to the 4 implemented
types. ⚠ marks two content-overlap risks worth a decision before authoring.

| # | Note | Topic | Total | en_to_pt | open_completion | explain_difference | speak_aloud |
|---|---|---|--:|--:|--:|--:|--:|
| 1 | `Grammar/Adjectives/Demonstrative Adjectives.md` | Adjectives | 5 | 1 | 1 | 2 | 1 |
| 2 | `Grammar/Adjectives/Possessive Adjectives.md` | Adjectives | 5 | 1 | 1 | 2 | 1 |
| 3 | `Grammar/Adjectives/Indefinite Adjectives.md` ⚠A | Adjectives | 6 | 1 | 2 | 2 | 1 |
| 4 | `Grammar/Articles.md` | Grammar | 7 | 1 | 3 | 2 | 1 |
| 5 | `Grammar/Prepositions.md` | Grammar | 9 | 1 | 3 | 3 | 2 |
| 6 | `Grammar/Pronouns/Subject Pronouns.md` | Pronouns | 5 | 1 | 1 | 2 | 1 |
| 7 | `Grammar/Pronouns/Indirect Object Pronouns.md` | Pronouns | 6 | 1 | 2 | 2 | 1 |
| 8 | `Grammar/Pronouns/Reflexive Pronouns.md` | Pronouns | 6 | 1 | 1 | 2 | 2 |
| 9 | `Grammar/Pronouns/Demonstrative Pronouns.md` | Pronouns | 5 | 1 | 1 | 2 | 1 |
| 10 | `Grammar/Pronouns/Relative Pronouns.md` | Pronouns | 6 | 1 | 2 | 2 | 1 |
| 11 | `Grammar/Verbs/Reflexive Verbs Cheat Sheet.md` ⚠B | Verbs | 5 | 0 | 1 | 3 | 1 |
| 12 | `Grammar/Verbs/Tenses Overview.md` | Verbs | 7 | 1 | 2 | 3 | 0 |
| 13 | `Grammar/Verbs/Conjugations.md` | Verbs | 5 | 2 | 3 | 0 | 0 |
| 14 | `Bits and Bobs/Common Structures.md` | Bits and Bobs | 8 | 1 | 3 | 2 | 2 |
| | **Total** | | **85** | 14 | 26 | 27 | 15 |

### Per-note rationale

1. **Demonstrative Adjectives** — the este/esse/aquele three-way distance system, plus the
   colloquial shift where esse absorbs este in everyday speech. `explain_difference` carries the
   distance system; `open_completion`/`en_to_pt` drill picking the right form; `speak_aloud` for
   fixed time expressions (esse fim de semana, etc.).
2. **Possessive Adjectives** — seu's structural ambiguity (your/his/her/their) vs. the
   dele/dela/deles/delas disambiguation, plus teu vs seu regional/register variation.
3. **Indefinite Adjectives** ⚠A — broad note (todo, cada, outro, qualquer, certo, muito, pouco,
   vários), including cases where word order changes meaning (certo before/after the noun). **This
   note substantially overlaps the already-covered `Algum & Nenhum.md`** (algum/nenhum are covered
   there in Bits and Bobs, but also appear here as one subsection). Proposal: scope new questions
   away from algum/nenhum specifically and toward the other words plus the word-order-shifts-meaning
   cases, to avoid near-duplicate content with the existing 3 approved questions.
4. **Articles** — foundational and high-frequency: the do/da/no/na/ao/à contractions are probably
   the single most practically useful drill in the whole uncovered set, plus profession-without-
   article vs description-with-article.
5. **Prepositions** — the densest, most cross-cutting note (a vs para, de's multiple meanings and
   verbs that require it, contractions, comigo/contigo/conosco, plus its own "3 common mistakes"
   section) — given the largest quota accordingly.
6. **Subject Pronouns** — foundational; the you're-taught-early-but-still-trips-people-up quirk
   that você and a gente both take 3rd-person verb conjugations despite meaning "you"/"we".
7. **Indirect Object Pronouns** — direct parallel to the already-covered Direct Object Pronouns
   note (7 questions there); lhe's formality/ambiguity vs. the para ele/para ela workaround used in
   speech.
8. **Reflexive Pronouns** — verbs that change meaning when reflexive (lembrar vs lembrar-se,
   esquecer vs esquecer-se), você pairing with se not te, and everyday reflexive expressions
   (Como você se chama?, Sente-se!) suit `speak_aloud` well.
9. **Demonstrative Pronouns** — pairs conceptually with #1 but is genuinely distinct (pronoun
   replaces the noun entirely vs. adjective modifying it), plus the neuter isto/isso/aquilo forms
   used for ideas rather than gendered nouns. Not flagged as a duplication risk, but authoring
   should keep the adjective/pronoun distinction explicit in both notes' questions.
10. **Relative Pronouns** — que/quem/onde/cujo/o qual comparison, and the point that que can never
    be dropped in Portuguese the way "that" can in English (a common English-speaker error), plus
    onde vs aonde.
11. **Reflexive Verbs Cheat Sheet** ⚠B — **heavily overlaps note #8 (Reflexive Pronouns)**, same
    core grammar in cheat-sheet form. It does have one genuinely unique angle: the "3 types of se"
    (reflexive / passive / impersonal), which isn't in the Reflexive Pronouns note. Proposal:
    scope this note's quota narrowly to that distinction (hence 3 of 5 questions being
    `explain_difference`) rather than re-covering ground #8 already owns.
12. **Tenses Overview** — imperfeito vs. "tenho feito"-style present-perfect constructions, and the
    classic mismatch where English present perfect often maps to Portuguese simple past. Skews
    conceptual/written register, so no `speak_aloud`.
13. **Conjugations** — a pure paradigm-table reference (regular -ar/-er/-ir across tenses), not
    explanatory prose — there's no "why" content to build `explain_difference`/`speak_aloud`
    questions from. Proposal: mechanical `open_completion`/`en_to_pt` conjugation drills only.
14. **Common Structures** — high-value conversational idioms (acabar de, ter que, ficar+adjective,
    dar para, já/ainda/só/mesmo/até, né/pois é) — given a large quota since the note itself frames
    this content as key to sounding natural.

### Decisions needed from you

- **⚠A (Indefinite Adjectives vs. Algum & Nenhum)**: OK to scope new questions away from
  algum/nenhum to avoid duplicating the 3 existing approved questions?
- **⚠B (Reflexive Verbs Cheat Sheet vs. Reflexive Pronouns)**: OK to narrow this note's quota to
  just the "3 types of se" distinction, rather than a full independent question set?
- **Quotas themselves**: the 85-question total (bringing the grand total to 117) is a proposal,
  not a constraint — happy to scale any note up/down, drop a note, or rebalance the type mix
  (e.g. more `en_to_pt` if you want more exact-checked drills vs. self-assessed ones).

Once you approve (with any adjustments), the next step is hand-authoring the actual YAML content
per note, following the same review-file workflow used for the existing 7 files.
