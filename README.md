# Salesforce Logo and Icon Library

An internal reference gallery of web-ready Salesforce brand logos and product icons — browsable by humans and queryable by AI models via an embedded JSON manifest.

> **⚠️ Unofficial Resource.** This library is not affiliated with, endorsed by, or an official publication of Salesforce, Inc. All logos, icons, and trademarks are the property of Salesforce, Inc. and its subsidiaries. For official brand assets and usage guidelines, visit [salesforce.com/brand](https://www.salesforce.com/brand).

---

## Contents

| | Count |
|---|---|
| Brand logos (Salesforce, MuleSoft, Slack, Tableau, Informatica) | 22 variants |
| Salesforce 2D product icons | 90 icons × 5 variants each |
| Total files | 942 (471 PNG + 471 SVG) |
| Formats | RGB web-ready only |

## Viewing the Gallery

Open `index.html` in any browser. The gallery includes:

- Visual card grid with PNG and SVG download buttons
- Filter bar by brand and background type
- **`{ } View Manifest`** button — displays, copies, or downloads the full JSON manifest

## AI Usage

The gallery embeds a structured JSON manifest (`<script id="logo-manifest" type="application/json">`) designed for programmatic and AI consumption. Every asset includes:

- `type` — `logo`, `icon-mark`, or `co-brand`
- `category` — `AI`, `CRM`, `Platform`, `Data`, `Industries`, `Marketing`, `Service`, `Security`
- `keywords` — semantic search terms per asset
- `product_description` — one-sentence description of the Salesforce product
- `use_cases` — recommended design contexts (e.g. "slide header", "icon grid")
- `background` — `light` or `dark` placement requirement
- `co_branded` — boolean flag for Salesforce endorsement lockups
- `_ai_instructions` — guidance block on how to traverse and query the manifest

### Querying the manifest

```js
const data = JSON.parse(document.getElementById('logo-manifest').textContent);
const aiIcons = data.brands
  .find(b => b.id === 'product-icons').logos
  .filter(l => l.category === 'AI');
```

Or download `salesforce-logo-icon-manifest.json` directly from the **View Manifest** button.

## Asset Structure

```
index.html
Icons/
  extracted/
    Agentforce-2D-Product-Icon/   ← 10 files per icon (5 variants × PNG + SVG)
    Data-Cloud-2D-Product-Icon/
    ...
Informatica/
Mulesoft/
Original/
  Logo Assets for Upload/
    Cloud Logo RGB/
    Horizontal Logo RGB/
Slack/
Tableau/
```

## Deploying to GitHub Pages

1. Push this repository to GitHub (must be public for free Pages)
2. Go to **Settings → Pages → Source: Deploy from a branch → `main` → `/ (root)`**
3. The gallery will be live at `https://[username].github.io/[repo-name]/`

## Trademark Notice

All Salesforce logos and product icons are trademarks of Salesforce, Inc. Use of these assets must comply with [Salesforce Brand Guidelines](https://www.salesforce.com/brand). This repository does not grant any rights to use Salesforce trademarks beyond what is permitted by those guidelines.
