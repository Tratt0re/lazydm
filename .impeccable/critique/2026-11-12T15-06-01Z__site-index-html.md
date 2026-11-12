---
target: the copy of this landing page
total_score: 20
max_score: 28
na_heuristics: 7,9,10
p0_count: 0
p1_count: 3
target_identity: "file:/Users/it065980/DEV/electron/lazy_dm-website/site/index.html"
target_fingerprint: "sha256:0e2070c69e49aaf10e4fed84863323b39357035894e4f1505cb461ece3bc258e"
target_path: /Users/it065980/DEV/electron/lazy_dm-website/site/index.html
timestamp: 2026-11-12T15-06-01Z
slug: site-index-html
---
Method: dual-agent (A: /root/copy_assessment · B: /root/detector_assessment)

## Design Health Score

This score covers the copy and content architecture only, not the visual design.

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 4 | Availability and pre-1.0 status are unmistakable. |
| 2 | Match with the real world | 3 | Strong DM language; some product and developer jargon arrives unexplained. |
| 3 | User control and freedom | 3 | Navigation is explicit, but “Follow on GitHub” misnames the destination action. |
| 4 | Consistency and standards | 3 | Terminology is consistent; the CTA conflicts with GitHub’s Star/Watch conventions. |
| 5 | Error prevention | 2 | Limits are often qualified, but several unsupported specifics can create false expectations. |
| 6 | Recognition rather than recall | 3 | Concrete scenarios aid scanning; specialist terms still require interpretation. |
| 7 | Flexibility and efficiency | n/a | No workflow to accelerate on this persuasive reading surface. |
| 8 | Aesthetic and minimalist design | 2 | Several core facts are repeated more often than persuasion requires. |
| 9 | Error recognition and recovery | n/a | No form or error-producing content flow exists. |
| 10 | Help and documentation | n/a | Product documentation is not the task of this pre-release landing page. |
| **Total** |  | **20/28** | **Good, but only just; the product idea is stronger than the editorial finish.** |

## Design Specificity Verdict

**The copy is strongly product-specific.** It could not be pasted onto a generic notes app: “the guard post opens the guard post,” encounter turns, broken links, Codex ownership, and cloud-conflict handling describe recognizable DM work. The central positioning is also intact: owned Markdown for preparation plus tools for running the session.

The weakness is editorial discipline, not concept. The first viewport explains the product, but “Prep once, run the table lazy” is awkward, risks implying careless DMing, and is less credible than the real proposition. Several implementation details interrupt the benefits, some capability claims go beyond README.md and PRODUCT.md, and repetition reduces momentum.

The deterministic scan found one advisory, `gpt-thin-border-wide-shadow`, reported at `site/index.html:0`. It concerns the theme popover’s border and shadow, has no copy relevance, and is likely a false positive given the documented visual direction. No reliable browser overlay was available because this session exposes no mutable browser/DOM tooling.

## Overall Impression

The page already has the hardest thing to manufacture: a believable point of view. It speaks to DMs through scenes at the desk and table, not generic productivity claims. Its biggest opportunity is to replace absolute promises and internal vocabulary with one clean, credible through-line: **prepare and run the same campaign from one place, while keeping the files yours.**

The emotional journey begins with relief, builds safety through file ownership, then peaks when concrete examples make session use imaginable. It dips when “Rebuildable index,” “Tracker layout,” MCP configuration files, and permission details turn the DM into a technical evaluator. The candid ending preserves trust, but “read the issues” ends on project management rather than anticipation.

Cognitive load is moderate: 3 of 8 checks fail. The page loses single focus in the late AI detour, exposes six peer jump destinations before the product model is established, and does not progressively disclose the AI integration’s configuration and security details. Chunking and short sections otherwise work well.

## What’s Working

1. **Ownership is concrete.** “Move the folder, back it up or open it in any Markdown editor” turns an abstract principle into actions a DM understands.
2. **The best passages simulate table use.** The pinned turn, map beside encounter, linked guard post, and sync-conflict warning translate features into recognizable moments.
3. **Trust is earned honestly.** The page says the app is unreleased and labels screenshot scenarios as made-up instead of inventing social proof or availability.

## Priority Issues

### [P1] The headline is awkward and overpromises

**What:** “Prep once, run the table lazy” is unidiomatic and can imply careless DMing. “Prep your campaign once” and “without hunting for anything” are absolutes.

**Why it matters:** The least believable wording occupies the HTML title, Open Graph title, and opening proposition. It spends credibility before the page reaches its strong evidence.

**Fix:** Frame the value as continuity, not perfection: prepare and run from the same place; keep campaign knowledge close at the table. Preserve “lazy by design” as a product philosophy, not a description of the DM.

**Suggested command:** `$impeccable clarify`

### [P1] Some claims exceed the supplied product truth

**What:** The page says Review finds and fixes misplaced notes, maps support paths/areas/map notes, and specific AI clients require “one command” or named configuration files. README.md and PRODUCT.md confirm broken-link Review, linked map pins, and a generic opt-in local MCP server, but not all these details.

**Why it matters:** The project explicitly promises to say only what is true today. Unsupported specificity is especially costly on a pre-release product.

**Fix:** Verify each claim against the app source and record confirmed facts in PRODUCT.md; otherwise reduce the copy to the confirmed capability. Remove client setup minutiae unless setup itself is a buying reason.

**Suggested command:** `$impeccable harden`

### [P1] “Follow on GitHub” does not match the action

**What:** The primary CTA opens the repository root; opening it does not follow or subscribe to anything.

**Why it matters:** The visitor can believe they completed the requested action when they only navigated to another page. GitHub’s actual repository actions are Star and Watch, and repository visibility remains formally unconfirmed in PRODUCT.md.

**Fix:** Until a genuine subscription exists, use an accurate destination label such as “View LazyDM on GitHub,” then tell visitors they can star or watch there if appropriate.

**Suggested command:** `$impeccable clarify`

### [P2] Internal vocabulary often appears before reader value

**What:** “Rebuildable index,” “Tracker layout,” “Review,” “Info box,” “MCP server,” and raw filenames are correct terminology, but not self-explanatory benefits.

**Why it matters:** The reader shifts from imagining an easier session to decoding the product’s implementation model.

**Fix:** Lead with the saved effort or safer outcome, then name the mechanism. For example: links survive renaming; turns and HP stay visible; the local index can be rebuilt from owned files; AI access is optional and local.

**Suggested command:** `$impeccable clarify`

### [P2] Repetition blunts momentum and weakens the close

**What:** Ownership, platform, pre-1.0 status, maker provenance, and GitHub actions recur across the hero, Properties, status box, body, close, and footer.

**Why it matters:** Reassurance becomes redundancy. The ending repeats availability facts instead of crystallizing why the visitor should return.

**Fix:** Give each truth one job: proposition in the hero, ownership proof in one section, compatibility in context, availability in one status treatment, and a close about watching the product reach 1.0.

**Suggested command:** `$impeccable distill`

## Persona Red Flags

- **Jordan, first-timer:** `[[links]]`, Review, Tracker layout, MCP, and `config.toml` demand increasing technical literacy. “Follow on GitHub” does not explain what happens next.
- **Riley, stress tester:** “Prep once,” “without hunting for anything,” “fixes” misplaced notes, “one command,” and “any model” invite scrutiny. These claims weaken the page’s otherwise careful honesty.
- **Casey, distracted mobile reader:** Six jump labels, a long feature tour, repeated status language, and the late AI detour make the decision harder to resume after an interruption.
- **Morgan, Obsidian-based campaign DM:** “An Obsidian vault and a Codex are the same kind of folder” is encouraging but leaves compatibility boundaries unclear. “Campaigns are ordinary `.md` files” can also imply that encounters and maps are Markdown when the examples show JSON.

## Minor Observations

- In “Every note is a plain Markdown file in a folder you own, called the Codex,” the final phrase can momentarily sound as though it names the file rather than the folder.
- “Both themes, in English, Italian…” combines two unrelated benefits and can sound as though the themes themselves are localized.
- Repeating “on a made-up…” in each caption is honest but creates drag; a single gallery-level disclosure could preserve trust.
- The meta description is clear and truthful; the HTML and Open Graph titles inherit the awkward headline.
- The accessible labels—“Skip to the note,” “Theme: System,” and “LazyDM. Back to the top”—are notably clear.

## Questions to Consider

1. Should the first rewrite optimize for **prep-to-table continuity**, **file ownership/Obsidian compatibility**, or **less work during sessions**?
2. Should the AI section remain a full persuasion block, become a short optional note, or move out of the core landing-page story?
3. Should the next pass address only the three P1 credibility issues, all five priorities, or produce a complete replacement draft while preserving the current structure?
