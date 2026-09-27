const fs = require("fs");
const { execSync } = require("child_process");
const webpush = require("web-push");

const SUBS_FILE = "notify-subs.json";
const TOPIC = process.env.NTFY_TOPIC || "yam-alyaqout-n7p4w2";
const PUBLIC = process.env.VAPID_PUBLIC;
const PRIVATE = process.env.VAPID_PRIVATE;

function readSubsFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(SUBS_FILE, "utf8"));
    const list = Array.isArray(raw) ? raw : (raw.subs || []);
    return list.filter((s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth);
  } catch (err) {
    return [];
  }
}

function writeSubsFile(list) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify({ subs: list }, null, 2) + "\n");
}

function keyOf(sub) {
  return String(sub.endpoint || "");
}

function mergeSubs(a, b) {
  const map = new Map();
  a.concat(b).forEach((s) => {
    if (s && s.endpoint) map.set(keyOf(s), s);
  });
  return Array.from(map.values());
}

async function harvestNtfy() {
  const url = "https://ntfy.sh/" + encodeURIComponent(TOPIC) + "/json?poll=1&since=all";
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  const found = [];
  text.split("\n").forEach((line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      if (!msg || msg.event !== "message" || !msg.message) return;
      const body = JSON.parse(msg.message);
      if (body && body.endpoint && body.keys) found.push(body);
    } catch (err) {}
  });
  return found;
}

function readJsonFile(path) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch (err) { return { menu: [], stories: [] }; }
}

function gitShow(rev, path) {
  try { return execSync("git show " + rev + ":" + path, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch (err) { return ""; }
}

function collectIds(list) {
  return new Set((list || []).map((item) => item && item.id).filter(Boolean));
}

function activeStories(list, now) {
  return (list || []).filter((s) => s && s.id && s.image && Number(s.expiresAt || 0) > now);
}

function liveAlerts(data, now) {
  const list = [];
  const add = (item) => {
    if (!item || !item.id || !item.title || Number(item.expiresAt || 0) <= now) return;
    if (list.some((a) => a.id === item.id)) return;
    list.push(item);
  };
  (data.alerts || []).forEach(add);
  add(data.alert);
  return list;
}

function diffCatalog(prev, next) {
  const now = Date.now();
  const prevDishes = collectIds(prev.menu);
  const prevStories = collectIds(activeStories(prev.stories, now));
  const prevAlerts = collectIds(liveAlerts(prev, now));
  const newDishes = (next.menu || []).filter((item) => item && item.id && !prevDishes.has(item.id));
  const newStories = activeStories(next.stories, now).filter((s) => !prevStories.has(s.id));
  const newAlerts = liveAlerts(next, now).filter((a) => !prevAlerts.has(a.id));
  return { newDishes, newStories, newAlerts };
}

async function sendNtfy(payload) {
  const click = "https://maakolat.github.io/food/" + String(payload.url || "").replace(/^\.\//, "");
  const u = new URL("https://ntfy.sh/" + encodeURIComponent(TOPIC));
  u.searchParams.set("title", String(payload.title || "تحديث من الياقوت والمرجان"));
  u.searchParams.set("priority", payload.urgent ? "5" : "4");
  u.searchParams.set("tags", "bell");
  u.searchParams.set("click", click);
  await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: String(payload.body || "افتح التطبيق")
  });
}

async function sendAll(subs, payload) {
  if (!PUBLIC || !PRIVATE) return subs;
  webpush.setVapidDetails("mailto:maakolat@users.noreply.github.com", PUBLIC, PRIVATE);
  const body = JSON.stringify(payload);
  const keep = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body, { TTL: 86400, urgency: "high" });
      keep.push(sub);
    } catch (err) {
      const code = err && err.statusCode;
      if (code !== 404 && code !== 410) keep.push(sub);
    }
  }
  return keep;
}

async function main() {
  const mode = process.argv[2] || "harvest";
  let subs = mergeSubs(readSubsFile(), await harvestNtfy());
  writeSubsFile(subs);

  if (mode !== "send") {
    console.log("harvested", subs.length, "subscriptions");
    return;
  }

  const current = readJsonFile("menu.json");
  const prevRaw = gitShow("HEAD~1", "menu.json");
  const prev = prevRaw ? JSON.parse(prevRaw) : { menu: current.menu || [], stories: [] };
  const { newDishes, newStories, newAlerts } = diffCatalog(prev, current);
  console.log("newStories", newStories.length, "newDishes", newDishes.length, "newAlerts", newAlerts.length, "subs", subs.length);

  const jobs = [];
  if (newAlerts.length) {
    const one = newAlerts[0];
    jobs.push({
      title: one.title,
      body: one.body || "من مأكولات الياقوت والمرجان",
      url: "./?open=alert",
      tag: "yam-urgent",
      urgent: true,
      id: one.id || ""
    });
  }
  if (newStories.length) {
    const one = newStories[0];
    jobs.push({
      title: newStories.length === 1 ? "ستوري جديد" : newStories.length + " ستوريات جديدة",
      body: newStories.length === 1 ? (one.title || one.caption || "من مأكولات الياقوت والمرجان") : "من مأكولات الياقوت والمرجان",
      url: "./?open=stories",
      tag: "yam-story"
    });
  }
  if (newDishes.length) {
    const one = newDishes[0];
    jobs.push({
      title: newDishes.length === 1 ? "صنف جديد في القائمة" : newDishes.length + " أصناف جديدة",
      body: newDishes.length === 1 ? (one.name || "تمت إضافة صنف جديد") : "تمت إضافتها إلى قائمة الياقوت والمرجان",
      url: "./?open=menu",
      tag: "yam-menu"
    });
  }
  for (const job of jobs) {
    try { await sendNtfy(job); } catch (err) { console.warn("ntfy", err); }
    subs = await sendAll(subs, job);
  }
  writeSubsFile(subs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
