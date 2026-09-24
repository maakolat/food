const CACHE = "yam-app-v65";
const IDB_NAME = "yam-notify-v1";
const IDB_STORE = "state";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim()).then(() => checkForNews("activate"))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try { url = new URL(event.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (/manifest\.webmanifest$|\/sw\.js$|admin\.html$|app-icon|\/logo\.png$/i.test(url.pathname)) return;
  if (/menu\.json(\?|$)|\/assets\/uploads\//.test(url.pathname + url.search)) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw err;
    }
  })());
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "yam-updates") event.waitUntil(checkForNews("periodicsync"));
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = null;
    try { if (event.data) payload = event.data.json(); } catch (err) {}
    if (payload && payload.title) {
      await showNote(payload.title, payload.body || "", payload.url || "./", payload.tag || "yam-news", {
        urgent: !!payload.urgent
      });
      if (payload.urgent) {
        await notifyClients({
          type: "yam-urgent",
          title: payload.title,
          body: payload.body || "",
          url: payload.url || "./"
        });
      }
      return;
    }
    await checkForNews("push");
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "yam-check") {
    event.waitUntil(checkForNews(data.reason || "message"));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(openTarget(target));
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSeen() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const get = tx.objectStore(IDB_STORE).get("seen");
      get.onsuccess = () => resolve(get.result || { dishes: {}, stories: {}, primed: false });
      get.onerror = () => reject(get.error);
    });
  } catch (err) {
    return { dishes: {}, stories: {}, primed: false };
  }
}

async function saveSeen(seen) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(seen, "seen");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchCatalog() {
  const url = new URL("menu.json", self.registration.scope);
  url.searchParams.set("t", String(Date.now()));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function iconUrl() {
  return new URL("assets/app-icon-192.png", self.registration.scope).href;
}

async function hasVisibleClient() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return list.some((c) => c.visibilityState === "visible");
}

async function notifyClients(payload) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach((c) => c.postMessage(payload));
}

function chimeUrl() {
  return new URL("assets/notify-chime.wav", self.registration.scope).href;
}

async function showNote(title, body, url, tag, opts) {
  opts = opts || {};
  const urgent = !!opts.urgent;
  await self.registration.showNotification(title, {
    body,
    lang: "ar",
    dir: "rtl",
    icon: iconUrl(),
    badge: iconUrl(),
    tag: tag || "yam-news",
    renotify: true,
    requireInteraction: urgent,
    silent: false,
    vibrate: urgent
      ? [70, 40, 70, 40, 90, 120, 240, 70, 240, 70, 380]
      : [160, 80, 160],
    sound: chimeUrl(),
    data: { url: url || "./", urgent }
  });
}

async function openTarget(target) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const abs = new URL(target, self.registration.scope).href;
  for (let i = 0; i < list.length; i++) {
    const client = list[i];
    if (client.url.indexOf(self.registration.scope) === 0) {
      await client.focus();
      client.postMessage({ type: "yam-open", url: abs });
      return;
    }
  }
  await self.clients.openWindow(abs);
}

async function checkForNews(reason) {
  try {
    if (!self.registration || typeof self.registration.showNotification !== "function") return;
    const data = await fetchCatalog();
  if (!data || !Array.isArray(data.menu)) return;
  const now = Date.now();
  const dishes = data.menu.filter((item) => item && item.id);
  const stories = (data.stories || []).filter((s) => s && s.id && s.image && Number(s.expiresAt || 0) > now);
  const liveAlerts = [];
  const addAlert = (item) => {
    if (!item || !item.title || Number(item.expiresAt || 0) <= now) return;
    if (liveAlerts.some((a) => a.id === item.id)) return;
    liveAlerts.push(item);
  };
  if (Array.isArray(data.alerts)) data.alerts.forEach(addAlert);
  addAlert(data.alert);
  const seen = await loadSeen();
  if (!seen.alertIds) seen.alertIds = {};
  if (seen.alertId) seen.alertIds[seen.alertId] = 1;
  const FRESH_MS = 36 * 3600000;
  if ((seen.schema || 1) < 2) {
    stories.forEach((s) => {
      if (now - Number(s.createdAt || s.updatedAt || 0) < FRESH_MS) {
        delete seen.stories[s.id];
      }
    });
    seen.schema = 2;
  }
  if (!seen.primed) {
    dishes.forEach((d) => { seen.dishes[d.id] = 1; });
    stories.forEach((s) => {
      if (now - Number(s.createdAt || s.updatedAt || 0) >= FRESH_MS) {
        seen.stories[s.id] = 1;
      }
    });
    liveAlerts.forEach((a) => { seen.alertIds[a.id] = 1; });
    seen.primed = true;
    await saveSeen(seen);
  }
  const newDishes = dishes.filter((d) => !seen.dishes[d.id]);
  const newStories = stories.filter((s) => !seen.stories[s.id]);
  const newAlerts = liveAlerts.filter((a) => !seen.alertIds[a.id]);
  if (!newDishes.length && !newStories.length && !newAlerts.length) return;
  newDishes.forEach((d) => { seen.dishes[d.id] = 1; });
  newStories.forEach((s) => { seen.stories[s.id] = 1; });
  newAlerts.forEach((a) => { seen.alertIds[a.id] = 1; });
  if (newAlerts[0]) seen.alertId = newAlerts[0].id;
  await saveSeen(seen);

  const news = {
    type: "yam-news",
    reason: reason || "",
    dishes: newDishes.map((d) => ({ id: d.id, name: d.name || "" })),
    stories: newStories.map((s) => ({ id: s.id, title: s.title || s.caption || "" }))
  };

  if (await hasVisibleClient()) {
    await notifyClients(news);
  }

  const allowed = typeof Notification === "undefined" || Notification.permission === "granted";
  if (!allowed) return;

  try {
    if (newStories.length) {
      const one = newStories[0];
      const title = newStories.length === 1
        ? "ستوري جديد"
        : newStories.length + " ستوريات جديدة";
      const body = newStories.length === 1
        ? (one.title || one.caption || "افتح التطبيق لمشاهدة القصة")
        : "من مأكولات الياقوت والمرجان";
      await showNote(title, body, "./?open=stories", "yam-story");
    }
    if (newDishes.length) {
      const one = newDishes[0];
      const title = newDishes.length === 1 ? "صنف جديد في القائمة" : newDishes.length + " أصناف جديدة";
      const body = newDishes.length === 1
        ? (one.name || "تمت إضافة صنف جديد")
        : "تمت إضافتها إلى قائمة الياقوت والمرجان";
      await showNote(title, body, "./?open=menu", "yam-menu");
    }
    if (newAlerts.length) {
      const one = newAlerts[0];
      await showNote(one.title, one.body || "", "./?open=alert", "yam-urgent", { urgent: true });
      await notifyClients({
        type: "yam-urgent",
        title: one.title,
        body: one.body || "",
        url: "./?open=alert"
      });
    }
  } catch (err) {}
  } catch (err) {}
}
