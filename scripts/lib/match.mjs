// Finds listed authors and the subject in a venue's listing. Venue calendars
// are full of events that have nothing to do with this site, so a listing only
// gets through on an author's full name or on one of the phrases below.

const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Names shared with film directors, footballers and neighbours. A hit on one
// of these also needs a word from this list somewhere in the listing.
const CONTEXT = /\b(book|author|climate|econom|crisis|collapse|lecture|professor|ai|artificial intelligence|science|sustainab|energy|systems|in conversation)/i;

export function buildMatcher(authors) {
  const entries = authors.map((a) => ({
    id: a.id,
    name: a.name,
    needsContext: !!a.needsContext,
    res: [a.name, ...(a.aliases ?? [])].map((n) => new RegExp(`(?<![a-z])${escapeRe(fold(n))}(?![a-z])`)),
  }));
  return (title, description) => {
    const t = fold(title);
    const d = fold(description);
    const hits = [];
    for (const e of entries) {
      const inTitle = e.res.some((r) => r.test(t));
      const inDesc = !inTitle && e.res.some((r) => r.test(d));
      if (!inTitle && !inDesc) continue;
      if (e.needsContext && !CONTEXT.test(`${t} ${d}`)) continue;
      hits.push({ id: e.id, name: e.name, where: inTitle ? "title" : "description" });
    }
    return hits;
  };
}

// The subjects this site follows. The list is kept narrow: "collapse" and
// "systems" alone match crypto meetups and dance classes.
export const TOPICS = [
  ["metacrisis", /\bmeta-?crisis\b/i],
  ["polycrisis", /\bpoly-?crisis\b/i],
  ["permacrisis", /\bperma-?crisis\b/i],
  ["existential risk", /\bexistential risks?\b|\bx-risks?\b|\bextinction risk\b/i],
  ["AI risk", /\bai (?:safety|alignment|doom|existential|governance)\b|\bsuperintelligence\b/i],
  ["collapse", /\b(?:civili[sz]ational|societal|climate|ecological) collapse\b|\bcollapse of (?:civili[sz]ation|complex societies)\b/i],
  ["nuclear risk", /\bnuclear (?:war|risk|winter|annihilation)\b/i],
  ["systems thinking", /\bsystems? (?:thinking|change|dynamics)\b/i],
  ["limits to growth", /\blimits to growth\b|\bdegrowth\b|\bpost-?growth\b|\bplanetary boundaries\b|\bdoughnut economics\b/i],
  ["civilizational risk", /\bcivili[sz]ational (?:risk|crisis|change|transition)\b|\bglobal catastroph/i],
];

// A topic in a description only counts at an event built around an argument.
// A topic in the title counts anywhere.
const TALK = /\b(book (?:talk|launch|event|club)|author|in conversation|lecture|keynote|panel|reading|discussion|salon|symposium|forum|talk with|fireside)\b/i;

export function findTopic(title, description) {
  for (const [label, re] of TOPICS) if (re.test(title ?? "")) return { label, where: "title" };
  if (!TALK.test(`${title ?? ""} ${description ?? ""}`)) return null;
  for (const [label, re] of TOPICS) if (re.test(description ?? "")) return { label, where: "description" };
  return null;
}
