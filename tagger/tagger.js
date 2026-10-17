// PitchReel phone tagging page — the rules, with no screen in them (tested by tagger.test.mjs).
// A helper taps what happens at the pitch; each tap keeps only its kind, team ("us" / "them"), the phone's time and,
// for our goals, a shirt number. No names, ever. The file it sends is read by PitchReel on the Mac
// (engine/pitchreel_engine/helper_tags.py), which lines the taps up with the video on the kick-off.

export const FORMAT = "pitchreel-helper-tags";
export const VERSION = 1;

// the match's whistles, in order: the big button offers the next one
export const PHASES = ["kickoff", "half_time", "second_half", "full_time"];
export const PHASE_LABEL = { kickoff: "Kick-off", half_time: "Half-time", second_half: "2nd half kick-off",
  full_time: "Full time" };
// moments, for either team
export const MOMENTS = ["goal", "chance", "save", "corner", "free_kick", "penalty"];
export const LABEL = { ...PHASE_LABEL, goal: "Goal", chance: "Chance", save: "Save", corner: "Corner",
  free_kick: "Free kick", penalty: "Penalty", moment: "Great moment" };

function randomId(rand) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += a[Math.floor(rand() * a.length)];
  return s;
}

/** A new, empty match. `label` is the helper's own note, e.g. "v Rivals" (kept on the phone and in the file). */
export function newMatch(now, label = "", rand = Math.random) {
  return { id: randomId(rand), label: String(label).slice(0, 60), started: now, taps: [], next: 1 };
}

/** The whistle the big button offers now, or null once full time is in. */
export function nextPhase(match) {
  const done = new Set(match.taps.map((t) => t.kind));
  return PHASES.find((p) => !done.has(p)) ?? null;
}

/** Record a tap. Returns it. Moments need a side ("us" | "them"); whistles and "moment" have none. */
export function addTap(match, kind, side, now) {
  if (!(kind in LABEL)) throw new Error(`unknown kind ${kind}`);
  const moment = MOMENTS.includes(kind);
  if (moment && side !== "us" && side !== "them") throw new Error("a moment needs a team");
  const tap = { id: `t${match.next++}`, kind, side: moment ? side : null, at: Math.round(now) };
  match.taps.push(tap);
  return tap;
}

/** Take back the last tap (or the one named). Returns what was removed, or null. */
export function removeTap(match, id) {
  const i = id == null ? match.taps.length - 1 : match.taps.findIndex((t) => t.id === id);
  if (i < 0) return null;
  return match.taps.splice(i, 1)[0];
}

/** Our scorer's shirt number for a goal (null = not known). */
export function setNumber(match, id, n) {
  const t = match.taps.find((x) => x.id === id);
  if (!t || t.kind !== "goal") return false;
  if (n == null || n === "") { delete t.number; return true; }
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > 99) return false;
  t.number = v;
  return true;
}

/** The minute of the match a time falls in, from the helper's own whistles ("23'"); null before the kick-off. */
export function minute(match, at) {
  const at_ = (k) => match.taps.find((t) => t.kind === k)?.at;
  const ko = at_("kickoff"), ht = at_("half_time"), ko2 = at_("second_half");
  if (ko == null || at < ko) return null;
  if (ko2 != null && at >= ko2) {
    const first = ht != null ? Math.round((ht - ko) / 60000) : 0;
    return first + Math.floor((at - ko2) / 60000) + 1;
  }
  return Math.floor((at - ko) / 60000) + 1;
}

/** Goals so far, as the helper tapped them: {us, them}. */
export function score(match) {
  const g = { us: 0, them: 0 };
  for (const t of match.taps) if (t.kind === "goal") g[t.side] += 1;
  return g;
}

/** What is sent to the reel maker: the taps and nothing else. */
export function toFile(match) {
  return {
    format: FORMAT, version: VERSION,
    match: { id: match.id, label: match.label, started: match.started },
    taps: match.taps.map((t) => ({ id: t.id, kind: t.kind, side: t.side, at: t.at,
      ...(t.kind === "goal" && t.number != null ? { number: t.number } : {}) })),
  };
}

/** e.g. pitchreel-tags-2026-10-18-1002.json (the phone's own date and time of the match's start). */
export function fileName(match) {
  const d = new Date(match.started);
  const p = (n) => String(n).padStart(2, "0");
  return `pitchreel-tags-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** The squad's shirt numbers from what the helper typed ("1-11, 14, 23"): sorted, 0–99, no repeats. */
export function parseSquad(text) {
  const out = new Set();
  for (const part of String(text).split(/[\s,;]+/)) {
    const m = part.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] != null ? +m[2] : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && out.size < 100; n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** Keep the phone's saved state sane after a reload (an old or damaged copy never stops the page). */
export function restore(raw, now, rand = Math.random) {
  const fresh = { match: newMatch(now, "", rand), past: [], settings: { us: "Us", them: "Them", squad: [] } };
  try {
    const s = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!s || typeof s !== "object" || !s.match || !Array.isArray(s.match.taps)) return fresh;
    return { match: s.match, past: Array.isArray(s.past) ? s.past.slice(0, 10) : [],
      settings: { ...fresh.settings, ...(s.settings ?? {}) } };
  } catch { return fresh; }
}
