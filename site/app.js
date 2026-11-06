// Authors in Town: three views over files rebuilt every morning.
//   Dates    one threaded list by day, New York first, with a strip of dates
//   Map      New York, or everywhere the authors are going
//   Authors  the directory, by subject
// A tap opens a line in place; links between views open the same thing in the
// other view.
//
// Everything in the data comes from outside websites, so every string that
// reaches innerHTML goes through esc(), and every link through safeUrl().

const TZ = "America/New_York";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function safeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u, location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- Dates (always New York) ----------
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const longDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const stampFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortStamp = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });

const todayKey = () => dayKeyFmt.format(new Date());
const noon = (k) => new Date(k + "T12:00:00Z");
const keyPlus = (k, n) => new Date(noon(k).getTime() + n * 86400000).toISOString().slice(0, 10);
const longDay = (k) => longDayFmt.format(noon(k));
const shortDay = (k) => shortDayFmt.format(noon(k));
const timeLabel = (iso) => timeFmt.format(new Date(iso)).replace(":00", "");
const timeShown = (e) => (e.allDay ? "" : timeLabel(e.start));
const dayRange = (e) => (e.endDay ? `${longDay(e.day)} to ${longDay(e.endDay)}` : longDay(e.day));

// ---------- Data ----------
let DATA = { events: [], sources: [], fetchedAt: null };
let AUTHORS = [];
let EVENTS = [];
let UNREADABLE = [];
const authorById = new Map();
const eventById = new Map();
const datesByAuthor = new Map();

const REGIONS = [
  { id: "nyc", label: "New York", color: "#c2531b", test: (e) => e.region === "nyc" && e.via !== "topic" },
  { id: "near", label: "Near New York", color: "#e3a63f", test: (e) => e.region === "near" },
  { id: "topic", label: "On the subject", color: "#2f7d6b", test: (e) => e.via === "topic" },
  { id: "elsewhere", label: "Elsewhere", color: "#5b7a99", test: (e) => e.region === "elsewhere" },
  { id: "online", label: "Online", color: "#8b7aa8", test: (e) => e.region === "online" && e.via !== "topic" },
  { id: "unknown", label: "Place not given", color: "#a8a39a", test: (e) => e.region === "unknown" && e.via !== "topic" },
];
const regionOf = (e) => REGIONS.find((r) => r.test(e)) ?? REGIONS.at(-1);

const CLUSTERS = [
  { id: "metacrisis", label: "Metacrisis and meaning", color: "#c2531b" },
  { id: "polycrisis", label: "Polycrisis and collapse", color: "#a3361f" },
  { id: "xrisk", label: "Existential risk and AI", color: "#5b4b8a" },
  { id: "systems", label: "Systems and complexity", color: "#2f7d6b" },
  { id: "economy", label: "Economy and power", color: "#b8860b" },
  { id: "planet", label: "Climate and the planet", color: "#3f7a3a" },
  { id: "culture", label: "Culture, story and belonging", color: "#9c4f7a" },
];
const clusterById = new Map(CLUSTERS.map((c) => [c.id, c]));

// ---------- State (mirrored in the URL hash) ----------
const VIEWS = ["events", "map", "authors"];
const here = (path) => new URL(path, import.meta.url).href;
const shareLink = (id) => `${here("./")}#event=${id}`;
const state = { view: "events", eq: "", region: "nyc", author: "", event: "", aq: "", cluster: "", open: "", map: "nyc" };
const KEYS = ["eq", "region", "author", "event", "aq", "cluster", "open", "map"];
const DEFAULTS = { region: "nyc", map: "nyc" };

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.view = VIEWS.includes(p.get("view")) ? p.get("view") : "events";
  for (const k of KEYS) state[k] = p.get(k) ?? DEFAULTS[k] ?? "";
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.view !== "events") p.set("view", state.view);
  for (const k of KEYS) if (state[k] && state[k] !== DEFAULTS[k]) p.set(k, state[k]);
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
}
const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

// ---------- Masthead ----------
function renderMasthead() {
  const v = state.view;
  const nyc = EVENTS.filter(REGIONS[0].test).length;
  const a = state.author && authorById.get(state.author);
  $("#headline").textContent = v === "authors" ? "The authors" : v === "map" ? "Where they'll be" : a ? a.name : state.region === "nyc" ? "Authors in New York" : (REGIONS.find((r) => r.id === state.region)?.label ?? "Authors in Town");
  $("#subline").textContent =
    v === "authors"
      ? `${AUTHORS.length} writers · ${AUTHORS.filter((x) => x.feeds?.length).length} with a page we read`
      : v === "map"
        ? `${nyc} New York date${nyc === 1 ? "" : "s"} · ${EVENTS.length} in all`
        : `${nyc} New York date${nyc === 1 ? "" : "s"} · updated every morning`;
}

// ---------- Dates ----------
function eventPasses(e, { ignoreRegion = false } = {}) {
  if (state.author) {
    if (!e.authorIds.includes(state.author)) return false;
  } else if (!ignoreRegion && regionOf(e).id !== state.region) return false;
  const w = words(state.eq);
  return !w.length || w.every((t) => e._text.includes(t));
}

function renderEvents() {
  const searched = EVENTS.filter((e) => eventPasses(e, { ignoreRegion: true }));
  const counts = new Map();
  for (const e of searched) counts.set(regionOf(e).id, (counts.get(regionOf(e).id) ?? 0) + 1);
  $("#region-chips").innerHTML = REGIONS.filter((r) => r.id === "nyc" || counts.get(r.id))
    .map((r) => `<button class="chip" data-region="${r.id}" aria-pressed="${!state.author && state.region === r.id}" style="--c:${r.color}"><span class="sw"></span>${esc(r.label)} <span class="n">${counts.get(r.id) ?? 0}</span></button>`)
    .join("");

  const a = state.author && authorById.get(state.author);
  $("#filter-note").hidden = !a;
  $("#filter-note").innerHTML = a ? `Only ${esc(a.name)}, everywhere · <button data-clear-author>Show all</button>` : "";

  const list = searched.filter((e) => eventPasses(e));
  const byDay = new Map();
  for (const e of list) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  const t = todayKey();
  $("#date-strip").innerHTML = [...byDay]
    .map(([k, evs]) => `<button class="ds-day${k === t ? " today" : ""}" data-day="${k}"><span class="m">${esc(monthFmt.format(noon(k)))}</span><span class="d">${Number(k.slice(8))}</span><span class="c">${evs.length}</span></button>`)
    .join("");
  if (!list.length) {
    $("#thread").innerHTML = emptyEvents(counts);
    return;
  }
  let html = "";
  for (const [k, evs] of byDay) {
    const label = k === t ? `<span class="today">Today</span> · ${esc(shortDay(k))}` : k === keyPlus(t, 1) ? `Tomorrow · ${esc(shortDay(k))}` : esc(longDay(k));
    html += `<section class="sec day" id="d-${k}" data-day="${k}"><h2 class="sec-head"><span>${label}</span><span class="n">${evs.length}</span></h2><div class="card">${evs.map(eventRow).join("")}</div></section>`;
  }
  if (state.region === "nyc" && !state.author && !state.eq) {
    html += `<div class="nudge"><span>${counts.get("near") ?? 0} near New York, ${counts.get("elsewhere") ?? 0} elsewhere. An author in Princeton this week may have a free evening.</span><button class="pill-btn small" data-region-go="${counts.get("near") ? "near" : "elsewhere"}">See them</button></div>`;
  }
  $("#thread").innerHTML = html;
  trackScroll(true);
}

function emptyEvents(counts) {
  if (state.eq) return `<p class="empty">No match. Try fewer words.</p>`;
  if (state.author) return `<div class="empty-card"><p>No dates found for this author yet. New York venues that name them are checked every morning.</p></div>`;
  return `<div class="empty-card"><p>Nothing listed here right now. Subscribe and new dates reach you when they appear.</p><button class="pill-btn small" data-region-go="${counts.get("elsewhere") ? "elsewhere" : "nyc"}">See the other dates</button></div>`;
}

const hasPeople = (e) => e.authors?.length > 0;
function eventRow(e) {
  const meta = [e.place, e.venue && e.venue !== e.place ? e.venue : null].filter(Boolean).join(" · ");
  const open = state.event === e.id;
  const fresh = e.firstSeen?.slice(0, 10) > DATA.baseline && Date.now() - Date.parse(e.firstSeen) < 7 * 86400000;
  const r = regionOf(e);
  const tag = e.match === "listing" ? `<span class="tag">Named in listing</span>` : e.via === "topic" ? `<span class="tag">${esc(e.topic)}</span>` : "";
  return `<article class="item ev${open ? " open" : ""}" id="e-${esc(e.id)}" data-id="${esc(e.id)}">
    <button class="item-row" aria-expanded="${open}">
      <span class="t"><span class="sw" style="--c:${r.color}"></span>${esc(timeShown(e))}</span>
      <span><span class="item-name">${hasPeople(e) ? esc(e.authors.join(", ")) : esc(e.title)}${tag}${fresh ? `<span class="tag new">New</span>` : ""}${hasPeople(e) ? `<span class="title">${esc(e.title)}</span>` : ""}</span>${meta ? `<span class="item-meta">${esc(meta)}</span>` : ""}</span>
    </button>
    <div class="item-more"${open ? "" : " hidden"}>${open ? eventDetail(e) : ""}</div>
  </article>`;
}

const TRUST = {
  site: "From the author's own site.",
  title: "The host lists them by name.",
  listing: "The listing mentions them, which may not mean they are appearing. Check before you go.",
  topic: "On the subject. No author from this list is named.",
};

function gcalDate(iso, allDay, plus = 0) {
  if (allDay) return keyPlus(dayKeyFmt.format(new Date(iso)), plus).replace(/-/g, "");
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
const endOf = (e) => e.end ?? new Date(Date.parse(e.start) + 3600000).toISOString();
const eventName = (e) => (hasPeople(e) ? `${e.authors.join(", ")}: ${e.title}` : e.title);
const whereText = (e) => [e.place, e.venue && e.venue !== e.place ? e.venue : null].filter(Boolean).join(", ");
function googleLink(e) {
  const dates = e.allDay ? `${e.day.replace(/-/g, "")}/${keyPlus(e.endDay ?? e.day, 1).replace(/-/g, "")}` : `${gcalDate(e.start)}/${gcalDate(endOf(e))}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: eventName(e), dates, details: `${e.url ?? ""}\n\nFrom ${shareLink(e.id)}`, location: whereText(e), ctz: TZ });
  return "https://calendar.google.com/calendar/render?" + p;
}
function icsFor(e) {
  const f = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dear Crisis//Authors in Town//EN", "BEGIN:VEVENT",
    `UID:${e.id}@authors.dearcrisis.com`, `DTSTAMP:${gcalDate(new Date().toISOString())}`,
    e.allDay ? `DTSTART;VALUE=DATE:${e.day.replace(/-/g, "")}` : `DTSTART:${gcalDate(e.start)}`,
    e.allDay ? `DTEND;VALUE=DATE:${keyPlus(e.endDay ?? e.day, 1).replace(/-/g, "")}` : `DTEND:${gcalDate(endOf(e))}`,
    `SUMMARY:${f(eventName(e))}`, `LOCATION:${f(whereText(e))}`, e.url ? `URL:${e.url}` : "",
    `DESCRIPTION:${f((e.url ?? "") + "\n\n" + (e.description ?? ""))}`, "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function eventDetail(e) {
  const url = safeUrl(e.url);
  const when = e.allDay ? (e.timeText ? `${dayRange(e)}, ${e.timeText} local time` : dayRange(e)) : `${dayRange(e)}, ${timeLabel(e.start)}${e.end && dayKeyFmt.format(new Date(e.end)) === e.day ? ` to ${timeLabel(e.end)}` : ""}`;
  const where = whereText(e);
  const who = (e.authorIds ?? []).map((id) => authorById.get(id)).filter(Boolean);
  return `
    <div class="facts">
      <span><b>When</b> ${esc(when)}</span>
      ${where ? `<span><b>Where</b> ${esc(where)}</span>` : ""}
      ${who.length ? `<span><b>Who</b> ${who.map((a) => `<button class="inline-link" data-show-author="${esc(a.id)}">${esc(a.name)}</button>`).join(", ")}</span>` : ""}
    </div>
    ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ""}
    <div class="links">
      ${url ? `<a class="pill-btn" href="${esc(url)}" target="_blank" rel="noopener">Details ↗</a>` : ""}
      <a class="pill-btn ghost" href="${esc(googleLink(e))}" target="_blank" rel="noopener">Google Cal</a>
      <button class="pill-btn ghost" data-ics="${esc(e.id)}">.ics</button>
      ${Number.isFinite(e.lat) ? `<button class="pill-btn ghost" data-map-event="${esc(e.id)}">Map</button>` : ""}
      <button class="pill-btn ghost" data-share="${esc(e.id)}">Share</button>
    </div>
    <p class="note">${esc(TRUST[e.match] ?? "")}${e.yearInferred ? " The page gives no year, so this reads as the next time that date comes round." : ""} Via ${esc(e.sourceLabel)}.</p>`;
}

function toggleEvent(id, { scroll = false } = {}) {
  state.event = state.event === id && !scroll ? "" : id;
  writeHash();
  for (const art of $$("#thread .ev.open, #e-" + CSS.escape(id))) {
    const on = art.dataset.id === state.event;
    art.classList.toggle("open", on);
    $(".item-row", art).setAttribute("aria-expanded", String(on));
    const more = $(".item-more", art);
    more.hidden = !on;
    more.innerHTML = on ? eventDetail(eventById.get(art.dataset.id)) : "";
  }
  if (scroll && state.event) document.getElementById("e-" + id)?.scrollIntoView({ block: "center" });
}

// The search, chips and date strip are pinned under the top bar (.ev-bar).
// Their height feeds --evbar, which places the sticky day headings.
function pinEventBar() {
  const bar = $("#ev-bar");
  if (!bar) return;
  const root = document.documentElement;
  const measure = () => {
    const h = bar.offsetHeight;
    if (h) root.style.setProperty("--evbar", `${h}px`);
    else root.style.removeProperty("--evbar");
  };
  new ResizeObserver(measure).observe(bar);
  measure();
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      bar.classList.toggle("stuck", bar.offsetHeight > 0 && bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0);
      trackScroll();
    });
  }, { passive: true });
}

// The date strip marks the day at the top of the list.
let focusDay = null;
function trackScroll(force = false) {
  if (state.view !== "events") return;
  const line = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 100) + 4;
  let current = null;
  for (const sec of $$("#thread .day")) {
    if (sec.getBoundingClientRect().bottom > line) {
      current = sec.dataset.day;
      break;
    }
  }
  if (!current || (current === focusDay && !force)) return;
  focusDay = current;
  for (const b of $$(".ds-day")) {
    const on = b.dataset.day === current;
    b.classList.toggle("focus", on);
    if (on) {
      const strip = b.parentElement;
      strip.scrollTo({ left: b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2, behavior: force ? "auto" : "smooth" });
    }
  }
}

// ---------- Map ----------
let map = null;
let layer = null;
const markers = new Map();
const NYC_BOUNDS = [[40.48, -74.28], [40.93, -73.68]];
const WORLD_BOUNDS = [[-40, -125], [62, 150]];

function initMap() {
  if (map || !window.L) return;
  map = L.map("map", { zoomSnap: 0.5, scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on("popupopen", (ev) => {
    ev.popup.getElement()?.querySelector("[data-open-event]")?.addEventListener("click", (b) => openEvent(b.currentTarget.dataset.openEvent));
  });
  $("#legend").innerHTML = REGIONS.filter((r) => r.id !== "online" && r.id !== "unknown").map((r) => `<span><span class="sw" style="--c:${r.color}"></span>${esc(r.label)}</span>`).join("");
}

function spread(items) {
  const groups = new Map();
  for (const it of items) {
    const k = it.lat.toFixed(3) + "," + it.lng.toFixed(3);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  for (const g of groups.values())
    if (g.length > 1)
      g.forEach((it, i) => {
        const r = 0.0007 * Math.sqrt(i + 1);
        it.lat += r * Math.sin(i * 2.4);
        it.lng += r * Math.cos(i * 2.4) * 1.27;
      });
  return items;
}

let mapFocus = null;
function renderMap() {
  initMap();
  if (!map) return;
  for (const b of $$("#map-mode button")) b.setAttribute("aria-pressed", String(b.dataset.mode === state.map));
  layer.clearLayers();
  markers.clear();
  const inNyc = (e) => e.region === "nyc" || e.region === "near";
  const list = EVENTS.filter((e) => Number.isFinite(e.lat) && (state.map === "world" || inNyc(e) || e.id === mapFocus));
  const pins = spread(list.map((e) => ({ e, lat: e.lat, lng: e.lng })));
  for (const { e, lat, lng } of pins) {
    const m = L.circleMarker([lat, lng], { radius: 8, color: "#ffffff", weight: 2, fillColor: regionOf(e).color, fillOpacity: 1 })
      .bindPopup(`<span class="pt">${esc(hasPeople(e) ? e.authors.join(", ") : e.title)}</span><span class="pm">${esc(shortDay(e.day))} · ${esc(e.place ?? "")}</span><button class="pill-btn small" data-open-event="${esc(e.id)}">Open</button>`)
      .addTo(layer);
    markers.set(e.id, m);
  }
  $("#map-count").textContent = `${pins.length} date${pins.length === 1 ? "" : "s"} on the map`;
  setTimeout(() => {
    map.invalidateSize();
    const m = mapFocus && markers.get(mapFocus);
    if (m) {
      map.setView(m.getLatLng(), state.map === "world" ? 5 : 14);
      m.openPopup();
    } else map.fitBounds(state.map === "world" ? WORLD_BOUNDS : NYC_BOUNDS, { padding: [6, 6] });
    mapFocus = null;
  }, 0);
}

function openEvent(id) {
  const e = eventById.get(id);
  if (!e) return;
  Object.assign(state, { eq: "", author: "", region: regionOf(e).id, event: id });
  $("#e-search").value = "";
  setView("events");
  toggleEvent(id, { scroll: true });
}

// ---------- Authors ----------
function authorPasses(a, { ignoreCluster = false } = {}) {
  if (!ignoreCluster && state.cluster && a.cluster !== state.cluster) return false;
  const w = words(state.aq);
  return !w.length || w.every((t) => a._text.includes(t));
}

function renderAuthors() {
  const searched = AUTHORS.filter((a) => authorPasses(a, { ignoreCluster: true }));
  const counts = new Map();
  for (const a of searched) counts.set(a.cluster, (counts.get(a.cluster) ?? 0) + 1);
  $("#cluster-chips").innerHTML =
    `<button class="chip" data-cluster="" aria-pressed="${!state.cluster}">All <span class="n">${searched.length}</span></button>` +
    CLUSTERS.filter((c) => counts.get(c.id))
      .map((c) => `<button class="chip" data-cluster="${c.id}" aria-pressed="${state.cluster === c.id}" style="--c:${c.color}"><span class="sw"></span>${esc(c.label)} <span class="n">${counts.get(c.id)}</span></button>`)
      .join("");
  const list = searched.filter((a) => authorPasses(a));
  if (!list.length) {
    $("#author-list").innerHTML = `<p class="empty">No match. Try fewer words.</p>`;
    return;
  }
  let html = "";
  for (const c of CLUSTERS) {
    const rows = list.filter((a) => a.cluster === c.id);
    if (!rows.length) continue;
    html += `<section class="sec"><h2 class="sec-head"><span>${esc(c.label)}</span><span class="n">${rows.length}</span></h2><div class="card">${rows.map(authorRow).join("")}</div></section>`;
  }
  $("#author-list").innerHTML = html;
}

function authorBadge(a) {
  const dates = datesByAuthor.get(a.id) ?? [];
  const nyc = dates.filter((e) => e.region === "nyc").length;
  if (nyc) return `${nyc} in NYC`;
  return dates.length ? `${dates.length} date${dates.length === 1 ? "" : "s"}` : "";
}

function authorRow(a) {
  const open = state.open === a.id;
  const color = clusterById.get(a.cluster)?.color ?? "#232320";
  return `<article class="item${open ? " open" : ""}" id="a-${esc(a.id)}" data-id="${esc(a.id)}">
    <button class="item-row" aria-expanded="${open}">
      <span class="dot" style="--c:${color}"></span>
      <span><span class="item-name">${esc(a.name)}</span><span class="item-sub">${esc(a.what)}</span>${a.nyc ? `<span class="item-meta">${esc(a.nyc)}</span>` : ""}</span>
      <span class="badge">${esc(authorBadge(a))}</span>
    </button>
    <div class="item-more"${open ? "" : " hidden"}>${open ? authorDetail(a) : ""}</div>
  </article>`;
}

function authorDetail(a) {
  const dates = datesByAuthor.get(a.id) ?? [];
  const site = safeUrl(a.site);
  const page = safeUrl(a.eventsPage);
  const changed = DATA.pages?.[a.id]?.changedAt;
  const read = a.feeds?.length ? "Their own page is read every morning, and New York venues are checked for their name." : "No events page we can read, so this relies on New York venues and co-authors naming them.";
  return `
    <p class="bio">${esc(a.what)}</p>
    <p class="item-meta">${esc(read)}${changed ? ` Their events page last changed ${esc(shortStamp.format(new Date(changed)))}.` : ""}</p>
    <div class="links">
      ${dates.length ? `<button class="pill-btn" data-author-dates="${esc(a.id)}">${dates.length} date${dates.length === 1 ? "" : "s"}</button>` : ""}
      ${site ? `<a class="pill-btn${dates.length ? " ghost" : ""}" href="${esc(site)}" target="_blank" rel="noopener">Website ↗</a>` : ""}
      ${page && page !== site ? `<a class="pill-btn ghost" href="${esc(page)}" target="_blank" rel="noopener">Events page ↗</a>` : ""}
    </div>`;
}

function toggleAuthor(id, { scroll = false } = {}) {
  state.open = state.open === id && !scroll ? "" : id;
  writeHash();
  for (const art of $$("#author-list .item")) {
    const on = art.dataset.id === state.open;
    art.classList.toggle("open", on);
    $(".item-row", art).setAttribute("aria-expanded", String(on));
    const more = $(".item-more", art);
    more.hidden = !on;
    more.innerHTML = on ? authorDetail(authorById.get(art.dataset.id)) : "";
  }
  if (scroll && state.open) document.getElementById("a-" + id)?.scrollIntoView({ block: "center" });
}

// ---------- Views ----------
function setView(v) {
  state.view = v;
  for (const t of $$(".view-tab")) t.setAttribute("aria-selected", String(t.dataset.view === v));
  for (const name of VIEWS) $("#view-" + name).hidden = name !== v;
  writeHash();
  renderMasthead();
  if (v === "authors") renderAuthors();
  else if (v === "events") renderEvents();
  else renderMap();
}

// ---------- Footer ----------
function renderSources() {
  const authors = DATA.sources.filter((s) => s.kind === "author");
  const venues = DATA.sources.filter((s) => s.kind === "venue");
  // A source read from a home connection is fine while its last read holds.
  const fresh = (s) => s.ok || (s.homeOnly && s.lastGood);
  const failed = DATA.sources.filter((s) => !fresh(s));
  const fromHome = DATA.sources.filter((s) => !s.ok && fresh(s));
  const items = [
    `<li>Author pages: ${authors.filter(fresh).length} of ${authors.length}</li>`,
    `<li>New York calendars: ${venues.filter(fresh).length} of ${venues.length}</li>`,
    ...fromHome.map((s) => `<li>${esc(s.label)}: read from a home connection ${esc(shortStamp.format(new Date(s.lastGood)))}</li>`),
    ...failed.map((s) => `<li class="bad">${esc(s.label)}: did not load${s.count ? ` (showing ${s.count} from ${esc(shortStamp.format(new Date(s.lastGood)))})` : " today"}</li>`),
  ];
  if (DATA.fetchedAt) items.push(`<li>Updated ${esc(stampFmt.format(new Date(DATA.fetchedAt)))}</li>`);
  $("#sources").innerHTML = items.join("");
  $("#hand-list").innerHTML = UNREADABLE.map((u) => `<li><a href="${esc(safeUrl(u.url) ?? "#")}" target="_blank" rel="noopener">${esc(u.name)}</a></li>`).join("");
  $("#hand-intro").hidden = !UNREADABLE.length;
}

// ---------- Subscribe, add, copy ----------
function setupDialogs() {
  const sel = $("#sub-scope");
  const update = () => {
    const rss = here(`feeds/${sel.value}.xml`);
    const webcal = here(`authors-${sel.value}.ics`).replace(/^https?:/, "webcal:");
    $("#sub-rss").value = rss;
    $("#sub-webcal").href = webcal;
    $("#sub-google").href = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal);
  };
  sel.addEventListener("change", update);
  $("#sub-copy").addEventListener("click", () => copy($("#sub-rss").value, "RSS link copied"));
  $("#open-subscribe").addEventListener("click", () => {
    update();
    $("#subscribe-dialog").showModal();
  });
  for (const dlg of $$("dialog")) {
    dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
    $$("[data-close]", dlg).forEach((b) => b.addEventListener("click", () => dlg.close()));
  }
  const openAdd = () => $("#add-dialog").showModal();
  $("#open-add").addEventListener("click", openAdd);
  $("#foot-add").addEventListener("click", openAdd);
}
async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt("Copy this", text);
  }
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- Wiring ----------
function debounce(fn, ms = 160) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function wire() {
  for (const t of $$(".view-tab")) t.addEventListener("click", () => {
    setView(t.dataset.view);
    window.scrollTo({ top: 0 });
  });

  const refilter = () => {
    writeHash();
    renderMasthead();
    renderEvents();
    const list = $("#thread").getBoundingClientRect().top;
    const bar = $("#ev-bar").getBoundingClientRect().bottom;
    if (list < bar) window.scrollBy({ top: list - bar, behavior: "auto" });
  };
  $("#e-search").addEventListener("input", debounce((e) => {
    state.eq = e.target.value.trim();
    refilter();
  }));
  $("#region-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-region]");
    if (!b) return;
    Object.assign(state, { region: b.dataset.region, author: "" });
    refilter();
  });
  $("#filter-note").addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear-author]")) return;
    state.author = "";
    refilter();
  });
  $("#date-strip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (b) document.getElementById("d-" + b.dataset.day)?.scrollIntoView({ block: "start" });
  });
  $("#thread").addEventListener("click", (e) => {
    const go = e.target.closest("[data-region-go]");
    if (go) {
      Object.assign(state, { region: go.dataset.regionGo, author: "" });
      window.scrollTo({ top: 0 });
      return refilter();
    }
    const ics = e.target.closest("[data-ics]");
    if (ics) {
      const ev = eventById.get(ics.dataset.ics);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([icsFor(ev)], { type: "text/calendar" }));
      a.download = ev.title.replace(/[^\w]+/g, "-").slice(0, 50) + ".ics";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    const share = e.target.closest("[data-share]");
    if (share) return copy(shareLink(share.dataset.share), "Link copied");
    const m = e.target.closest("[data-map-event]");
    if (m) {
      const ev = eventById.get(m.dataset.mapEvent);
      mapFocus = ev.id;
      state.map = ev.region === "nyc" || ev.region === "near" ? "nyc" : "world";
      setView("map");
      return window.scrollTo({ top: 0 });
    }
    const who = e.target.closest("[data-show-author]");
    if (who) {
      Object.assign(state, { aq: "", cluster: "", open: who.dataset.showAuthor });
      $("#a-search").value = "";
      setView("authors");
      return toggleAuthor(who.dataset.showAuthor, { scroll: true });
    }
    const row = e.target.closest(".item-row");
    if (row) toggleEvent(row.closest(".item").dataset.id);
  });

  $("#map-mode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    state.map = b.dataset.mode;
    writeHash();
    renderMap();
  });

  $("#a-search").addEventListener("input", debounce((e) => {
    state.aq = e.target.value.trim();
    writeHash();
    renderAuthors();
  }));
  $("#cluster-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cluster]");
    if (!b) return;
    state.cluster = b.dataset.cluster;
    writeHash();
    renderAuthors();
  });
  $("#author-list").addEventListener("click", (e) => {
    const dates = e.target.closest("[data-author-dates]");
    if (dates) {
      Object.assign(state, { author: dates.dataset.authorDates, eq: "", event: "" });
      $("#e-search").value = "";
      setView("events");
      return window.scrollTo({ top: 0 });
    }
    const row = e.target.closest(".item-row");
    if (row) toggleAuthor(row.closest(".item").dataset.id);
  });

  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
    if (typing) {
      if (e.key === "Escape") document.activeElement.blur();
      return;
    }
    if (e.key === "/") {
      const box = state.view === "authors" ? $("#a-search") : state.view === "events" ? $("#e-search") : null;
      if (box) {
        e.preventDefault();
        box.focus();
      }
    }
  });

  window.addEventListener("hashchange", () => {
    const before = JSON.stringify(state);
    readHash();
    if (JSON.stringify(state) !== before) show();
  });
}

function show() {
  $("#e-search").value = state.eq;
  $("#a-search").value = state.aq;
  // A shared link names one event: open the list it belongs to.
  const shared = state.event && eventById.get(state.event);
  if (shared && !state.author) state.region = regionOf(shared).id;
  setView(state.view);
  if (state.view === "events" && shared) toggleEvent(state.event, { scroll: true });
  if (state.view === "authors" && state.open) toggleAuthor(state.open, { scroll: true });
}

// ---------- Boot ----------
async function boot() {
  const [ev, authors, unreadable] = await Promise.all(
    ["data/events.json", "data/authors.json", "data/unreadable.json"].map((u) =>
      fetch(here(u), { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  DATA = ev ?? DATA;
  DATA.sources ??= [];
  // Everything found on the very first run would otherwise read as new.
  DATA.baseline = (DATA.events ?? []).map((e) => e.firstSeen?.slice(0, 10)).filter(Boolean).sort()[0] ?? "";
  UNREADABLE = unreadable ?? [];
  AUTHORS = (authors ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const now = Date.now();
  const today = todayKey();
  EVENTS = (DATA.events ?? [])
    .filter((e) => (e.allDay ? (e.endDay ?? e.day) >= today : (e.end ? Date.parse(e.end) : Date.parse(e.start) + 2 * 3600000) > now))
    .sort((a, b) => a.day.localeCompare(b.day) || Date.parse(a.start) - Date.parse(b.start));
  for (const a of AUTHORS) {
    authorById.set(a.id, a);
    a._text = [a.name, a.what, a.nyc, ...(a.aliases ?? []), clusterById.get(a.cluster)?.label].join(" ").toLowerCase();
  }
  for (const e of EVENTS) {
    e._text = [e.title, e.place, e.venue, ...(e.authors ?? []), e.description, e.topic].join(" ").toLowerCase();
    eventById.set(e.id, e);
    for (const id of e.authorIds ?? []) {
      if (!datesByAuthor.has(id)) datesByAuthor.set(id, []);
      datesByAuthor.get(id).push(e);
    }
  }
  readHash();
  wire();
  pinEventBar();
  setupDialogs();
  renderSources();
  show();
}

boot();
