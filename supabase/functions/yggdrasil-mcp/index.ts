// Yggdrasil MCP bridge – remote MCP server (Streamable HTTP, JSON responses)
// URL: /functions/v1/yggdrasil-mcp/<MCP_TOKEN>

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("MCP_TOKEN") ?? "";
const USER_ID = Deno.env.get("YGG_USER_ID") ?? "";

type Json = Record<string, any>;
const NAP = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
const dateOnly = (d: string) => new Date(d + "T12:00:00");
const ds = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const slotLabel = (slot: number, offset = 0) => { const m = slot * 30 + (offset || 0); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
function parseTime(t: string) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); if (!m) return null; const mins = Number(m[1]) * 60 + Number(m[2]); return { slot: Math.floor(mins / 30), offset: mins % 30 >= 15 ? 15 : 0 }; }
function periodDates(period: string, date: string) {
  const d = dateOnly(date); if (period === "week") { const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return ds(x); }); }
  if (period === "month") { const y = d.getFullYear(), m = d.getMonth(), n = new Date(y, m + 1, 0).getDate(); return Array.from({ length: n }, (_, i) => ds(new Date(y, m, i + 1, 12))); }
  return [date];
}
function findByName<T extends { name: string }>(list: T[], q: string, what: string): T {
  const n = norm(q); if (!n) throw new Error(`Hiányzik a ${what} neve.`);
  const exact = list.filter(x => norm(x.name) === n); if (exact.length === 1) return exact[0];
  const starts = list.filter(x => norm(x.name).startsWith(n)); if (starts.length === 1) return starts[0];
  const incl = list.filter(x => norm(x.name).includes(n) || n.includes(norm(x.name)));
  if (incl.length === 1) return incl[0];
  if (incl.length > 1) throw new Error(`Több ${what} is egyezik „${q}”-ra: ${incl.map(x => x.name).join(", ")}. Pontosítsd.`);
  throw new Error(`Nem találok ilyen ${what}-t: „${q}”.`);
}

// ---------- state access ----------
async function loadRow(): Promise<{ data: Json; updated_at: string }> {
  const r = await fetch(`${SB_URL}/rest/v1/yggdrasil_state?user_id=eq.${USER_ID}&select=data,updated_at`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!r.ok) throw new Error("Nem érem el az adatbázist (" + r.status + ").");
  const rows = await r.json(); if (!rows.length) throw new Error("Nincs szinkronizált állapot ehhez a felhasználóhoz.");
  return rows[0];
}
async function saveRow(data: Json) {
  data.updatedAt = new Date().toISOString();
  const r = await fetch(`${SB_URL}/rest/v1/yggdrasil_state?user_id=eq.${USER_ID}`, { method: "PATCH", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ data, updated_at: data.updatedAt }) });
  if (!r.ok) throw new Error("Mentés sikertelen (" + r.status + "): " + (await r.text()).slice(0, 200));
}
async function log(tool: string, summary: string, args: Json) {
  await fetch(`${SB_URL}/rest/v1/claude_log`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: USER_ID, tool, summary, args }) }).catch(() => {});
}

// ---------- domain (mirrors the app) ----------
function rawLog(s: Json, hid: string, date: string) { const x = (s.logs || {})[hid + "|" + date]; if (x && typeof x === "object") return { value: Number(x.value) || 0, status: x.status || ((Number(x.value) || 0) > 0 ? "full" : "none") }; const v = Number(x) || 0; return { value: v, status: v > 0 ? "full" : "none" }; }
function periodValue(s: Json, h: Json, date: string) { return periodDates(h.period || "day", date).reduce((a, d) => { const l = rawLog(s, h.id, d); return a + (l.status === "full" ? l.value : 0); }, 0); }
function habitComplete(s: Json, h: Json, date: string) { return periodValue(s, h, date) >= Number(h.target || 1); }
function categoryMinutes(s: Json, cid: string, date: string) {
  const hs = (s.habits || []).filter((h: Json) => h.categoryId === cid);
  let m = hs.filter((h: Json) => h.measure === "minutes").reduce((a: number, h: Json) => a + rawLog(s, h.id, date).value, 0) + (Number((s.catLogs || {})[cid + "|" + date]) || 0);
  const nonMin = new Set(hs.filter((h: Json) => h.measure !== "minutes").map((h: Json) => h.id));
  m += (((s.dayplan || {})[date]) || []).reduce((a: number, e: Json) => a + ((e.habitId && nonMin.has(e.habitId) && planDone(s, e)) ? (Number(e.minutes) || 0) : 0), 0);
  const evIds = new Set((s.events || []).filter((ev: Json) => ev.categoryId === cid).map((ev: Json) => ev.id));
  if (evIds.size) m += (s.entries || []).reduce((a: number, en: Json) => a + ((en.kind === "event" && en.date === date && evIds.has(en.eventId)) ? (Number(en.minutes) || 0) : 0), 0);
  return m;
}
function catTargetFor(c: Json, date: string) { if (c.period === "custom") { const wt = c.weekTargets || []; return Math.max(0, Number(wt[(dateOnly(date).getDay() + 6) % 7]) || 0); } return Math.max(0, Number(c.target) || 0); }
function categoryValue(s: Json, c: Json, date: string) { const dates = periodDates(c.period === "custom" ? "day" : (c.period || "day"), date); if ((c.measure || "minutes") === "count") { const hs = (s.habits || []).filter((h: Json) => h.categoryId === c.id); return dates.reduce((a, d) => a + hs.filter((h: Json) => rawLog(s, h.id, d).status === "full").length, 0); } return dates.reduce((a, d) => a + categoryMinutes(s, c.id, d), 0); }
function catFmt(c: Json, n: number) { if ((c.measure || "minutes") === "count") return `${n} alkalom`; return n >= 60 && n % 15 === 0 ? `${(n / 60).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} ó` : `${n} perc`; }
function refText(s: Json, ref: string) { if (!ref) return ""; const p = ref.split("|"), m = (s.milestones || []).find((x: Json) => x.id === p[1]); if (!m) return ""; if (p[0] === "m") return m.name; const t = (m.tasks || []).find((x: Json) => x.id === p[2]); if (!t) return ""; if (p[0] === "t") return t.name; const sub = (t.subtasks || []).find((x: Json) => x.id === p[3]); return sub ? sub.name : ""; }
function planDone(s: Json, e: Json) { if (e.ref) { const p = e.ref.split("|"), m = (s.milestones || []).find((x: Json) => x.id === p[1]); if (!m) return false; if (p[0] === "m") return m.completedAt ? true : (m.kind === "feladat" && !(m.tasks || []).length ? !!e.done : false); const t = (m.tasks || []).find((x: Json) => x.id === p[2]); if (!t) return false; if (p[0] === "t") return !!t.completedAt; const sub = (t.subtasks || []).find((x: Json) => x.id === p[3]); return !!(sub && sub.completedAt); } return !!e.done; }
function planLabel(s: Json, e: Json) {
  const h = e.habitId ? (s.habits || []).find((x: Json) => x.id === e.habitId) : null;
  const ev = e.eventId ? (s.events || []).find((x: Json) => x.id === e.eventId) : null;
  const c = e.catId ? (s.categories || []).find((x: Json) => x.id === e.catId) : null;
  if (h) return `${h.emoji || ""} ${refText(s, e.ref) || e.title || h.name}`.trim();
  if (ev) return `${ev.emoji || ""} ${ev.name}`.trim();
  if (c) return `${c.emoji || "🍃"} ${e.title || c.name}`.trim();
  return `📌 ${refText(s, e.ref) || e.title || "Esemény"}`;
}
function ownerLabel(s: Json, m: Json) { if (m.habitId) { const h = (s.habits || []).find((x: Json) => x.id === m.habitId); return h ? `${h.emoji || ""} ${h.name}`.trim() : "?"; } if (m.groupId) { const g = (s.taskGroups || []).find((x: Json) => x.id === m.groupId); return g ? `${g.emoji || ""} ${g.name}`.trim() : "?"; } return "—"; }
function treeLevels(s: Json, date: string) {
  const NAMES = ["Mélygyökér", "Gyökerek", "Törzs és erdő", "Törzs és hegyek", "Lombkorona", "Korona teteje"]; let chain = true;
  return ((s.tree && s.tree.levels) || []).map((key: string, i: number) => {
    let label = "—", done = false, rest = false;
    if (key && key.startsWith("cat:")) { const c = (s.categories || []).find((x: Json) => x.id === key.slice(4)); if (c) { label = `${c.emoji || "🍃"} ${c.name}`; const tg = catTargetFor(c, date); rest = c.period === "custom" && tg === 0; done = rest || (tg > 0 && categoryValue(s, c, date) >= tg); } }
    else if (key) { const h = (s.habits || []).find((x: Json) => x.id === key); if (h) { label = `${h.emoji || ""} ${h.name}`.trim(); done = habitComplete(s, h, date); } }
    const active = done && chain; chain = active; return { i, name: NAMES[i], label, done, active, rest };
  });
}
function openTasks(s: Json) {
  const rows: { m: Json; t: Json | null; sub: Json | null }[] = [];
  (s.milestones || []).filter((m: Json) => !m.archived && !m.completedAt).forEach((m: Json) => { const open = (m.tasks || []).filter((t: Json) => !t.completedAt); if (m.kind === "feladat" && open.length) open.forEach((t: Json) => { rows.push({ m, t, sub: null }); (t.subtasks || []).filter((x: Json) => !x.completedAt).forEach((x: Json) => rows.push({ m, t, sub: x })); }); else rows.push({ m, t: null, sub: null }); });
  return rows;
}
function stageUnlocked(p: Json, i: number): boolean { if (i <= 0) return true; if (!stageUnlocked(p, i - 1)) return false; return p.nodes.filter((n: Json) => n.stageId === p.stages[i - 1].id && n.required).every((n: Json) => n.done); }
function stageComplete(p: Json, i: number) { const ns = p.nodes.filter((n: Json) => n.stageId === p.stages[i].id); return stageUnlocked(p, i) && ns.length > 0 && ns.every((n: Json) => n.done); }

// ---------- read tools ----------
function dailyBrief(s: Json, date: string) {
  const d = dateOnly(date), out: string[] = [];
  out.push(`# Yggdrasil – ${date} (${NAP[d.getDay()]})${date === today() ? " · ma" : ""}`);
  // plan
  const plan = ((s.dayplan || {})[date] || []).slice().sort((a: Json, b: Json) => (a.slot * 30 + (a.offset || 0)) - (b.slot * 30 + (b.offset || 0)));
  out.push(`\n## Napiterv (${plan.length} elem)`);
  if (!plan.length) out.push("- (üres)");
  plan.forEach((e: Json) => out.push(`- ${planDone(s, e) ? "[x]" : "[ ]"} ${slotLabel(e.slot, e.offset)} · ${e.minutes} perc · ${planLabel(s, e)}${Number(e.prio) ? ` · prio ${e.prio}` : ""}${e.seriesId ? " · ↻" : ""}${e.source === "claude" ? " · ✨" : ""} [id:${e.id}]`));
  // habits
  const habits = (s.habits || []).filter((h: Json) => !h.parentId && !h.trackOnly);
  out.push(`\n## Szokások (${habits.filter((h: Json) => habitComplete(s, h, date)).length}/${habits.length} kész)`);
  habits.forEach((h: Json) => { const v = periodValue(s, h, date), unit = h.measure === "minutes" ? "perc" : h.measure === "count" ? "alkalom" : h.unit || ""; const per = h.period === "week" ? "héten" : h.period === "month" ? "hónapban" : "ma"; out.push(`- ${habitComplete(s, h, date) ? "✅" : "○"} ${h.emoji || ""} ${h.name}${h.measure !== "check" ? ` — ${Math.round(v * 10) / 10}/${h.target} ${unit} (${per})` : ""}`); });
  // categories
  const cats = (s.categories || []).filter((c: Json) => catTargetFor(c, date) > 0 || c.period === "custom");
  if (cats.length) { out.push(`\n## Kategória-célok`); cats.forEach((c: Json) => { const tg = catTargetFor(c, date), v = categoryValue(s, c, date); out.push(`- ${tg ? (v >= tg ? "✅" : "○") : "😌"} ${c.emoji || "🍃"} ${c.name} — ${tg ? `${catFmt(c, v)} / ${catFmt(c, tg)}` : "ma pihenőnap"}${c.period === "week" ? " (heti)" : c.period === "month" ? " (havi)" : ""}`); }); }
  // tree
  const lv = treeLevels(s, date); if (lv.some((l: Json) => l.label !== "—")) { out.push(`\n## Yggdrasil fa: ${lv.filter((l: Json) => l.active).length}/6 szint él`); lv.forEach((l: Json) => out.push(`- ${l.i + 1}. ${l.name}: ${l.label}${l.label === "—" ? "" : l.active ? " ✅" : l.done ? " (kész, de alatta hiányzik)" : l.rest ? " (pihenőnap)" : " ○"}`)); }
  // tasks
  const rows = openTasks(s); out.push(`\n## Nyitott feladatok (${rows.length})`);
  rows.slice(0, 40).forEach(r => { const dl = r.sub ? r.sub.deadline : r.t ? r.t.deadline : r.m.deadline; out.push(`- ${r.sub ? "↳ " + r.sub.name : r.t ? "📋 " + r.t.name : "🎯 " + r.m.name} — ${r.t ? r.m.name + " · " : ""}${ownerLabel(s, r.m)}${dl ? ` · 📅 ${dl}${dl < date ? " (lejárt)" : ""}` : ""} [${r.sub ? "sid" : r.t ? "tid" : "mid"}:${r.sub ? r.sub.id : r.t ? r.t.id : r.m.id}]`); });
  if (rows.length > 40) out.push(`- … és még ${rows.length - 40}`);
  // maps
  (s.pmaps || []).forEach((p: Json) => { if (!p.stages.length) return; let ai = p.stages.findIndex((_: Json, i: number) => stageUnlocked(p, i) && !stageComplete(p, i)); if (ai < 0) ai = p.stages.length - 1; const st = p.stages[ai]; const open = p.nodes.filter((n: Json) => n.stageId === st.id && !n.done); out.push(`\n## Térkép: ${p.emoji || "🗺️"} ${p.name} — aktív stáció ${ai + 1}. „${st.name}” (${p.stages.filter((_: Json, i: number) => stageComplete(p, i)).length}/${p.stages.length} stáció kész)`); open.slice(0, 12).forEach((n: Json) => { const lane = p.lanes.find((l: Json) => l.id === n.laneId); out.push(`- ○ ${n.name}${n.required ? " ⚑" : ""} (${lane ? lane.name : "?"})${n.target ? ` ${n.val}/${n.target}` : ""} [node:${n.id}]`); }); });
  // notes yesterday & today
  const y = new Date(d); y.setDate(d.getDate() - 1); const yd = ds(y);
  const notes = (s.notes || []).filter((n: Json) => n.date === yd || n.date === date);
  if (notes.length) { out.push(`\n## Napló (${yd} és ${date})`); notes.forEach((n: Json) => { const ref = n.refType === "habit" ? (s.habits || []).find((x: Json) => x.id === n.refId) : n.refType === "event" ? (s.events || []).find((x: Json) => x.id === n.refId) : (s.milestones || []).find((x: Json) => x.id === n.refId); out.push(`- ${n.date} · ${ref ? ref.name : "?"}${n.title ? ` · ${n.title}` : ""}: ${String(n.text || "").replace(/\s+/g, " ").slice(0, 240)}`); }); }
  return out.join("\n");
}
function section(s: Json, name: string, date: string) {
  const n = norm(name);
  if (n === "habits" || n === "szokasok") return (s.habits || []).map((h: Json) => `- ${h.emoji || ""} ${h.name}${h.parentId ? " (alszokás)" : ""} — ${h.measure}, cél ${h.target} ${h.unit || ""}/${h.period} · kategória: ${((s.categories || []).find((c: Json) => c.id === h.categoryId) || {}).name || "?"} [hid:${h.id}]`).join("\n");
  if (n === "categories" || n === "kategoriak") return (s.categories || []).map((c: Json) => `- ${c.emoji || ""} ${c.name} — cél: ${c.period === "custom" ? "egyéni napi " + (c.weekTargets || []).join("/") : catFmt(c, Number(c.target) || 0) + " / " + (c.period || "day")} [cid:${c.id}]`).join("\n");
  if (n === "tasks" || n === "feladatok") return (s.milestones || []).filter((m: Json) => !m.archived).map((m: Json) => `- ${m.completedAt ? "✅" : "○"} ${m.kind === "merfoldko" ? "🏁" : "🎯"} ${m.name} — ${ownerLabel(s, m)}${m.deadline ? " · 📅 " + m.deadline : ""} [mid:${m.id}]` + (m.tasks || []).map((t: Json) => `\n  - ${t.completedAt ? "✅" : "○"} ${t.name}${t.deadline ? " · 📅 " + t.deadline : ""}${t.recur && t.recur.unit ? " ↻" : ""} [tid:${t.id}]` + (t.subtasks || []).map((x: Json) => `\n    - ${x.completedAt ? "✅" : "○"} ${x.name} [sid:${x.id}]`).join("")).join("")).join("\n");
  if (n === "maps" || n === "terkepek") return (s.pmaps || []).map((p: Json) => `## ${p.name}\n` + p.stages.map((st: Json, i: number) => `### ${i + 1}. ${st.name}${stageComplete(p, i) ? " ✅" : stageUnlocked(p, i) ? "" : " 🔒"}\n` + p.nodes.filter((x: Json) => x.stageId === st.id).map((x: Json) => `- ${x.done ? "[x]" : "[ ]"} ${x.name}${x.required ? " ⚑" : ""} (${(p.lanes.find((l: Json) => l.id === x.laneId) || {}).name})${x.target ? ` ${x.val}/${x.target}` : ""} [node:${x.id}]`).join("\n")).join("\n")).join("\n\n");
  if (n === "rewards" || n === "ajandekok") return (s.rewards || []).map((r: Json) => `- ${r.unlockedAt ? "✨ " : ""}${r.name} — ${r.collected}/${r.fragments} darabka${r.price ? ` · ${r.price} Ft` : ""}`).join("\n");
  if (n === "notes" || n === "naplo") return (s.notes || []).slice().sort((a: Json, b: Json) => a.date < b.date ? 1 : -1).slice(0, 30).map((x: Json) => `- ${x.date} · ${x.title || ""}: ${String(x.text || "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  if (n === "plan" || n === "napiterv") { const days = Object.keys(s.dayplan || {}).filter(k => k >= date).sort().slice(0, 7); return days.map(k => `## ${k}\n` + ((s.dayplan[k] || []).slice().sort((a: Json, b: Json) => a.slot - b.slot).map((e: Json) => `- ${planDone(s, e) ? "[x]" : "[ ]"} ${slotLabel(e.slot, e.offset)} · ${e.minutes}p · ${planLabel(s, e)} [id:${e.id}]`).join("\n") || "- (üres)")).join("\n\n"); }
  if (n === "events" || n === "esemenyek") return (s.events || []).map((e: Json) => `- ${e.emoji || ""} ${e.name}${e.parentId ? " (al-esemény)" : ""} [eid:${e.id}]`).join("\n");
  throw new Error("Ismeretlen szakasz. Választható: habits, categories, tasks, maps, rewards, notes, plan, events.");
}

// ---------- write tools ----------
function addPlanEntry(s: Json, a: Json) {
  const date = a.date || today(); const t = parseTime(a.start); if (!t) throw new Error("A kezdés formátuma ÓÓ:PP legyen, pl. 09:30.");
  const minutes = Math.max(5, Number(a.minutes) || 30); let habitId = "", catId = "", ref = "", title = String(a.title || "").trim();
  if (a.task) { const rows = openTasks(s).filter(r => r.t); const hits = rows.filter(r => norm(r.t!.name) === norm(a.task)); const cand = hits.length ? hits : rows.filter(r => norm(r.t!.name).includes(norm(a.task))); if (!cand.length) throw new Error(`Nem találok nyitott taskot: „${a.task}”.`); if (cand.length > 1) throw new Error(`Több task egyezik: ${cand.map(r => r.t!.name + " (" + r.m.name + ")").join(", ")}`); const r = cand[0]; ref = `t|${r.m.id}|${r.t!.id}`; habitId = r.m.habitId || ""; if (!habitId) title = r.t!.name; }
  else if (a.habit) { habitId = findByName(s.habits || [], a.habit, "szokás").id; }
  else if (a.category) { catId = findByName(s.categories || [], a.category, "kategória").id; }
  else if (!title) throw new Error("Adj címet, vagy köss szokáshoz / taskhoz / kategóriához.");
  const e: Json = { id: uid(), habitId, eventId: "", catId, slot: t.slot, offset: t.offset, minutes, ref, done: false, title, prio: [1, 2, 3].includes(Number(a.priority)) ? Number(a.priority) : 0, source: "claude" };
  const made: string[] = [date]; s.dayplan = s.dayplan || {}; s.dayplan[date] = (s.dayplan[date] || []).concat(e);
  const rep = a.repeat; if (rep && rep.freq) { const weeks = Math.min(13, Math.max(1, Number(rep.weeks) || 13)); const start = dateOnly(date); const days: number[] = Array.isArray(rep.weekdays) && rep.weekdays.length ? rep.weekdays.map(Number) : [(start.getDay() + 6) % 7]; const sid = uid(); e.seriesId = sid; const copyTitle = title || (ref ? refText(s, ref) : ""); for (let i = 1; i <= weeks * 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const wd = (d.getDay() + 6) % 7; const ok = rep.freq === "daily" || (rep.freq === "weekly" && days.includes(wd)) || (rep.freq === "monthly" && d.getDate() === start.getDate()); if (!ok) continue; const k = ds(d); s.dayplan[k] = (s.dayplan[k] || []).concat({ id: uid(), habitId, eventId: "", catId, slot: t.slot, offset: t.offset, minutes, ref: "", done: false, title: habitId && !ref ? "" : copyTitle, prio: 0, seriesId: sid, source: "claude" }); made.push(k); } }
  return `Beírva: ${date} ${slotLabel(t.slot, t.offset)} · ${minutes} perc · ${planLabel(s, e)}${made.length > 1 ? ` · ismétlés: +${made.length - 1} alkalom (utolsó: ${made[made.length - 1]})` : ""} [id:${e.id}]`;
}
function findPlanEntry(s: Json, a: Json) {
  const date = a.date || today(); const list = (s.dayplan || {})[date] || [];
  if (a.id) { const e = list.find((x: Json) => x.id === a.id); if (!e) throw new Error(`Nincs ilyen napiterv-elem (${a.id}) ${date}-n.`); return { date, e }; }
  if (!a.title) throw new Error("Add meg az elem id-jét vagy címét.");
  const n = norm(a.title); const cand = list.filter((x: Json) => norm(planLabel(s, x)).includes(n)); if (cand.length === 1) return { date, e: cand[0] }; if (cand.length > 1) throw new Error(`Több elem egyezik ${date}-n: ${cand.map((x: Json) => planLabel(s, x) + " " + slotLabel(x.slot, x.offset)).join(", ")}`); throw new Error(`Nem találok „${a.title}” elemet ${date} napitervében.`);
}
function setDone(s: Json, a: Json) {
  const done = a.done !== false; s.claudeInbox = s.claudeInbox || [];
  if (a.task) { const rows = openTasks(s).concat((s.milestones || []).flatMap((m: Json) => (m.tasks || []).filter((t: Json) => t.completedAt).map((t: Json) => ({ m, t, sub: null })))); const cand = rows.filter(r => r.t && !r.sub && norm(r.t.name).includes(norm(a.task))); if (!cand.length) throw new Error(`Nem találok taskot: „${a.task}”.`); if (cand.length > 1) throw new Error(`Több task egyezik: ${cand.map(r => r.t!.name).join(", ")}`); const r = cand[0]; if (!!r.t!.completedAt === done) return `„${r.t!.name}” már ${done ? "kész" : "nyitott"}.`; s.claudeInbox.push({ id: uid(), type: "task_toggle", mid: r.m.id, tid: r.t!.id, done, at: new Date().toISOString() }); return `Kérés rögzítve: „${r.t!.name}” → ${done ? "kész" : "nyitott"}. Az app a következő szinkronnál végrehajtja (XP-vel, naplóval együtt).`; }
  const { date, e } = findPlanEntry(s, a); if (planDone(s, e) === done) return `„${planLabel(s, e)}” már ${done ? "kész" : "nyitott"}.`;
  if (!e.habitId && !e.ref && !e.eventId && !e.catId) { e.done = done; return `„${planLabel(s, e)}” → ${done ? "kész" : "nyitott"}.`; }
  s.claudeInbox.push({ id: uid(), type: "plan_toggle", date, entryId: e.id, done, at: new Date().toISOString() });
  return `Kérés rögzítve: „${planLabel(s, e)}” (${date} ${slotLabel(e.slot, e.offset)}) → ${done ? "kész" : "nyitott"}. Az app a következő szinkronnál könyveli (percek, XP).`;
}
function addTask(s: Json, a: Json) {
  const name = String(a.name || "").trim(); if (!name) throw new Error("Hiányzik a task neve.");
  let m: Json | undefined;
  if (a.feladat) m = findByName((s.milestones || []).filter((x: Json) => !x.archived && x.kind === "feladat"), a.feladat, "Feladat");
  else { let habitId = ""; if (a.habit) habitId = findByName(s.habits || [], a.habit, "szokás").id; else { const todo = (s.habits || []).find((h: Json) => norm(h.name) === "todok intezese"); if (!todo) throw new Error("Nincs „Todok intézése” szokás; adj meg szokást vagy Feladatot."); habitId = todo.id; } m = { id: uid(), habitId, kind: "feladat", type: "tasks", amount: 0, startedAt: today(), name, deadline: a.deadline || "", xp: 0, archived: false, completedAt: "", tasks: [] }; s.milestones = (s.milestones || []).concat(m); }
  const t = { id: uid(), name, type: "📅", deadline: a.deadline || "", highlighted: false, completedAt: "", subtasks: [], source: "claude" }; m!.tasks = (m!.tasks || []).concat(t);
  return `Új task: „${name}” → ${m!.name} (${ownerLabel(s, m!)})${a.deadline ? ` · 📅 ${a.deadline}` : ""} [tid:${t.id}]`;
}
function addNote(s: Json, a: Json) {
  const text = String(a.text || "").trim(); if (!text) throw new Error("Hiányzik a bejegyzés szövege.");
  let refType = "", refId = "", label = "";
  if (a.habit) { const h = findByName(s.habits || [], a.habit, "szokás"); refType = "habit"; refId = h.id; label = h.name; }
  else if (a.event) { const ev = findByName(s.events || [], a.event, "esemény"); refType = "event"; refId = ev.id; label = ev.name; }
  else if (a.feladat) { const m = findByName((s.milestones || []).filter((x: Json) => !x.archived), a.feladat, "Feladat"); refType = "mile"; refId = m.id; label = m.name; }
  else throw new Error("Adj meg egy szokást, eseményt vagy Feladatot, amihez a bejegyzés tartozik.");
  const n = { id: uid(), date: a.date || today(), text, refId, title: String(a.title || "").trim(), minutes: Number(a.minutes) || 0, refType, createdAt: today(), source: "claude" };
  s.notes = (s.notes || []).concat(n); return `Naplóbejegyzés mentve: ${label} · ${n.date}${n.title ? ` · ${n.title}` : ""}`;
}
function setPriorities(s: Json, a: Json) {
  const date = a.date || today(); const list = (s.dayplan || {})[date] || []; const items: Json[] = Array.isArray(a.items) ? a.items : [];
  if (!items.length) throw new Error("Adj meg elemeket: [{title vagy id, prio 1-3}]");
  list.forEach((e: Json) => { e.prio = 0; }); const done: string[] = [];
  items.forEach(it => { const { e } = findPlanEntry(s, { date, id: it.id, title: it.title }); const p = Number(it.prio); if ([1, 2, 3].includes(p)) { list.filter((x: Json) => Number(x.prio) === p).forEach((x: Json) => { x.prio = 0; }); e.prio = p; done.push(`${p}. ${planLabel(s, e)}`); } });
  return `Napi teendők ${date}: ${done.join(" · ") || "(egy sem)"}`;
}

// ---------- MCP plumbing ----------
const TOOLS = [
  { name: "get_daily_brief", description: "Tömör napi kép az Yggdrasilból egy adott napra (alapból ma): napiterv, szokások, kategória-célok, a fa szintjei, nyitott feladatok, térképek aktív stációja, napló. Minden elemnél ott az azonosító, amit a többi eszköz elfogad.", inputSchema: { type: "object", properties: { date: { type: "string", description: "ÉÉÉÉ-HH-NN, alapból ma" } } } },
  { name: "get_section", description: "Egy terület részletei: habits, categories, tasks, maps, rewards, notes, plan (következő 7 nap), events.", inputSchema: { type: "object", properties: { name: { type: "string" }, date: { type: "string" } }, required: ["name"] } },
  { name: "add_plan_entry", description: "Új blokk a napitervbe. Kösd szokáshoz (habit), nyitott taskhoz (task) vagy kategóriához (category), vagy adj címet (title). Opcionális prioritás (1-3) és ismétlés (repeat: {freq: daily|weekly|monthly, weekdays: [0=H..6=V], weeks<=13}).", inputSchema: { type: "object", properties: { date: { type: "string" }, start: { type: "string", description: "ÓÓ:PP" }, minutes: { type: "number" }, title: { type: "string" }, habit: { type: "string" }, task: { type: "string" }, category: { type: "string" }, priority: { type: "number" }, repeat: { type: "object", properties: { freq: { type: "string" }, weekdays: { type: "array", items: { type: "number" } }, weeks: { type: "number" } } } }, required: ["start"] } },
  { name: "set_done", description: "Napiterv-elem (id vagy title + date) vagy task (task név) kipipálása / visszavonása. Szokáshoz kötött elemnél az app végzi a könyvelést a következő szinkronnál.", inputSchema: { type: "object", properties: { date: { type: "string" }, id: { type: "string" }, title: { type: "string" }, task: { type: "string" }, done: { type: "boolean", description: "alapból true" } } } },
  { name: "add_task", description: "Új task egy meglévő Feladatba (feladat), vagy új Feladat egy szokás alatt (habit; alapból a „Todok intézése”).", inputSchema: { type: "object", properties: { name: { type: "string" }, feladat: { type: "string" }, habit: { type: "string" }, deadline: { type: "string" } }, required: ["name"] } },
  { name: "add_note", description: "Naplóbejegyzés egy szokáshoz (habit), eseményhez (event) vagy Feladathoz (feladat).", inputSchema: { type: "object", properties: { text: { type: "string" }, title: { type: "string" }, habit: { type: "string" }, event: { type: "string" }, feladat: { type: "string" }, date: { type: "string" }, minutes: { type: "number" } }, required: ["text"] } },
  { name: "set_priorities", description: "A nap 1-2-3 teendőjének beállítása a napiterv elemei közül (id vagy title).", inputSchema: { type: "object", properties: { date: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, prio: { type: "number" } } } } }, required: ["items"] } },
];

async function callTool(name: string, args: Json) {
  const row = await loadRow(); const s = row.data || {}; const date = args.date || today();
  let text = "", write = false;
  switch (name) {
    case "get_daily_brief": text = dailyBrief(s, date); break;
    case "get_section": text = section(s, args.name, date) || "(üres)"; break;
    case "add_plan_entry": text = addPlanEntry(s, args); write = true; break;
    case "set_done": text = setDone(s, args); write = true; break;
    case "add_task": text = addTask(s, args); write = true; break;
    case "add_note": text = addNote(s, args); write = true; break;
    case "set_priorities": text = setPriorities(s, args); write = true; break;
    default: throw new Error("Ismeretlen eszköz: " + name);
  }
  if (write) { await saveRow(s); await log(name, text.slice(0, 300), args); }
  return text;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" } });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Json) {
  const id = m.id; const method = m.method; const p = m.params || {};
  try {
    if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: typeof p.protocolVersion === "string" ? p.protocolVersion : "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "yggdrasil-mcp", version: "0.1.0" } } };
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") { try { const text = await callTool(p.name, p.arguments || {}); return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } }; } catch (e) { return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Hiba: " + (e as Error).message }], isError: true } }; } }
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
    if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
    return rpcError(id, -32601, "Method not found: " + method);
  } catch (e) { return rpcError(id, -32603, (e as Error).message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 204);
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const tok = parts[parts.length - 1];
  if (!TOKEN || !USER_ID || parts.length < 2 || tok !== TOKEN) return new Response("Not found", { status: 404 });
  if (req.method === "GET") return new Response("Yggdrasil MCP – POST JSON-RPC ide.", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: unknown; try { body = await req.json(); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  const msgs = Array.isArray(body) ? body : [body];
  const out: unknown[] = [];
  for (const m of msgs as Json[]) { if (!m || typeof m !== "object") continue; if (m.id === undefined || m.id === null) continue; out.push(await handle(m)); }
  if (!out.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? out : out[0]);
});
