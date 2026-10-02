const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/*  Page UI                                                            */
/* ------------------------------------------------------------------ */

document.getElementById("year").textContent = new Date().getFullYear();

const loader = document.getElementById("loader");
let loaded = false;
function finishLoading() {
  if (loaded) return;
  loaded = true;
  loader.classList.add("done");
  document.body.classList.add("loaded");
}
setTimeout(finishLoading, 3500); // never trap people behind the loader

// Nav background once scrolled
const nav = document.querySelector(".nav");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

// Reveal on scroll
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.15 },
);
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 0.08}s`;
  io.observe(el);
});

// 3D tilt cards with moving glare
if (!reduceMotion) {
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    const max = el.classList.contains("tilt") ? 12 : 8;
    el.addEventListener("pointerenter", () => {
      el.style.transitionDelay = "0s";
      el.style.transition = "transform 0.15s ease-out, opacity 1s ease, border-color 0.3s";
    });
    el.addEventListener("pointermove", (ev) => {
      const r = el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      const y = (ev.clientY - r.top) / r.height;
      el.style.transform = `rotateY(${(x - 0.5) * max * 2}deg) rotateX(${(0.5 - y) * max * 2}deg) translateZ(10px)`;
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.transition = "";
      el.style.transform = "";
    });
  });
}

// Cursor glow
const glow = document.querySelector(".cursor-glow");
window.addEventListener(
  "pointermove",
  (e) => {
    glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    glow.classList.add("on");
  },
  { passive: true },
);

// Size picker
const sizeButtons = document.querySelectorAll(".sizes button");
sizeButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    sizeButtons.forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-checked", String(b === btn));
    });
  }),
);

// Email capture. Set data-endpoint on the form (e.g. a Formspree / Mailchimp URL)
// to actually send sign-ups somewhere; without it the form only confirms locally.
const form = document.getElementById("joinForm");
const msg = document.getElementById("joinMsg");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = form.email;
  const value = input.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  input.setAttribute("aria-invalid", String(!valid));
  if (!valid) {
    msg.textContent = "That email doesn't look right. Try again.";
    return;
  }
  const endpoint = form.dataset.endpoint;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error(res.statusText);
    } catch {
      msg.textContent = "Something went wrong. Please try again in a moment.";
      return;
    }
  }
  form.reset();
  msg.textContent = "You're on the list. Your aura has been noted. ✦";
});

/* ------------------------------------------------------------------ */
/*  3D stage (loaded separately so the page still works without it)   */
/* ------------------------------------------------------------------ */

import("./scene.js")
  .then((m) => m.start({ onReady: finishLoading, reduceMotion }))
  .catch((err) => {
    console.warn("3D stage unavailable:", err);
    document.body.classList.add("no-webgl");
    finishLoading();
  });
