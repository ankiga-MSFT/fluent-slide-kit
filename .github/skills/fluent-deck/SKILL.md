---
name: fluent-deck
description: "Internal deck implementation playbook used by fluent-presentation for semantic deck authoring, shared-scene compilation, HTML and native PowerPoint rendering, dual validation, screenshot review, and repair. Not an executive-facing workflow."
user-invocable: false
disable-model-invocation: true
---

# Fluent deck workflow

This is an internal playbook. The `fluent-presentation` skill owns user interaction. Execute every
command and quality-control step yourself; never ask the user to edit files, run commands, or inspect
raw reports.

## Scope

Use this skill for presentation structure, narrative, slide composition, shared-scene compilation,
HTML and editable PowerPoint rendering, validation, and artifact handoff. It supports constrained
narrative layouts plus two architecture paths:

- `architecture` is a backward-compatible simple sequence of two to five nodes.
- `diagram` embeds a graph authored and validated through the `fluent-diagram` skill.

Do not force branching, merging, boundaries, decisions, or swim lanes into `architecture`.

## 1. Establish the communication contract

Identify the audience, desired decision or outcome, supplied evidence, and one sentence the audience
should remember from each slide. Split slides that carry multiple takeaways. Never invent a metric,
quote, customer, date, source, topology, or product capability.

Use a bracketed placeholder for missing evidence, such as `[Add Q3 adoption rate]`. For current
Microsoft or Azure claims, query Microsoft Learn MCP and retain the source URL in the slide spec.

## 2. Choose a constrained layout

Read `templates/layouts.json` and choose by message shape:

- `title`: deck or section opening
- `statement`: one decisive claim
- `cards`: two to four parallel ideas
- `split`: argument plus evidence or visual
- `metrics`: two to four quantitative outcomes
- `comparison`: two or three alternatives
- `timeline`: three to six ordered milestones
- `architecture`: a simple linear service sequence only
- `diagram`: a validated `flow` or `layered-architecture` from `diagrams/`
- `quote`: a short sourced quotation
- `sources`: references or appendix

Prefer another slide over adding containers or shrinking typography. Deck JSON owns semantic content;
the scene compiler owns resolved geometry; HTML and PowerPoint renderers consume the same scene.

## 3. Resolve assets and diagrams

Search before writing an asset path:

```powershell
npm run assets:search -- "security shield" --collection fluent --style regular --json
npm run assets:search -- "Azure Kubernetes Service" --collection azure --json
```

Copy exact returned paths. Keep Azure icons in original colors and proportions with visible labels
and useful alt text.

For a non-linear architecture or workflow, classify it with `fluent-diagram`, author
`diagrams/<name>.json`, and run:

```powershell
npm run diagram:validate -- diagrams/<name>.json
```

Then use a `diagram` slide with `diagram.path` and descriptive `diagram.alt`. Do not hand-edit the
rendered SVG. A `diagram` slide renders the approved title only; the renderer ignores `eyebrow` and
`subtitle` there, so carry supporting context in the takeaway, speaker notes, or the diagram itself.

## 4. Author the deck

Create or update `decks/<deck-name>.json` against `schemas/deck.schema.json`, starting from
`examples/deck.json`. Store takeaways, notes, asset references, diagram references, and sources in
JSON. Keep titles within 10 words, body copy within 55 words, and layout items within catalog limits.

## 5. Build and validate

Run after every substantive change:

```powershell
npm run deck:build -- decks/<deck-name>.json --preview
```

The build validates semantic sources and the brand profile, compiles `deck.scene.json`, renders and
checks standalone HTML in Edge, creates a native editable `.pptx`, validates its Open XML structure,
and uses desktop PowerPoint for `1920x1080` previews when no interactive Office session is open.

For embedded diagrams it also enforces a fixed `1600x720` SVG viewBox, 18px minimum effective type,
text containment, item collisions, and connector crossings.

PowerPoint output must contain stable named Office objects and speaker notes. Layered architecture is
native shapes, text, connectors, and individual icons. Complex flow remains a validated graphic until
its native-shape renderer is implemented; disclose this from `delivery-manifest.json`.

Inspect every screenshot. Automated checks cannot judge narrative quality, hierarchy, misleading
architecture, or whether an evidence visual supports the message. Fix JSON first; change shared CSS
or renderer code only for system-level defects, then run `npm test` and revalidate the example deck.

## 6. Review

- The title makes a claim rather than naming a topic.
- Every slide supports its documented takeaway.
- Factual claims have sources and unknowns remain explicit placeholders.
- Visual hierarchy is readable when the screenshot is scaled down.
- Fluent and Azure assets use exact local catalog paths.
- Diagram edges, labels, lanes, and boundaries match the stated system behavior.
- Color is not the only carrier of meaning.
- No generated slide depends on a CDN or network request.

## 7. Hand off

Report the editable PowerPoint first, then the generated HTML directory, PowerPoint and HTML previews,
one takeaway per slide, source gaps, unresolved placeholders, brand status, and editability exceptions.
The semantic deck and persisted scene remain the reproducible sources; PowerPoint supports executive
light edits without becoming the source used for AI regeneration.

Describe output as Fluent-aligned unless an authorized brand owner has approved it.
