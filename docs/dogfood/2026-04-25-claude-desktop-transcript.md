# Salesforce brand assets — chat export

**Date:** 2026-04-25
**Manifest version referenced:** 2026-03-13 (sf-logos)
**Disclaimer:** The `sf-logos` manifest is an unofficial internal reference, not affiliated with or endorsed by Salesforce, Inc. Trademarks belong to Salesforce, Inc.

---

## 1. What Salesforce-related brand assets are accessible?

Six brand groupings via the `sf-logos` MCP server.

| Brand id | Display name | Asset count |
|----------|--------------|-------------|
| `salesforce` | Salesforce | 5 |
| `mulesoft` | MuleSoft | 3 |
| `slack` | Slack | 5 |
| `tableau` | Tableau | 6 |
| `informatica` | Informatica | 3 |
| `product-icons` | Salesforce Product Icons | 90 |

Asset metadata per logo: `variant` (e.g. Knockout), `background` (light/dark), `co_branded` flag, `preferred_format` (SVG preferred), aspect ratio.

Product icons span eight categories: AI, CRM, Platform, Data, Industries, Marketing, Service, Security.

**Color tooling alongside logos:**

- **Brand palettes** per `brand_id`. Salesforce: `primary #0176d3`, `navy #032d60`, `cloud #1b96ff`, `white #ffffff`. Each other brand has its own.
- **Semantic UI role palette** — 23 swatches mapped to roles like `primary`, `hover`, `pressed`, `focus-ring`, `success`, `warning`, `error`, `mulesoft-primary`, plus a neutral ramp. Use for UI states, not for logo recoloring.

**Companion skills consuming these assets:**

- `salesforce-branded-presentation` — slide catalog and layout patterns aligned to the Salesforce Corporate Presentation FY27 (compliance reference: `Salesforce_Corporate_Presentation_FY27_2026-03-05.pdf`).
- `sf-architecture-diagrams` — produces .drawio XML for Lucid/draw.io/Confluence using the same logo set.

---

## 2. Data Cloud icon

The asset is named **Data 360** in the manifest — Data Cloud was rebranded to Data 360 in the FY27 cycle. Same icon, current name. ID: `icon-data-cloud`.

- Variant: Full Color, light background
- Category: Data
- Aspect ratio: 1:1 (64×64 intrinsic, 641×641 source)
- SVG: <https://dam.usefulto.me/Icons/extracted/Data-Cloud-2D-Product-Icon/Data-Cloud-2D-Product-Icon-Full-Color-RGB.svg>
- PNG: <https://dam.usefulto.me/Icons/extracted/Data-Cloud-2D-Product-Icon/Data-Cloud-2D-Product-Icon-Full-Color-RGB.png>

Recommendation: if the deck still says "Data Cloud" verbatim, swap to "Data 360" — mixing the old and new names in one artifact reads as stale.

---

## 3. Slack logo for dark slide headers

The manifest has no standalone Slack-only knockout. Every dark-background Slack asset is a "Slack from Salesforce" co-branded lockup.

| Asset id | Variant | Best for | URL |
|----------|---------|----------|-----|
| `slack-from-sf-inverse` | Inverse | Slack Aubergine `#4a154b` or other deep purple backgrounds | <https://dam.usefulto.me/Slack/SLA-Slack-from-Salesforce-logo-inverse.svg> |
| `slack-from-sf-white` | White | Any other dark surface (navy, black, charcoal, gradient) | <https://dam.usefulto.me/Slack/SLA-Slack-From-Salesforce-Logo-WHITE.svg> |

Both are 400:143 aspect (≈2.80:1). Size by width and let height follow.

**Recommendation:** White variant for most dark-header use. Reach for Inverse only when the slide is actually purple.

**Gap:** the standalone multicolor Slack mark exists only for **light** backgrounds (square 1:1, `slack-standalone`). For a standalone Slack mark on dark, options are: park it on a small white card inside the dark header, or accept the co-branded lockup. There is no sanctioned standalone knockout in this asset set.

---

## 4. Tableau Analytics slide header — inline preview

Built as an inline visual via the visualizer (light background, navy accent). Assets used:

- `tab-standalone` (Tableau primary mark, 1:1, light bg) — <https://dam.usefulto.me/Tableau/Tableau.svg>
- `icon-salesforce-discover` (Einstein Discovery — the analytics-tagged icon that doesn't double-brand against the Tableau wordmark) — <https://dam.usefulto.me/Icons/extracted/Salesforce-Discover-2D-Product-Icon/Salesforce-Discover-2D-Product-Icon-Full-Color-RGB.svg>

**Layout decisions:**

- Title text "Analytics" added in Salesforce navy `#032D60`. Without a center title, the band is two icons separated by void.
- Bottom rule in Salesforce navy, not Tableau blue. Reasoning: Salesforce-branded deck consuming a Tableau asset, not a Tableau-branded deck. Navy keeps it rooted in the SF FY27 corporate palette.
- Discover chosen over the Tableau product icon to avoid double-branding alongside the Tableau wordmark.
- 72px asset boxes, balanced because both assets are 1:1.

---

## 5. Tableau Analytics PPTX — section divider

Generated as `tableau_analytics_divider.pptx` (file shipped alongside this export).

**Specs:**

- Custom layout 20.00" × 11.25" (FY27 official 16:9)
- White background
- Tableau wordmark: 2.25" square, x=1.5", y=4.5" (vertically centered)
- Title "Analytics": Avant Garde Demi SFDC, 88pt, navy `#032D60`, centered in a 12"-wide box
- Salesforce Discover icon: 2.25" square, x=16.25", y=4.5" (mirrored)
- Bottom rule: 0.06" navy strip, full bleed (intentionally thin — reads as brand seal, not banner)

**Intentional deviations from a strict reading of the FY27 brand spec:**

1. Title color is navy, not Tableau Orange `#FF6B00` (the FY27 product accent for Tableau). Matched the inline preview rather than the product-deep-dive title-color rule. Swap to `FF6B00` if the divider is leading into a Tableau-themed section.
2. No Salesforce wordmark in the top-right corner. FY27 light content slides usually carry it; section dividers are usually dark navy where this convention doesn't apply.

### Build code (`build_slide.js`)

```javascript
// Tableau Analytics — FY27 section-divider slide
// Spec: Salesforce Corporate Presentation FY27, 20" × 11.25" (16:9), light slide

const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.author = 'Tito';
pres.company = 'Salesforce';
pres.title = 'Tableau Analytics — Section Divider';

// FY27 official dimensions: 20.00" × 11.25"
pres.defineLayout({ name: 'SF_FY27', width: 20.0, height: 11.25 });
pres.layout = 'SF_FY27';

const slide = pres.addSlide();

// Light slide background — FY27 spec for content/divider on the light side of the sandwich
slide.background = { color: 'FFFFFF' };

// ---- Tableau wordmark (left) ----
slide.addImage({
  path: path.resolve(__dirname, 'tableau.png'),
  x: 1.5,
  y: 4.5,
  w: 2.25,
  h: 2.25,
  altText: 'Tableau logo',
});

// ---- Section title "Analytics" (center) ----
slide.addText('Analytics', {
  x: 4.0,
  y: 4.5,
  w: 12.0,
  h: 2.25,
  fontFace: 'Avant Garde Demi SFDC',
  fontSize: 88,
  bold: true,
  color: '032D60',
  align: 'center',
  valign: 'middle',
  margin: 0,
});

// ---- Salesforce Discover icon — right ----
slide.addImage({
  path: path.resolve(__dirname, 'discover.png'),
  x: 16.25,
  y: 4.5,
  w: 2.25,
  h: 2.25,
  altText: 'Analytics icon (Salesforce Discover)',
});

// ---- Bottom navy rule ----
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0,
  y: 11.07,
  w: 20.0,
  h: 0.06,
  fill: { color: '032D60' },
  line: { type: 'none' },
});

pres.writeFile({ fileName: 'tableau_analytics_divider.pptx' })
  .then((file) => console.log('Wrote:', file));
```

**Asset prep:** PNGs were rasterized from the manifest SVGs at 1024² with transparent alpha using `sharp`. SVG would render in M365 but PNG is more robust across PowerPoint versions.

**QA performed:** `extract-text` confirmed only "Analytics" appears as text content, no placeholder leakage. LibreOffice render of the slide is in `tableau_slide_render.jpg`. Note: the title renders as a fallback bold sans because Avant Garde Demi SFDC isn't installed in the build environment — on a Mac with the SF font set installed it'll resolve correctly.

---

## 6. MuleSoft logo dimensions at 300px wide

Three assets, very different proportions:

| Asset id | Type | Source dims | Aspect | At 300px wide |
|----------|------|-------------|--------|---------------|
| `ms-standalone` | Square mark, light bg | 255×253 | 1.0079 | **300 × 298 px** |
| `ms-from-sf-color` | "MuleSoft from Salesforce" lockup, light bg | 468×157 | 2.9809 | **300 × 101 px** |
| `ms-from-sf-ko` | Same lockup, dark bg knockout | 468×157 | 2.9809 | **300 × 101 px** |

**Consideration:** "MuleSoft logo" most often resolves to the standalone square mark. If placing it next to other vendor wordmarks in a row, 300×298 will dwarf them (typical wordmarks sit ~80–120px tall). In that case use the lockup at 300×101, or scale the standalone down to ~100px.

URLs:

- Standalone: <https://dam.usefulto.me/Mulesoft/Mulesoft.svg>
- Co-brand color: <https://dam.usefulto.me/Mulesoft/MuleSoft-From-Salesforce-Logo-RGB.svg>
- Co-brand knockout: <https://dam.usefulto.me/Mulesoft/MuleSoft-From-Salesforce-Logo-RGB-KO.svg>

---

## 7. Agentforce icon

Single match in the manifest — generic Agentforce mark (category: AI). No separate icons for Agentforce Sales/Service/Field Service/IT Service/HR Service/Contact Center; per FY27 those share the parent mark and differentiate via accent color (Sales = teal `#06A59A`, Service family = crimson rose `#D4145A`).

- ID: `icon-agentforce`
- Aspect: 1:1 (641×640 source, 64×64 intrinsic)
- SVG: <https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.svg>
- PNG: <https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.png>

Saved as `Agentforce-2D-Product-Icon.svg` in this export bundle.

To download directly to Desktop from a terminal:

```sh
curl -o ~/Desktop/Agentforce-2D-Product-Icon.svg \
  "https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.svg"
```

---

## 8. Acme Corp logo

Not in the manifest. The `sf-logos` library only carries Salesforce, MuleSoft, Slack, Tableau, Informatica, and the 90 product icons. No third-party customer or generic placeholder logos.

---

## 9. Caption color under a Salesforce logo

Per the FY27 type spec, captions and footers have an explicit color: **`#9E9E9E`** (Dark Gray) on a light slide. Salesforce Sans regular at 12–16pt.

**Variants:**

- Caption doing more work than a label (one-line tagline, attribution that needs to read at distance) → step up to **`#59575C`** (Charcoal). FY27 calls this "secondary body text."
- Dark navy `#032D60` slide → FY27 doesn't define a caption-specific color. White Salesforce Sans at 12–16pt reads as caption because of the size/weight. If pure white is too loud, **`#90D0FE`** (Light Sky) gives a quietly brand-tinted alternative.

**Avoid:** Salesforce blue `#0176d3` or navy `#032D60` for caption text under the logo — competes with the mark above.

---

## Files in this export

| File | Purpose |
|------|---------|
| `chat-export-2026-04-25.md` | This document |
| `tableau_analytics_divider.pptx` | Generated FY27 section-divider slide |
| `tableau_slide_render.jpg` | Visual render of the slide (LibreOffice PDF→JPG; on Mac with SF fonts the title renders correctly as Avant Garde Demi SFDC) |
| `Agentforce-2D-Product-Icon.svg` | Downloaded Agentforce mark |

## References

- Salesforce Corporate Presentation FY27 (compliance ref): `Salesforce_Corporate_Presentation_FY27_2026-03-05.pdf`
- `sf-logos` manifest disclaimer: unofficial internal reference, not affiliated with or endorsed by Salesforce, Inc.
- Asset DAM root: <https://dam.usefulto.me/>
- pptxgenjs: <https://gitbrent.github.io/PptxGenJS/>
