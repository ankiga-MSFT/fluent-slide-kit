# Native PowerPoint architecture

## Product contract

The semantic deck JSON is the authoring source. It compiles into one fixed `1920x1080` scene. HTML and
PowerPoint consume that scene independently; PowerPoint is never produced by converting arbitrary HTML.

```text
business brief + evidence
        |
        v
semantic deck / diagram JSON
        |
        v
renderer-neutral scene (pixels, roles, stable ids)
        |----------------------|
        v                      v
standalone HTML          native PowerPoint
        |                      |
        v                      v
Edge validation          Open XML + Office validation
```

PowerPoint coordinates use a `144 scene pixels = 1 inch` conversion. Type uses `2 scene pixels = 1 point`.
This maps the `1920x1080` scene exactly to PowerPoint's `13.333x7.5` wide layout.

## Editability

| Scene content | PowerPoint representation |
|---|---|
| Titles, body, captions, metrics | Native text boxes |
| Cards, bands, rails, boundaries | Native shapes |
| Simple architecture connectors | Native lines with arrowheads |
| Layered architecture | Native shapes, text, connectors, and individual icons |
| Complex flow diagram | Validated `1600x720` PNG graphic in the current implementation |
| Fluent and Azure assets | Individual image objects |
| Sources and takeaway | Speaker notes; the visible footer is limited to Microsoft Confidential |

A slide is never exported as one full-slide screenshot. `tools/validate-pptx.mjs` rejects that pattern.
Complex flow is the only deliberate graphic fallback; `delivery-manifest.json` identifies it as
`validated-graphic`.

## Identity and future revision

Every Office object is named:

```text
fluent-slide-kit:<slide-id>:<element-id>
```

Layered diagram children extend the element id, for example:

```text
fluent-slide-kit:layered-template:diagram-component-front-door
```

This Selection Pane identity is the contract for a future PowerPoint task-pane add-in. A revision request
can target managed objects without attempting to understand arbitrary user-created slides.

PowerPoint supports light final edits. The current implementation intentionally does not import arbitrary
Office edits back into semantic JSON. Regeneration remains deterministic and source-driven. A future add-in
should submit the selected slide id, managed object ids, natural-language instruction, and evidence delta to
an authenticated revision service, then replace only the affected managed objects.

## Brand profiles

Profiles under `design/brand-profiles/` define fonts, type roles, colors, brand status, and asset policy.
The bundled profile is `aligned-not-certified`: it follows public Fluent guidance but does not establish
Microsoft brand approval.

An organization may add an `approved-internal` profile only after a brand owner supplies and approves the
fonts, palette, logo rules, and permitted product artwork. The profile does not grant trademark rights by
itself. An approved `.potx` ingestion layer remains separate future work because PptxGenJS cannot preserve
an arbitrary template's masters and custom XML with full fidelity.

## Validation

HTML validation checks schema, content budgets, assets, clipping, overlap, accessibility, diagram metrics,
and browser screenshots.

PowerPoint validation checks:

- expected slide count;
- native shape and picture structure;
- stable scene-derived object names;
- scene element coverage;
- speaker notes and takeaway;
- rejection of screenshot-only slides;
- optional desktop PowerPoint rendering at `1920x1080`;
- nonblank preview pixel sampling.

Desktop rendering refuses to start while an interactive PowerPoint process is open. This avoids attaching
to and closing a user's presentation. Structural validation does not require Office.

## Generated imagery

Generated images may be used for hero photography, conceptual illustration, or editorial backgrounds.
Store them under `assets/generated/` with `kind: image` and `provenance: ai-generated`.

Do not generate whole slides, logos, Microsoft product icons, text, charts, architecture diagrams, or
workflows as images. Those elements must remain structured, grounded, accessible, and editable.

## Dependency boundary

PptxGenJS 4.0.1 is pinned. Its `image-size` dependency has denial-of-service advisories for untrusted
ICNS/JXL/HEIF inputs. The deck schema and validators restrict the kit to local SVG/PNG/JPEG presentation assets,
so those parsers are outside the accepted input path. Do not broaden image formats without revisiting the
advisory and adding resource limits.
