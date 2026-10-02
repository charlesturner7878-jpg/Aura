const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

$("#year").textContent = new Date().getFullYear();

/* ------------------------------------------------------------------ */
/*  Opening hours (single source of truth for badge, hours & booking) */
/* ------------------------------------------------------------------ */

// [open, close] in 24h hours, indexed by day (0 = Sunday). null = closed.
const HOURS = [[16, 21], null, [17, 22], [17, 22], [17, 22], [17, 23], [17, 23]];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtHour = (h) => {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const h12 = ((hr + 11) % 12) + 1;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${hr < 12 ? "AM" : "PM"}`;
};
const fmtTime = (h) => {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  return `${((hr + 11) % 12) + 1}:${String(min).padStart(2, "0")}`;
};

(function hoursUI() {
  const now = new Date();
  const day = now.getDay();
  const h = now.getHours() + now.getMinutes() / 60;
  const today = HOURS[day];
  const badge = $("#openBadge");
  const label = badge.querySelector("span");

  let nextDay = day;
  do nextDay = (nextDay + 1) % 7;
  while (!HOURS[nextDay]);

  if (today && h >= today[0] && h < today[1]) {
    label.textContent = `Open now · until ${fmtHour(today[1])}`;
  } else if (today && h < today[0]) {
    label.textContent = `Opens tonight at ${fmtHour(today[0])}`;
  } else {
    badge.classList.add("closed");
    label.textContent = `Closed · opens ${DAY_NAMES[nextDay]} ${fmtHour(HOURS[nextDay][0])}`;
  }

  const heroHours = $("#heroHours");
  if (today && h < today[1]) heroHours.textContent = `${fmtHour(today[0])} – ${fmtHour(today[1])}`;
  else {
    heroHours.previousElementSibling.textContent = nextDay === (day + 1) % 7 ? "Tomorrow" : DAY_NAMES[nextDay];
    heroHours.textContent = `${fmtHour(HOURS[nextDay][0])} – ${fmtHour(HOURS[nextDay][1])}`;
  }

  $$("#hoursList li").forEach((li) => {
    if (li.dataset.days.split(",").map(Number).includes(day)) li.classList.add("today");
  });
})();

/* ------------------------------------------------------------------ */
/*  Loader                                                             */
/* ------------------------------------------------------------------ */

const loader = $("#loader");
const loaderCount = $("#loaderCount");
const loadStart = performance.now();
let sceneReady = false;
let loaded = false;
let shown = 0;

function tickLoader(now) {
  if (loaded) return;
  // ease towards 90% on time alone, then to 100% once the 3D scene is ready
  const t = (now - loadStart) / 1400;
  const target = sceneReady ? 100 : Math.min(90, 90 * (1 - Math.pow(1 - clamp(t), 3)));
  shown += (target - shown) * (sceneReady ? 0.18 : 0.12);
  loaderCount.textContent = Math.round(shown);
  if (sceneReady && shown > 99.5 && now - loadStart > 900) finishLoading();
  else requestAnimationFrame(tickLoader);
}
requestAnimationFrame(tickLoader);

function finishLoading() {
  if (loaded) return;
  loaded = true;
  loaderCount.textContent = "100";
  loader.classList.add("done");
  document.body.classList.add("loaded");
}
// never trap anyone behind the loader
setTimeout(() => {
  sceneReady = true;
}, 5000);

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
/* ------------------------------------------------------------------ */

const nav = $("#nav");
const burger = $("#burger");
let lastY = window.scrollY;

function setMenu(open) {
  nav.classList.toggle("open", open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("locked", open);
}
burger.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
$$("#navLinks a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("open")) {
    setMenu(false);
    burger.focus();
  }
});

const navTargets = $$("#navLinks a[href^='#']:not(.nav-mobile-cta)")
  .map((a) => ({ a, el: $(a.getAttribute("href")) }))
  .filter((t) => t.el);

/* ------------------------------------------------------------------ */
/*  Reveals, word lighting, counters                                   */
/* ------------------------------------------------------------------ */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
      const count = e.target.querySelector("[data-count]");
      if (count) countUp(count);
    }
  },
  { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
);
$$(".reveal").forEach((el) => {
  const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
  el.style.transitionDelay = `${Math.min(siblings.indexOf(el), 4) * 0.08}s`;
  io.observe(el);
});

function countUp(el) {
  const end = Number(el.dataset.count);
  const suffix = el.dataset.suffix || "";
  if (reduceMotion) {
    el.textContent = end + suffix;
    return;
  }
  const t0 = performance.now();
  const dur = 1600;
  const step = (now) => {
    const t = clamp((now - t0) / dur);
    el.textContent = Math.round(end * (1 - Math.pow(1 - t, 4))) + (t === 1 ? suffix : "");
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const lede = $("[data-words]");
lede.setAttribute("aria-label", lede.textContent.trim().replace(/\s+/g, " "));
lede.innerHTML = lede.textContent
  .trim()
  .split(/\s+/)
  .map((w) => `<span class="w" aria-hidden="true">${w}</span>`)
  .join(" ");
const words = $$(".w", lede);

/* ------------------------------------------------------------------ */
/*  Scroll state shared with the 3D scene                              */
/* ------------------------------------------------------------------ */

const state = {
  hero: 0, // 0 → 1 while scrolling out of the hero
  story: 0, // 0 → 1 across the story section
  sig: 0, // continuous dish index across the signature steps
  sigIn: 0, // 0 → 1 as the signature section takes over
  active: true, // false once the stage is fully covered
  anchorX: 0.5, // hero slot centre in NDC, so the still life scrolls with the hero
  anchorY: 0,
  pointerX: 0,
  pointerY: 0,
};

const heroVisual = $("#heroVisual");
const story = $("#story");
const sigSection = $("#signatures");
const sigSteps = $$(".sig-step");
const menuSection = $("#menu");
const sigNum = $("#sigNum");
const sigBar = $("#sigBar");
let scene = null;
let activeDish = -1;

function onScroll() {
  const y = window.scrollY;
  const vh = window.innerHeight;

  nav.classList.toggle("scrolled", y > 30);
  if (!nav.classList.contains("open")) nav.classList.toggle("hidden", y > lastY && y > vh * 0.9);
  lastY = y;

  state.hero = clamp(y / vh);
  const ar = heroVisual.getBoundingClientRect();
  state.anchorX = ((ar.left + ar.width / 2) / window.innerWidth) * 2 - 1;
  state.anchorY = 1 - ((ar.top + ar.height / 2) / vh) * 2;

  const sr = story.getBoundingClientRect();
  state.story = clamp((vh - sr.top) / (sr.height + vh * 0.2));

  // light the story words as the paragraph travels through the viewport
  const lr = lede.getBoundingClientRect();
  const lit = clamp((vh * 0.85 - lr.top) / (lr.height + vh * 0.25));
  const n = Math.floor(lit * words.length * 1.05);
  words.forEach((w, i) => w.classList.toggle("lit", i < n));

  const gr = sigSection.getBoundingClientRect();
  state.sigIn = clamp((vh - gr.top) / vh);
  state.sig = clamp((vh * 0.5 - gr.top - vh * 0.5) / vh, 0, sigSteps.length - 1);
  const inSig = gr.top < vh * 0.5 && gr.bottom > vh * 0.5;
  document.body.classList.toggle("in-sig", inSig);

  const idx = Math.round(state.sig);
  if (idx !== activeDish) {
    activeDish = idx;
    sigSteps.forEach((s, i) => s.classList.toggle("active", i === idx));
    sigNum.textContent = String(idx + 1).padStart(2, "0");
    scene?.setDish(idx);
  }
  sigBar.style.transform = `scale${window.innerWidth <= 900 ? "X" : "Y"}(${(state.sig + 1) / sigSteps.length})`;

  // fade the stage as the solid sections roll over it, then stop rendering
  const mr = menuSection.getBoundingClientRect();
  state.active = mr.top > 0;
  const storyDim = window.innerWidth <= 900 ? 1 - 0.65 * clamp(state.story * 3) * (1 - state.sigIn) : 1;
  document.body.style.setProperty("--stage-opacity", (clamp(mr.top / vh + 0.15) * storyDim).toFixed(3));

  let current = null;
  for (const t of navTargets) if (t.el.getBoundingClientRect().top < vh * 0.4) current = t;
  navTargets.forEach((t) => t.a.classList.toggle("current", t === current));
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

window.addEventListener(
  "pointermove",
  (e) => {
    state.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    state.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  },
  { passive: true },
);

/* ------------------------------------------------------------------ */
/*  Menu tabs                                                          */
/* ------------------------------------------------------------------ */

const tabs = $$('[role="tab"]');
const ink = $(".tab-ink");
function moveInk(tab) {
  ink.style.width = `${tab.offsetWidth}px`;
  ink.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function selectTab(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = $(`#${t.getAttribute("aria-controls")}`);
    panel.hidden = !on;
    panel.classList.toggle("active", on);
  });
  moveInk(tab);
  if (focus) tab.focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (dir) selectTab(tabs[(i + dir + tabs.length) % tabs.length], true);
  });
});
const syncInk = () => moveInk($('[role="tab"][aria-selected="true"]'));
window.addEventListener("resize", syncInk);
document.fonts?.ready.then(syncInk);
syncInk();

/* ------------------------------------------------------------------ */
/*  Tilt cards & magnetic buttons                                      */
/* ------------------------------------------------------------------ */

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
if (!reduceMotion && finePointer) {
  $$("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (ev) => {
      const r = el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      const y = (ev.clientY - r.top) / r.height;
      el.style.transition = "transform 0.15s ease-out, border-color 0.4s";
      el.style.transform = `rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg) translateZ(0)`;
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.transition = "";
      el.style.transform = "";
    });
  });

  $$(".magnetic").forEach((el) => {
    el.addEventListener("pointermove", (ev) => {
      const r = el.getBoundingClientRect();
      const x = ev.clientX - r.left - r.width / 2;
      const y = ev.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}

/* ------------------------------------------------------------------ */
/*  Booking                                                            */
/* ------------------------------------------------------------------ */

const form = $("#bookingForm");
const dateInput = $("#date");
const slotsEl = $("#slots");
const slotHint = $("#slotHint");
const guestsOut = $("#guests");
const errorEl = $("#formError");
const MAX_GUESTS = 8;
let guests = 2;
let selectedTime = null;

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const today = new Date();
const maxDate = new Date(today);
maxDate.setDate(maxDate.getDate() + 30);
dateInput.min = iso(today);
dateInput.max = iso(maxDate);

// default to the next day with a seating still available
const first = new Date(today);
for (let i = 0; i < 8; i++) {
  const hrs = HOURS[first.getDay()];
  const lastSeating = hrs ? hrs[1] - 1.5 : -1;
  if (hrs && (i > 0 || today.getHours() + today.getMinutes() / 60 < lastSeating - 0.5)) break;
  first.setDate(first.getDate() + 1);
}
dateInput.value = iso(first);

// deterministic "availability" so the demo feels real without a backend
function isTaken(dateStr, time, size) {
  let h = 2166136261;
  for (const c of `${dateStr}|${time}|${size > 4 ? "L" : "S"}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100 < (size > 4 ? 45 : 28);
}

function renderSlots() {
  slotsEl.innerHTML = "";
  errorEl.textContent = "";
  const value = dateInput.value;
  if (!value) {
    slotHint.textContent = "Pick a date to see open tables.";
    return;
  }
  const d = parseISO(value);
  const hrs = HOURS[d.getDay()];
  if (!hrs) {
    selectedTime = null;
    slotHint.textContent = "We're closed on Mondays. The kitchen rests too.";
    return;
  }
  const isToday = iso(d) === iso(new Date());
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  let open = 0;
  for (let t = hrs[0]; t <= hrs[1] - 1.5; t += 0.5) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot";
    b.textContent = fmtTime(t);
    b.dataset.time = String(t);
    const past = isToday && t < nowH + 0.5;
    b.disabled = past || isTaken(value, t, guests);
    b.setAttribute("aria-pressed", String(!b.disabled && selectedTime === t));
    b.setAttribute("aria-label", `${fmtHour(t)}${b.disabled ? ", unavailable" : ""}`);
    if (!b.disabled) open++;
    slotsEl.append(b);
  }
  if (selectedTime !== null && !$(`.slot[aria-pressed="true"]`, slotsEl)) selectedTime = null;
  slotHint.textContent = open
    ? `${open} times available for ${guests} ${guests === 1 ? "guest" : "guests"}.`
    : "Fully booked. Try another date, or walk in for a seat at the bar.";
}

slotsEl.addEventListener("click", (e) => {
  const b = e.target.closest(".slot");
  if (!b || b.disabled) return;
  selectedTime = Number(b.dataset.time);
  $$(".slot", slotsEl).forEach((s) => s.setAttribute("aria-pressed", String(s === b)));
  errorEl.textContent = "";
});

$$(".stepper button").forEach((b) =>
  b.addEventListener("click", () => {
    guests = clamp(guests + Number(b.dataset.step), 1, MAX_GUESTS);
    guestsOut.textContent = guests;
    $$(".stepper button")[0].disabled = guests === 1;
    $$(".stepper button")[1].disabled = guests === MAX_GUESTS;
    renderSlots();
    if (guests === MAX_GUESTS) slotHint.textContent += " Larger party? Email us about the Cellar Room.";
  }),
);
dateInput.addEventListener("change", renderSlots);
renderSlots();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = { name: $("#name"), phone: $("#phone"), email: $("#bemail") };
  const checks = {
    name: fields.name.value.trim().length > 1,
    phone: fields.phone.value.replace(/\D/g, "").length >= 7,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim()),
  };
  for (const k in fields) fields[k].setAttribute("aria-invalid", String(!checks[k]));
  dateInput.setAttribute("aria-invalid", String(!dateInput.value));

  let msg = "";
  if (!dateInput.value) msg = "Choose a date for your visit.";
  else if (selectedTime === null) msg = "Choose a time for your table.";
  else if (!checks.name) msg = "Add the name for the reservation.";
  else if (!checks.phone) msg = "Add a phone number so we can reach you.";
  else if (!checks.email) msg = "That email doesn't look right.";
  errorEl.textContent = msg;
  if (msg) return;

  const data = {
    date: dateInput.value,
    time: fmtHour(selectedTime),
    guests,
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    email: fields.email.value.trim(),
    occasion: $("#occasion").value,
    seating: $("#seating").value,
    notes: $("#notes").value.trim(),
  };

  // Set data-endpoint on the form (Formspree, Zapier, your booking API…) to send requests somewhere.
  const endpoint = form.dataset.endpoint;
  const submit = form.querySelector('[type="submit"]');
  if (endpoint) {
    submit.disabled = true;
    submit.textContent = "Sending…";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(res.statusText);
    } catch {
      errorEl.textContent = "We couldn't send that just now. Please try again or call us.";
      return;
    } finally {
      submit.disabled = false;
      submit.textContent = "Request table";
    }
  }

  const d = parseISO(data.date);
  const when = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  $("#doneName").textContent = data.name.split(" ")[0];
  $("#doneSummary").textContent = `${data.guests} ${data.guests === 1 ? "guest" : "guests"} · ${when} · ${data.time}`;
  $("#doneEmail").textContent = data.email;
  $("#doneCode").textContent = `SW-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  form.hidden = true;
  const done = $("#bookingDone");
  done.hidden = false;
  done.focus();
});

$("#bookAgain").addEventListener("click", () => {
  form.reset();
  dateInput.value = iso(first);
  selectedTime = null;
  $$("[aria-invalid]", form).forEach((el) => el.removeAttribute("aria-invalid"));
  renderSlots();
  $("#bookingDone").hidden = true;
  form.hidden = false;
  dateInput.focus();
});

/* ------------------------------------------------------------------ */
/*  Newsletter                                                         */
/* ------------------------------------------------------------------ */

$("#newsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#newsEmail");
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
  input.setAttribute("aria-invalid", String(!ok));
  $("#newsMsg").textContent = ok
    ? "You're on the list. See you at the next wine dinner."
    : "That email doesn't look right.";
  if (ok) input.value = "";
});

/* ------------------------------------------------------------------ */
/*  3D stage (loaded separately so the page works without it)          */
/* ------------------------------------------------------------------ */

import("./scene.js")
  .then((m) => {
    scene = m.start({
      canvas: $("#stage"),
      state,
      reduceMotion,
      onReady: () => (sceneReady = true),
    });
    scene.setDish(Math.max(activeDish, 0));
  })
  .catch((err) => {
    console.warn("3D stage unavailable:", err);
    document.body.classList.add("no-webgl");
    sceneReady = true;
  });
