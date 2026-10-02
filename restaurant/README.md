# Saltwood: 3D restaurant demo site

A one-page website for a fictional wood-fire restaurant. A real-time 3D still life is the centerpiece: a speckled stoneware plate, a glass of red wine and rising embers. As you scroll, the camera moves through the scene and the plate is re-set course by course across four signature dishes.

Everything is built in code. There are no photos or 3D models to load, so it stays fast and has nothing to license.

## What's inside

| Section | What it does |
| --- | --- |
| **Loader** | A logo mark and a percentage counter that finishes when the 3D scene is ready (capped at 5 s). |
| **Hero** | An editorial headline next to the live 3D still life. The scene follows the cursor and drifts as you scroll. Facts strip with tonight's hours. |
| **Story** | The paragraph lights up word by word as you scroll. Chef quote and animated count-up stats. |
| **Signatures** | Four scroll steps. Each one swaps the dish on the plate (beet, scallop, wagyu, chocolate dome) with a "plating" drop-in animation and a progress rail. |
| **Menu** | Tabs for Tasting, À la carte and Drinks, with keyboard arrow support, dietary tags and prices. |
| **Rooms** | Three tilt cards (Hearth Counter, Dining Room, Cellar Room), each with a CSS-only illustration. |
| **Reviews** | Rating summary and guest quotes. They become a swipe carousel on mobile. |
| **Reserve** | A booking form: date (30-day window), guest stepper, time slots generated from the opening hours with realistic availability, validation and a confirmation screen. |
| **Visit** | A stylized map, today's hours highlighted, and contact links. |
| **Footer** | Newsletter sign-up, links and an oversized wordmark. |

There are also small touches: a live "Open now / Opens at…" badge driven by the real hours, a nav that hides on scroll, magnetic buttons, film grain, and JSON-LD `Restaurant` schema for SEO.

## Run locally

```bash
npx serve .        # or: python3 -m http.server
```

Then open the printed URL. ES modules need a server, so opening `index.html` directly from disk won't work.

Three.js (r160) is bundled in `vendor/`, so the site needs no CDN. Only Google Fonts loads from the network, and it falls back to system serif and sans fonts if that fails.

## Make it a real restaurant's site

- **Name, copy, prices, address:** all in `index.html`. The JSON-LD block in `<head>` also holds the name, address, phone and hours.
- **Opening hours:** the `HOURS` array at the top of `main.js` drives the open badge, the hero facts, the highlighted hours row and the booking time slots. Update the visible hours list in `index.html` to match.
- **Bookings:** add `data-endpoint="https://…"` to `<form id="bookingForm">` and requests are POSTed there as JSON (Formspree, Zapier, a Make webhook or your own API). Without it, the form only shows the confirmation. To use OpenTable, Resy or SevenRooms instead, swap the form for their widget.
- **Availability:** `isTaken()` in `main.js` fakes availability so the demo feels real. Remove it once bookings go to a real system.
- **Brand colors and fonts:** CSS variables at the top of `styles.css`.
- **Dishes:** each dish is a small function in `scene.js` (`beetDish`, `scallopDish`, `wagyuDish`, `chocolateDish`). Materials are listed in `makeMaterials()`.

## Accessibility & performance

- With `prefers-reduced-motion`, the camera, embers and animations are switched off and dish changes happen instantly.
- Semantic landmarks, a skip link, a keyboard-operable menu, tabs and stepper, ARIA live messages for form feedback, and visible focus rings.
- The 3D scene stops rendering once the solid sections cover it. On phones it lowers pixel ratio, shadow resolution and particle count.
- If WebGL is unavailable, the page shows a warm CSS glow in place of the scene and everything else still works.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Markup, content, SEO metadata |
| `styles.css` | Design tokens, layout, responsive rules |
| `main.js` | UI behavior, hours logic, booking, scroll state for the scene |
| `scene.js` | Three.js still life: plate, glass, dishes, embers, camera choreography |
| `vendor/` | Three.js r160 and the two addons it uses (MIT, see `THREE-LICENSE`) |

All names, people, reviews and contact details are placeholder content for the demo.
