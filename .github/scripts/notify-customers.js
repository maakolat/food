const fs = require("fs");
const { execSync } = require("child_process");
const webpush = require("web-push");

const SUBS_FILE = "notify-subs.json";
const TOPIC = process.env.NTFY_TOPIC || "yam-alyaqout-n7p4w2";

function xorDecode(hex, pin) {
  const key = String(pin || "");
  const h = String(hex || "").replace(/\s/g, "");
  if (!h || !key || h.length % 2) return "";
  let out = "";
  for (let i = 0; i < h.length; i += 2) {
    out += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ key.charCodeAt((i / 2) % key.length));
  }
  return out;
}

function loadVapid() {
  let pub = String(process.env.VAPID_PUBLIC || "").trim();
  let priv = String(process.env.VAPID_PRIVATE || "").trim();
  try {
    const cfg = fs.readFileSync("js/config.js", "utf8");
    if (!pub) {
      const m = cfg.match(/vapidPublic:\s*"([^"]+)"/);
      if (m) pub = m[1];
    }
    if (!priv) {
      const m = cfg.match(/vapidAuth:\s*"([^"]+)"/);
      const pin = String(process.env.ADMIN_PIN || "48291763");
      if (m) priv = xorDecode(m[1], pin);
    }
  } catch (err) {}
  return { pub, priv };
}

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
  fs.writeFileSync(SUBS_FILE, JSON.stringify({ updatedAt: Date.now(), subs: list }, null, 2) + "\n");
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

function eventPayload() {
  try {
    const p = process.env.GITHUB_EVENT_PATH;
    if (!p || !fs.existsSync(p)) return null;
    const ev = JSON.parse(fs.readFileSync(p, "utf8"));
    if (ev.client_payload && (ev.client_payload.title || ev.client_payload.body)) {
      return ev.client_payload;
    }
    if (ev.inputs && (ev.inputs.title || ev.inputs.body)) {
      return ev.inputs;
    }
  } catch (err) {}
  return null;
}

async function sendNtfy(payload) {
  const click = "https://maakolat.github.io/food/" + String(payload.url || "").replace(/^\.\//, "");
  const u = new URL("https://ntfy.sh/" + encodeURIComponent(TOPIC));
  u.searchParams.set("title", String(payload.title || "تحديث من الياقوت والمرجان"));
  u.searchParams.set("priority", payload.urgent ? "5" : "4");
  u.searchParams.set("tags", "bell");
  u.searchParams.set("click", click);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: String(payload.body || "افتح التطبيق")
  });
  console.log("ntfy", res.status);
}

async function sendAll(subs, payload) {
  const { pub, priv } = loadVapid();
  if (!pub || !priv) {
    console.log("missing vapid keys", { pub: !!pub, priv: !!priv });
    return subs;
  }
  webpush.setVapidDetails("mailto:maakolat@users.noreply.github.com", pub, priv);
  const body = JSON.stringify(payload);
  const keep = [];
  let ok = 0;
  let fail = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body, { TTL: 86400, urgency: "high", headers: { Urgency: "high" } });
      keep.push(sub);
      ok += 1;
    } catch (err) {
      fail += 1;
      const code = err && err.statusCode;
      console.warn("push fail", code || "", (err && err.message) || err);
      if (code !== 404 && code !== 410) keep.push(sub);
    }
  }
  console.log("webpush ok", ok, "fail", fail, "subs", subs.length);
  return keep;
}

function jobsFromCatalog() {
  const current = readJsonFile("menu.json");
  const prevRaw = gitShow("HEAD~1", "menu.json");
  const prev = prevRaw ? JSON.parse(prevRaw) : { menu: current.menu || [], stories: [] };
  const { newDishes, newStories, newAlerts } = diffCatalog(prev, current);
  console.log("newStories", newStories.length, "newDishes", newDishes.length, "newAlerts", newAlerts.length);
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
  return jobs;
}

async function main() {
  const mode = process.argv[2] || "harvest";
  let subs = mergeSubs(readSubsFile(), await harvestNtfy());
  writeSubsFile(subs);
  console.log("subs", subs.length, "mode", mode);

  if (mode === "harvest") {
    return;
  }

  let jobs = [];
  const forced = eventPayload();
  if (mode === "send-now" || forced) {
    const p = forced || {};
    const title = String(p.title || process.env.NOTIFY_TITLE || "").trim();
    const body = String(p.body || process.env.NOTIFY_BODY || "").trim();
    if (title || body) {
      jobs.push({
        title: title || "تحديث من الياقوت والمرجان",
        body: body || "افتح التطبيق",
        url: p.url || "./?open=alert",
        tag: p.tag || "yam-urgent",
        urgent: p.urgent === true || p.urgent === "true" || p.urgent === "5"
      });
    } else {
      jobs = jobsFromCatalog();
      if (!jobs.length) {
        const alerts = liveAlerts(readJsonFile("menu.json"), Date.now());
        if (alerts[0]) {
          jobs.push({
            title: alerts[0].title,
            body: alerts[0].body || "من مأكولات الياقوت والمرجان",
            url: "./?open=alert",
            tag: "yam-urgent",
            urgent: true
          });
        }
      }
    }
  } else {
    jobs = jobsFromCatalog();
  }

  if (!jobs.length) {
    console.log("nothing to send");
    return;
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
