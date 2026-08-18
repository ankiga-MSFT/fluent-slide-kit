# Optional PowerPoint compatibility export

## Compatibility scope

The core product contract delivers standalone HTML and lossless `3840x2160` PNGs. The PowerPoint exporter is
retained as an optional maintainer utility and does not carry a whole-slide editability guarantee. The freeform
composition JSON remains the authoring source and compiles into one fixed `1920x1080` scene.

```text
business brief + evidence
        |
        v
composition JSON + optional diagram JSON
        |
        v
renderer-neutral scene (pixels, roles, stable ids)
        |
        v
standalone HTML -> lossless 3840x2160 PNG
        |
        +---- optional compatibility export -> PowerPoint
```

PowerPoint coordinates use a `144 scene pixels = 1 inch` conversion. Type uses `2 scene pixels = 1 point`.
This maps the `1920x1080` scene exactly to PowerPoint's `13.333x7.5` wide layout.

## Partial editability

| Scene content | PowerPoint representation |
|---|---|
| Titles, body, captions, metrics | Native text boxes |
| Cards, bands, rails, boundaries | Native shapes |
| Authored connectors | Native lines with arrowheads |
| Freeform architecture | Native shapes, text, connectors, and individual icons |
| Complex flow diagram | Validated `1600x720` PNG graphic in the current implementation |
| Fluent and Azure assets | Individual image objects |
| Sources and takeaway | Speaker notes; the visible footer is limited to Microsoft Confidential |

The optional exporter does not package a slide as one full-slide screenshot. However, complex flow diagrams
are single PNG graphics, so practical editability varies by slide. The default delivery manifest does not
advertise PowerPoint output.

## Identity and future revision

Every Office object is named:

```text
fluent-slide-kit:<slide-id>:<element-id>
```

This Selection Pane identity is retained for compatibility tooling and experimentation.

The current implementation intentionally does not import arbitrary Office edits back into composition JSON.
Regeneration remains deterministic and source-driven.

## Brand profiles

Profiles under `design/brand-profiles/` define fonts, type roles, colors, brand status, and asset policy.
The bundled profile is `aligned-not-certified`: it follows public Fluent guidance but does not establish
Microsoft brand approval.

An organization may add an `approved-internal` profile only after a brand owner supplies and approves the
fonts, palette, logo rules, and permitted product artwork. The profile does not grant trademark rights by
itself. Arbitrary `.potx` ingestion is outside the compatibility export's scope.

## Validation

HTML validation checks schema, content budgets, assets, clipping, overlap, accessibility, diagram metrics,
and browser screenshots.

When invoked explicitly, PowerPoint validation checks:

- expected slide count;
- native shape and picture structure;
- stable scene-derived object names;
- scene element coverage;
- speaker notes and takeaway;
- rejection of screenshot-only slides;
- optional desktop PowerPoint rendering at `3840x2160`;
- nonblank preview pixel sampling.

Native text, shapes, lines, and SVG media remain resolution-independent. Source PNG/JPEG assets are
embedded without downsampling. The only deliberate raster fallback, a complex flow diagram, is captured
at `3200x1440`. Package compression is lossless ZIP compression and does not reduce image quality.

Desktop rendering refuses to start while an interactive PowerPoint process is open. This avoids attaching
to and closing a user's presentation. Structural validation does not require Office.

## Generated imagery

Generated images may be used for hero photography, conceptual illustration, or editorial backgrounds.
Store them under `assets/generated/` with `kind: image` and `provenance: ai-generated`.

Do not generate whole slides, logos, Microsoft product icons, text, charts, architecture diagrams, or
workflows as images. Those elements must remain structured, grounded, and accessible.

## Dependency boundary

The optional exporter pins PptxGenJS 4.0.1. Its `image-size` dependency has denial-of-service advisories for untrusted
ICNS/JXL/HEIF inputs. The composition schema and validators restrict the kit to local SVG/PNG/JPEG presentation assets,
so those parsers are outside the accepted input path. Do not broaden image formats without revisiting the
advisory and adding resource limits.
