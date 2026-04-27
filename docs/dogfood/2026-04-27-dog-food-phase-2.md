# sf-logos Thread Export
**Date:** 2026-04-27  
**Scope:** Full conversation including all tool calls and results

---

## Turn 1 — What Salesforce-related brand assets are accessible?

### Tool: sf-logos:list_brands
**Result:**
```json
{
  "brands": [
    {"id": "salesforce", "name": "Salesforce", "logo_count": 5},
    {"id": "mulesoft", "name": "MuleSoft", "logo_count": 3},
    {"id": "slack", "name": "Slack", "logo_count": 5},
    {"id": "tableau", "name": "Tableau", "logo_count": 6},
    {"id": "informatica", "name": "Informatica", "logo_count": 3},
    {"id": "product-icons", "name": "Salesforce Product Icons", "logo_count": 90}
  ],
  "manifest_version": "2026-03-13"
}
```

### Tool: sf-logos:find_brand_logo (brand: salesforce)
**Result:** 5 assets returned:
- `sf-horiz-color` — Horizontal Logo, Color, light bg, **preferred**
- `sf-cloud-color` — Cloud Mark, Color, light bg
- `sf-cloud-white` — Cloud Mark White, dark bg
- `sf-horiz-knockout` — Horizontal Logo Knockout, dark bg
- `sf-horiz-white` — Horizontal Logo White, dark bg

### Response summary
6 brands, 112 total assets. Standalone Slack dark-bg mark does not exist — only co-branded lockups available for dark surfaces.

---

## Turn 2 — Data Cloud icon

### Tool: sf-logos:find_product_icon (query: "Data Cloud")
**Top result:** `icon-data-cloud` — "Data 360" (formerly Data Cloud), category: Data, Full Color RGB, light bg, square 641×641px

### Tool: sf-logos:fetch_asset (id: icon-data-cloud, format: svg, mode: bytes)
**Result:** SVG bytes returned (base64), URL: `https://dam.usefulto.me/Icons/extracted/Data-Cloud-2D-Product-Icon/Data-Cloud-2D-Product-Icon-Full-Color-RGB.svg`

### Response summary
Rendered inline. Canonical name is **Data 360**. SVG and PNG available at dam.usefulto.me.

---

## Turn 3 — Slack logo for a dark slide

### Tool: sf-logos:find_brand_logo (brand: slack, background: dark)
**Result:** 2 assets, both co_branded: true. Advisory: `only_co_branded_for_requested_background`
- `slack-from-sf-inverse` — Inverse co-brand, Aubergine (#4a154b) bg
- `slack-from-sf-white` — White co-brand, any dark bg

### Tool: sf-logos:fetch_asset (id: slack-from-sf-inverse, format: svg, mode: bytes)
**Result:** SVG bytes returned, URL: `https://dam.usefulto.me/Slack/SLA-Slack-from-Salesforce-logo-inverse.svg`

### Tool: sf-logos:fetch_asset (id: slack-from-sf-white, format: svg, mode: bytes)
**Result:** SVG bytes returned, URL: `https://dam.usefulto.me/Slack/SLA-Slack-From-Salesforce-Logo-WHITE.svg`

### Response summary
Rendered both variants inline side-by-side. No standalone Slack mark exists for dark backgrounds — only co-branded lockups.

---

## Turn 4 — Salesforce blue

### Tool: sf-logos:get_brand_colors (brand_id: salesforce)
**Result:**
```json
{
  "colors": {
    "primary": "#0176d3",
    "navy": "#032d60",
    "cloud": "#1b96ff",
    "white": "#ffffff"
  }
}
```

### Response summary
4 palette colors. Primary / Salesforce Blue = `#0176d3`. Navy = `#032d60`. Cloud Blue = `#1b96ff`.

---

## Turn 5 — MuleSoft at 300px wide (pptxgenjs section divider)

### Tool: sf-logos:find_brand_logo (brand: mulesoft, preferred_only: true)
**Result:** `ms-standalone` — MuleSoft Logo, Standalone, light bg, **preferred**, aspect ratio 1.0079 (near square), SVG preferred

### Tool: sf-logos:find_brand_logo (brand: mulesoft)
**All 3 assets:**
- `ms-standalone` — Standalone, light bg, preferred, 255×253px, AR 1.0079
- `ms-from-sf-color` — MuleSoft from Salesforce, Color, light bg, 468×157px, AR 2.98
- `ms-from-sf-ko` — MuleSoft from Salesforce Knockout, dark bg, 468×157px, AR 2.98

### Tool: sf-logos:fetch_asset (id: ms-standalone, format: png, mode: path)
**Result:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/ms-standalone.png`

### Response summary
At 300px wide (3.13"): w=3.13", h=3.10". Provided pptxgenjs code snippet. Note: standalone is light-bg only — dark background requires co-brand KO variant or white card treatment.

---

## Turn 6 — Download the Agentforce icon to my Desktop

### Tool: sf-logos:find_product_icon (query: "Agentforce", limit: 1)
**Result:** `icon-agentforce` — Agentforce, AI category, Full Color RGB, light bg, 641×640px

### Tool: sf-logos:fetch_asset (id: icon-agentforce, format: png, mode: path)
**Result:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/icon-agentforce.png`

### Tool: Filesystem:move_file
- **source:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/icon-agentforce.png`
- **destination:** `/Users/tal.golan/Desktop/Agentforce-2D-Product-Icon-Full-Color-RGB.png`
- **result:** Success

### Response summary
File moved to Desktop. Note: move depletes the MCP cache; MCP will re-fetch from CDN on next use.

---

## Turn 7 — Agentforce icon (display only)

### Tool: sf-logos:fetch_asset (id: icon-agentforce, format: svg, mode: bytes)
**Result:** SVG bytes returned (base64), URL: `https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.svg`

### Response summary
Rendered inline. 641×640px, Full Color RGB. SVG and PNG URLs provided.

---

## Turn 8 — Caption color under a Salesforce logo

### Tool: sf-logos:get_color_roles (roles: ["caption-on-light", "caption-on-dark"])
**Result:**
```json
[
  {"name": "Neutral 60", "hex": "#939393", "roles": ["text-placeholder", "icon-subdued", "caption-on-light"]},
  {"name": "Cloud Blue 80", "hex": "#90D0FE", "roles": ["info-light", "caption-on-dark"]}
]
```

### Response summary
Light surface: `#939393` (Neutral 60). Dark surface: `#90D0FE` (Cloud Blue 80).

---

## Turn 9 — Download the Agentforce icon again

### Tool: sf-logos:fetch_asset (id: icon-agentforce, format: png, mode: path)
**Result:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/icon-agentforce.png` (re-fetched from CDN)

### Tool: Filesystem:move_file
- **source:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/icon-agentforce.png`
- **destination:** `/Users/tal.golan/Desktop/Agentforce-2D-Product-Icon-Full-Color-RGB.png`
- **result:** Success

---

## Turn 10 — Format preference — Tableau as SVG

### Tool: sf-logos:find_brand_logo (brand: tableau, preferred_only: true)
**Result:** `tab-standalone` — Tableau Logo, Standalone, light bg, **preferred**, square 347×347px, SVG preferred, URL: `https://dam.usefulto.me/Tableau/Tableau.svg`

### Tool: sf-logos:fetch_asset (id: tab-standalone, format: svg, mode: path)
**Result:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/tab-standalone.svg`

### Tool: Filesystem:move_file
- **source:** `/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/tab-standalone.svg`
- **destination:** `/Users/tal.golan/Desktop/Tableau.svg`
- **result:** Success

---

## Turn 11 — I need a Slack logo without co-branding for a dark slide

### Tool: sf-logos:find_brand_logo (brand: slack, co_branded: false)
**Result:** `slack-standalone` — Slack Logo, Standalone, light bg, **preferred**, square 212×212px. No dark-bg standalone exists.

### Response summary
Standalone Slack mark only exists for light backgrounds. No knockout/white standalone available. Options: (1) white card inset, (2) co-brand lockup, (3) source from slack.com/intl/en-gb/media-kit.

---

## Turn 12 — Caption color on navy (#032D60)

Answered from cache (no tool call needed): dark surface → **Cloud Blue 80 `#90D0FE`** (`caption-on-dark` role), already established in Turn 8.

---

## Turn 13 — Export this entire thread (this document)

### Tool: Filesystem:write_file
- **destination:** `/Users/tal.golan/Desktop/sf-logos-thread-export.md`

---

## Asset inventory — files written to Desktop this session

| File | ID | Format | Notes |
|---|---|---|---|
| `Agentforce-2D-Product-Icon-Full-Color-RGB.png` | `icon-agentforce` | PNG | Moved twice (turns 6 & 9) |
| `Tableau.svg` | `tab-standalone` | SVG | Moved turn 10 |
| `sf-logos-thread-export.md` | — | Markdown | This file |

## Color values referenced this session

| Name | Hex | Role |
|---|---|---|
| Salesforce Blue | `#0176d3` | Primary brand |
| Navy | `#032d60` | Dark bg |
| Cloud Blue | `#1b96ff` | Accent |
| Neutral 60 | `#939393` | caption-on-light |
| Cloud Blue 80 | `#90D0FE` | caption-on-dark |
| MuleSoft Orange | `#ff6627` | MuleSoft primary |
| Slack Aubergine | `#4a154b` | Slack primary |
| Tableau Blue | `#005f9e` | Tableau primary |
| Tableau Orange | `#e97627` | Tableau accent |
