// PitchReel phone tagging page — the screen. The rules are in tagger.js; everything is kept on this phone
// (localStorage) until the helper sends the file.
import { LABEL, MOMENTS, PHASE_LABEL, addTap, fileName, minute, newMatch, nextPhase, parseSquad, removeTap, restore,
  score, setNumber, toFile } from "./tagger.js";

const KEY = "pitchreel-tagger-v1";
const $ = (id) => document.getElementById(id);
let state = restore(load(), Date.now());
let saved = true;
let pendingGoal = null;               // the goal waiting for its scorer's number

function load() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saved = true; } catch { saved = false; }
}

const HINTS = {
  kickoff: "Tap “Kick-off” when the referee starts the match — everything lines up on it.",
  half_time: "Tap “Half-time” on the whistle.",
  second_half: "Tap “2nd half kick-off” when the second half starts.",
  full_time: "Tap “Full time” on the final whistle.",
};

function side(t) {
  return t.side === "us" ? state.settings.us : t.side === "them" ? state.settings.them : "";
}

function render() {
  const m = state.match;
  const g = score(m);
  $("scoreline").textContent = `${state.settings.us} ${g.us} – ${g.them} ${state.settings.them}`;
  $("usName").textContent = state.settings.us;
  $("themName").textContent = state.settings.them;
  $("label").textContent = m.label || "PitchReel tags";
  const next = nextPhase(m);
  const phase = $("phase");
  phase.textContent = next ? PHASE_LABEL[next] : "Match over — send the taps";
  phase.dataset.kind = next ?? "";
  const hint = $("hint");
  const before = !m.taps.some((t) => t.kind === "kickoff") && m.taps.length > 0;
  hint.className = `hint${!saved || before ? " warn" : ""}`;
  hint.textContent = !saved ? "This phone isn’t keeping the taps (private browsing?) — keep this page open until you send them."
    : before ? "Tap “Kick-off” too (at the restart is fine) — the taps line up on it."
    : next ? HINTS[next] : "Match over. Send the taps when you’re ready.";
  tick();
  const list = $("taps");
  list.replaceChildren();
  if (!m.taps.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No taps yet.";
    list.append(li);
  }
  for (const t of [...m.taps].reverse()) {
    const li = document.createElement("li");
    const min = minute(m, t.at);
    li.innerHTML = `<span class="min"></span><span class="what"></span>`;
    li.querySelector(".min").textContent = min == null ? "–" : `${min}’`;
    li.querySelector(".what").textContent = `${LABEL[t.kind]}${t.side ? ` — ${side(t)}` : ""}`
      + (t.kind === "goal" && t.side === "us" ? (t.number != null ? ` · #${t.number}` : " · scorer?") : "");
    if (t.kind === "goal" && t.side === "us") {
      const b = document.createElement("button");
      b.textContent = "#";
      b.setAttribute("aria-label", "Change the scorer");
      b.onclick = () => askNumber(t.id);
      li.append(b);
    }
    const x = document.createElement("button");
    x.textContent = "✕";
    x.setAttribute("aria-label", `Remove ${LABEL[t.kind]}`);
    x.onclick = () => { if (confirm(`Remove “${LABEL[t.kind]}${t.side ? ` — ${side(t)}` : ""}”?`)) { removeTap(m, t.id); save(); render(); } };
    li.append(x);
    list.append(li);
  }
  $("undo").disabled = !m.taps.length;
}

function tick() {
  const min = minute(state.match, Date.now());
  const over = state.match.taps.some((t) => t.kind === "full_time");
  const ht = state.match.taps.some((t) => t.kind === "half_time") && !state.match.taps.some((t) => t.kind === "second_half");
  $("clock").textContent = over ? "FT" : ht ? "HT" : min == null ? "" : `${min}’`;
}

let toastTimer = 0;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function record(kind, sideName) {
  const t = addTap(state.match, kind, sideName, Date.now());
  save();
  navigator.vibrate?.(30);
  keepAwake();
  const min = minute(state.match, t.at);
  toast(`${LABEL[kind]}${t.side ? ` — ${side(t)}` : ""}${min != null ? ` · ${min}’` : ""}`);
  render();
  if (kind === "goal" && sideName === "us") askNumber(t.id);
}

function askNumber(id) {
  pendingGoal = id;
  const nums = state.settings.squad.length ? state.settings.squad : Array.from({ length: 20 }, (_, i) => i + 1);
  const box = $("numbers");
  box.replaceChildren(...nums.map((n) => {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.onclick = () => chooseNumber(n);
    return b;
  }));
  $("otherNumber").value = "";
  $("numberSheet").classList.add("open");
}
function closeNumberSheet() {
  pendingGoal = null;
  $("numberSheet").classList.remove("open");
}

function chooseNumber(n) {
  if (pendingGoal) setNumber(state.match, pendingGoal, n);
  pendingGoal = null;
  $("numberSheet").classList.remove("open");
  save();
  render();
}

// the screen stays on while tagging (where the phone allows it)
let lock = null;
async function keepAwake() {
  try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.onrelease = () => { lock = null; }; } }
  catch { /* not allowed here: the taps are kept anyway */ }
}

async function send(match) {
  const text = JSON.stringify(toFile(match), null, 1);
  const name = fileName(match);
  const file = new File([text], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "PitchReel tags" });
      toast("Sent");
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;          // the helper closed the share sheet
  }
  const a = document.createElement("a");                 // no share sheet here: save the file instead
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast("Saved — send the file from Downloads");
}

function build() {
  for (const sideName of ["us", "them"]) {
    const col = document.querySelector(`.col.${sideName}`);
    for (const kind of MOMENTS.filter((k) => k !== "goal")) {
      const b = document.createElement("button");
      b.dataset.kind = kind;
      b.dataset.side = sideName;
      b.textContent = LABEL[kind];
      col.append(b);
    }
  }
  document.querySelectorAll("button[data-kind]").forEach((b) => {
    if (b.id === "phase") return;
    b.addEventListener("click", () => record(b.dataset.kind, b.dataset.side ?? null));
  });
  $("phase").onclick = () => {
    const k = $("phase").dataset.kind;
    if (k) record(k, null); else send(state.match);
  };
  $("undo").onclick = () => {
    const t = removeTap(state.match);
    if (t) { save(); toast(`Taken back: ${LABEL[t.kind]}`); render(); }
  };
  $("send").onclick = () => {
    if (!state.match.taps.length) { toast("Nothing to send yet"); return; }
    send(state.match);
  };
  $("otherOk").onclick = () => {
    const v = $("otherNumber").value.trim();
    if (/^\d{1,2}$/.test(v)) chooseNumber(+v);
  };
  $("notSure").onclick = () => chooseNumber(null);
  // tapping beside the sheet closes it and keeps the number already chosen; only "Not sure" clears it
  $("numberSheet").addEventListener("click", (e) => { if (e.target === $("numberSheet")) closeNumberSheet(); });
  $("matchLabel").value = state.match.label;
  $("matchLabel").oninput = (e) => { state.match.label = e.target.value.slice(0, 60); save(); render(); };
  $("usLabel").value = state.settings.us;
  $("themLabel").value = state.settings.them;
  $("usLabel").oninput = (e) => { state.settings.us = e.target.value.trim().slice(0, 12) || "Us"; save(); render(); };
  $("themLabel").oninput = (e) => { state.settings.them = e.target.value.trim().slice(0, 12) || "Them"; save(); render(); };
  $("squad").value = state.settings.squadText ?? "";
  $("squad").oninput = (e) => {
    state.settings.squadText = e.target.value.slice(0, 120);
    state.settings.squad = parseSquad(e.target.value);
    save();
  };
  $("newMatch").onclick = () => {
    const m = state.match;
    if (m.taps.length && !confirm("Start a new match? This one is kept on the phone (the last 10), so you can still send it."))
      return;
    if (m.taps.length) state.past = [m, ...state.past].slice(0, 10);
    state.match = newMatch(Date.now());
    $("matchLabel").value = "";
    $("more").open = false;
    save();
    render();
  };
  $("resend").onclick = () => {
    const box = $("pastList");
    box.replaceChildren(...(state.past.length ? state.past.map((m) => {
      const b = document.createElement("button");
      const g = score(m);
      b.textContent = `${new Date(m.started).toLocaleDateString()} ${m.label || ""} · ${g.us}–${g.them} · ${m.taps.length} taps`;
      b.onclick = () => send(m);
      return b;
    }) : [Object.assign(document.createElement("p"), { className: "note", textContent: "No earlier matches on this phone." })]));
    $("sendSheet").classList.add("open");
  };
  $("sendClose").onclick = () => $("sendSheet").classList.remove("open");
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { tick(); if (state.match.taps.length) keepAwake(); } });
  setInterval(tick, 15000);
}

build();
save();
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* offline copy unavailable */ });
