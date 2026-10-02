# Aura Studioz

> Clothes for whom reek of aura.

The 3D website for **Aura Studioz**, a streetwear brand built on self-expression, individuality and the power of style.

## What's inside

- **3D hero**: the real AS monogram from the logo, extruded into 3D with Three.js. Orbit rings circle it and an ember particle "aura" swirls around it. Bloom lighting adds the glow. It follows the cursor and lifts away as you scroll.
- **The Drop**: the Aura Zip (mustard waffle-knit), shown on a 3D tilt card with a moving glare, plus specs and a size picker.
- **Manifesto**: three pillars (Self-Expression, Individuality, The Power of Style) on tilt cards.
- **Lookbook**: the Las Vegas shot of the Aura Zip.
- **Join the Aura**: an email sign-up for drop access.

It is a static site with no build step: plain HTML, CSS and ES modules, with Three.js loaded from a CDN. If WebGL or the CDN is unavailable, the page still works and shows a CSS glow in place of the 3D scene. It respects `prefers-reduced-motion`.

## Run locally

```bash
npx serve .        # or: python3 -m http.server
```

Then open the printed URL. ES modules need a local server, so opening `index.html` straight from the file system won't work.

## Deploy

Any static host works: GitHub Pages, Netlify, Vercel or Cloudflare Pages. Point it at the repo root.

## Hooking up the email list

The sign-up form doesn't send anywhere yet. Add a `data-endpoint` attribute to the form in `index.html` with a URL that accepts JSON `POST { "email": "..." }`, for example Formspree or a Mailchimp/Klaviyo proxy:

```html
<form class="join-form" id="joinForm" data-endpoint="https://formspree.io/f/XXXXXXX" novalidate>
```

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page markup and content |
| `styles.css` | Visual design, layout and responsive rules |
| `main.js` | UI behavior (reveals, tilt cards, form) and loader for the 3D scene |
| `scene.js` | Three.js scene: extruded logo, rings, particles, bloom |
| `assets/` | Logo cut-outs and product and lookbook photos |
