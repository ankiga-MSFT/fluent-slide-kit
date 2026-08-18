# Fluent resource inventory

This inventory evaluates the official Fluent UI repository, Fluent UI React
Storybook, and Fluent 2 design site for use in this renderer-neutral presentation
toolkit. Inclusion means a resource improves offline HTML and lossless 4K PNG
output without introducing a React runtime or implying Microsoft brand
compliance.

## Decision rules

| Classification | Meaning |
| --- | --- |
| Bundle | Store a verified, attributed local data or asset snapshot. |
| Implement | Recreate the visual semantics with native scene primitives. |
| Guide | Add the principle or quality rule to authoring and validation guidance. |
| Reference | Link to the official resource, but do not redistribute it. |
| Exclude | It is interactive, web-only, duplicative, unstable, or unsuitable for redistribution. |

## Foundations

| Official resource | Available material | Decision | Toolkit use |
| --- | --- | --- | --- |
| Fluent UI React theme | Global and alias colors, light and dark themes, type styles, spacing, radii, stroke widths, and shadows | Bundled in `design/fluent-foundation.json` | Resolve consistent values in HTML and 4K PNG output without importing React or Griffel. |
| Fluent 2 color | Neutral, shared, brand, semantic, and interaction-state guidance | Bundle semantic values; guide usage | Keep semantic colors meaningful and keep brand color restrained. |
| Fluent 2 typography | Web type ramp, Segoe-first platform stack, casing, alignment, and contrast guidance | Bundle the ramp; guide usage | Map UI roles to presentation-safe roles while preserving sentence case and readable alignment. Do not redistribute fonts. |
| Fluent 2 layout | 4 px spacing system, complete spacing ramp, grid anatomy, alignment, and responsive techniques | Bundle spacing; guide layout | Use a stable spacing vocabulary and adapt hierarchy rather than copying responsive web layouts. |
| Fluent 2 shapes | Rectangle, circle, pill, and beak forms; radius and stroke scales | Bundle scales; implement selectively | Standardize cards, labels, people markers, tags, callouts, and connectors. |
| Fluent 2 elevation | Two-part shadow model and shadow levels 2, 4, 8, 16, 28, and 64 | Bundle supported levels; guide restraint | Map only renderer-supported shadows and use elevation to communicate hierarchy. |
| Fluent 2 motion | Duration, easing, transition, choreography, and reduced-motion guidance | Exclude | Slides are still frames; motion tokens, runtimes, animations, and transitions are outside the kit contract. |
| Fluent 2 material | Platform materials and translucency | Exclude from the default profile | Glass and platform material effects conflict with the offline, deterministic, restrained slide contract. |

## Visual assets

| Official resource | Available material | Decision | Toolkit use |
| --- | --- | --- | --- |
| Fluent System Icons | Regular and filled SVG icons in multiple sizes | Already bundled | Prefer Regular for supporting concepts and Filled for selected or emphasized states. Do not duplicate the existing catalog. |
| Fluent System Icons font | Resizable glyph font and metadata | Already bundled | Keep as a lookup aid; SVG remains the preferred rendering source. |
| Product launch icons | Microsoft product identity artwork | Reference only | Accept only user-supplied approved assets and preserve original color and proportions. |
| Approved external icons | Non-Azure, non-Fluent vendor product icons | Bundle selectively | Store only official vendor-owned SVGs under `assets/external-icons/`, pinned to immutable revisions with catalog, license, and trademark metadata. Never use third-party logo mirrors. |
| File type icons | Multicolor Microsoft file-format artwork | Reference only | Do not redistribute until explicit reuse terms and an approved source are verified. |
| Fluent Emoji and 3D emoji | Separate Figma and asset collections | Exclude by default | Emoji conflict with the executive presentation contract and add substantial asset bulk. |
| Fluent 2 site imagery and demos | Screenshots, diagrams, animations, and examples | Exclude | Treat as documentation, not a redistributable asset library. Do not scrape or bundle CDN media. |
| Figma UI kits | Fluent 2 design language, Core, Copilot, Labs, iconography, and accessibility kits | Reference only | Useful for human design inspection; unsuitable as an automated build dependency or bundled source. |
| Fonts | Segoe and platform-native font guidance | Reference only | Use installed fonts with declared fallbacks. Never redistribute font binaries from UI packages or sites. |

## Data visualization

| Official resource | Available material | Decision | Toolkit use |
| --- | --- | --- | --- |
| Fluent chart packages | Area, bar, donut, gauge, heat map, line, pie, Sankey, scatter, sparkline, and tree-map implementations | Exclude runtime; implement selected charts natively | Use the taxonomy and semantics, not React or D3 rendering code. Start with bar, line, area, donut, and KPI/gauge patterns. |
| Chart utilities | Data-visualization palettes, themes, legends, axes, annotations, and accessibility helpers | Palette bundled in `design/fluent-chart-foundation.json`; helpers remain reference-only | Provide categorical and semantic palette roles without a chart runtime. |
| Chart accessibility | Titles, descriptions, keyboard and screen-reader behavior, non-color cues | Guide and validate static equivalents | Require chart title, summary, series labels, source, alt text, and non-color differentiation where needed. |
| Interactive chart behavior | Hover cards, selection, keyboard traversal, animation, and responsive measurement | Exclude | Replace hover-only detail with visible labels, annotations, notes, or companion tables. |

## Native presentation patterns

The React components are a useful anatomy catalog, not a dependency catalog. The
following patterns transfer well to static slides when rebuilt from
scene primitives.

| Priority | Pattern | Fluent references | Native slide form |
| --- | --- | --- | --- |
| High | Status message | MessageBar, Badge, PresenceBadge | Icon, semantic tint, title, concise detail, optional action owner. |
| High | Person or owner | Avatar, AvatarGroup, Persona | Initials or approved image, name, role, and status marker. |
| High | Progress and KPI | ProgressBar, RatingDisplay | Determinate bar, milestone track, score, or compact KPI with explicit value. |
| High | Structured data | Table, DataGrid, List | Native rows, headers, emphasis, sorting cue only when meaningful, and accessible reading order. |
| High | Label and metadata | Tag, InteractionTag, CounterBadge | Compact rounded label with restrained semantic or neutral color. |
| Medium | Content summary | Card, CardHeader, CardFooter, Divider | Unnested content block; use cards only for repeated items or genuinely framed content. |
| Medium | Process state | Stepper-like composition from progress, badge, and divider anatomy | Native sequence with current, complete, blocked, and future states. |
| Medium | Comparison and choice | RadioGroup, Checkbox, SwatchPicker anatomy | Static decision matrix or option list, not simulated interactive controls. |
| Excluded | Loading placeholders | Skeleton, Spinner | Do not include loading states in static presentation output. |

The six high-priority patterns are implemented and browser validated in
`examples/static-patterns.json`. They are anatomy references for freeform composition,
not a template system or simulated UI component library.

Interactive shells such as accordion, carousel, combobox, dialog, drawer, menu,
popover, tabs, toast, toolbar, tooltip, and tree are excluded as toolkit
components. Their information architecture may inspire a static composition, but
their value depends on interaction that offline slide HTML and static PNGs do not support.

## Accessibility and content guidance

Add or retain these checks across authoring and validation:

- Maintain a logical heading hierarchy and a predictable left-to-right,
  top-to-bottom reading order for LTR slides.
- Require at least 4.5:1 contrast for standard text and 3:1 for large text and
  meaningful non-text graphics.
- Never rely on color alone for status, chart series, or decisions.
- Require descriptive alt text for informative images, icons, and diagrams.
- Keep language concise, plain, and descriptive.
- Avoid clipped text and preserve legibility when previews are scaled.
- Keep the complete message visible in one still frame; no content may depend on motion or interaction.

## Legal and distribution boundary

The `microsoft/fluentui` source repository is MIT licensed, but that does not
automatically grant redistribution rights for every font, product icon, image,
Figma file, sample media item, or externally referenced asset. Each bundled
resource needs its own verified source, license, version or commit, local path,
and modification note in `legal/provenance.json`.

The separate Microsoft Fabric asset license referenced by legacy Fluent asset
packages must be reviewed per asset class before redistribution. Until that review
is complete, treat branded icons, fonts, stock/sample imagery, and product artwork
as reference-only or user-supplied assets.

## Recommended implementation order

1. Extend validators for chart summaries, non-color cues, and pattern-specific
   text and contrast requirements.

## Official sources reviewed

- https://github.com/microsoft/fluentui
- https://storybooks.fluentui.dev/react/
- https://storybooks.fluentui.dev/react/index.json
- https://fluent2.microsoft.design/
- https://fluent2.microsoft.design/accessibility
- https://fluent2.microsoft.design/color
- https://fluent2.microsoft.design/elevation
- https://fluent2.microsoft.design/get-started/design
- https://fluent2.microsoft.design/get-started/develop
- https://fluent2.microsoft.design/iconography
- https://fluent2.microsoft.design/layout
- https://fluent2.microsoft.design/shapes
- https://fluent2.microsoft.design/typography