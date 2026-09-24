window.YAM_STORE_KEY = "yam-menu-v1";
window.YAM_PUB_KEY = "yam-pub-v2";

window.MenuStore = {
  FETCH_MS: 12000,
  defaultData() {
    const src = window.YAM_DEFAULT || { categories: [], menu: [], extras: {}, assets: [] };
    return {
      categories: src.categories.map((c) => Object.assign({}, c)),
      menu: src.menu.map((item) => JSON.parse(JSON.stringify(item))),
      assets: (src.assets || []).slice(),
      stories: Array.isArray(src.stories) ? src.stories.map((s) => Object.assign({}, s)) : []
    };
  },
  repo() {
    return String((window.SITE_CONFIG || {}).githubRepo || "maakolat/food").trim();
  },
  decodeAuth(hex, pin) {
    const key = String(pin || "");
    const h = String(hex || "").replace(/\s/g, "");
    if (!h || !key || h.length % 2) return "";
    let out = "";
    for (let i = 0; i < h.length; i += 2) {
      const code = parseInt(h.substr(i, 2), 16) ^ key.charCodeAt((i / 2) % key.length);
      out += String.fromCharCode(code);
    }
    return out;
  },
  encodeAuth(text, pin) {
    const key = String(pin || "");
    const src = String(text || "");
    if (!src || !key) return "";
    let hex = "";
    for (let i = 0; i < src.length; i++) {
      const code = src.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      hex += (code < 16 ? "0" : "") + code.toString(16);
    }
    return hex;
  },
  token() {
    try {
      return String(sessionStorage.getItem("yam-gh-token") || "").trim();
    } catch (err) {
      return "";
    }
  },
  async verifyToken(token) {
    const t = String(token || "").trim();
    if (!t) return false;
    try {
      const res = await fetch("https://api.github.com/repos/" + this.repo(), {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: "Bearer " + t
        },
        cache: "no-store"
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  },
  cacheUrl(url) {
    if (!url) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
  },
  cleanStories(list) {
    return (Array.isArray(list) ? list : []).map((s) => {
      if (!s || !s.id) return null;
      const hours = Number(s.durationHours) === 168 || Number(s.durationHours) === 72 || Number(s.durationHours) === 48
        ? Number(s.durationHours)
        : 24;
      const createdAt = Number(s.createdAt) || Date.now();
      const expiresAt = Number(s.expiresAt) || (createdAt + hours * 3600000);
      const kind = s.kind === "review" || s.kind === "ad" ? s.kind : "dish";
      return {
        id: String(s.id),
        kind,
        title: String(s.title || "").trim(),
        caption: String(s.caption || "").trim(),
        image: this.mediaUrl(s.image),
        durationHours: hours,
        createdAt,
        expiresAt,
        updatedAt: Number(s.updatedAt) || createdAt
      };
    }).filter((s) => s && s.image);
  },
  cleanAlert(alert) {
    if (!alert || typeof alert !== "object") return null;
    const title = String(alert.title || "").trim().slice(0, 80);
    const body = String(alert.body || "").trim().slice(0, 280);
    if (!title || !body) return null;
    const createdAt = Number(alert.createdAt) || Date.now();
    const hours = Number(alert.hours);
    const keepHours = hours === 6 || hours === 12 || hours === 48 ? hours : 24;
    const kind = alert.kind === "tomorrow" || alert.kind === "book" || alert.kind === "custom"
      ? alert.kind
      : "now";
    return {
      id: String(alert.id || ("alert-" + createdAt)),
      kind,
      title,
      body,
      dish: String(alert.dish || "").trim().slice(0, 60),
      hours: keepHours,
      createdAt,
      expiresAt: Number(alert.expiresAt) || (createdAt + keepHours * 3600000)
    };
  },
  liveAlerts(data) {
    const now = Date.now();
    const seen = {};
    const list = [];
    const add = (item) => {
      const clean = this.cleanAlert(item);
      if (!clean || seen[clean.id]) return;
      if (Number(clean.expiresAt) <= now) return;
      seen[clean.id] = 1;
      list.push(clean);
    };
    (Array.isArray(data && data.alerts) ? data.alerts : []).forEach(add);
    add(data && data.alert);
    list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return list.slice(0, 8);
  },
  attachAlerts(out, data) {
    const alerts = this.liveAlerts(data);
    if (!alerts.length) return out;
    out.alerts = alerts;
    out.alert = alerts[0];
    return out;
  },
  normalize(data) {
    if (!data) return null;
    const inner = data.data && Array.isArray(data.data.menu) ? data.data : data;
    if (!inner || !Array.isArray(inner.menu) || !inner.menu.length) return null;
    const fallback = window.YAM_DEFAULT || {};
    const out = {
      categories: Array.isArray(inner.categories) && inner.categories.length
        ? inner.categories
        : (fallback.categories || []),
      menu: inner.menu.map((item) => {
        const copy = Object.assign({}, item);
        delete copy.extras;
        copy.image = this.mediaUrl(copy.image);
        return copy;
      }),
      assets: (Array.isArray(inner.assets) && inner.assets.length
        ? inner.assets
        : (fallback.assets || [])).map((src) => this.mediaUrl(src)),
      updatedAt: inner.updatedAt || 0
    };
    if (Array.isArray(inner.stories)) out.stories = this.cleanStories(inner.stories);
    return this.attachAlerts(out, inner);
  },
  payload(data, opts) {
    const cleanMenu = (data.menu || []).map((item) => {
      const copy = Object.assign({}, item);
      delete copy.extras;
      copy.image = this.mediaUrl(copy.image);
      return copy;
    });
    const out = {
      categories: data.categories || [],
      menu: cleanMenu,
      assets: data.assets || [],
      stories: this.cleanStories(data.stories),
      updatedAt: (opts && opts.touch) ? Date.now() : (Number(data.updatedAt) || Date.now())
    };
    const alerts = this.liveAlerts(data);
    if (alerts.length) {
      out.alerts = alerts;
      out.alert = alerts[0];
    }
    return out;
  },
  readKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return this.normalize(JSON.parse(raw));
    } catch (err) {
      console.warn("MenuStore.readKey", key, err);
      return null;
    }
  },
  loadLocal() {
    return this.readKey(window.YAM_STORE_KEY);
  },
  loadPublished() {
    return this.readKey(window.YAM_PUB_KEY);
  },
  saveLocal(data) {
    localStorage.setItem(window.YAM_STORE_KEY, JSON.stringify(this.payload(data)));
  },
  savePublished(data) {
    localStorage.setItem(window.YAM_PUB_KEY, JSON.stringify(this.payload(data)));
  },
  loadImmediate() {
    return this.loadPublished() || this.defaultData();
  },
  fingerprint(data) {
    return JSON.stringify({
      menu: (data && data.menu || []).map((item) => ({
        id: item.id,
        name: item.name,
        desc: item.desc,
        image: String(item.image || "").length + ":" + String(item.image || "").slice(-48),
        price: item.price,
        unit: item.unit,
        step: item.step,
        extrasKey: item.extrasKey,
        extraIds: item.extraIds || null,
        customExtras: item.customExtras || null,
        variants: item.variants || null
      })),
      stories: (data && data.stories || []).map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        image: String(s.image || "").length + ":" + String(s.image || "").slice(-48),
        durationHours: s.durationHours,
        expiresAt: s.expiresAt
      })),
      alert: data && data.alert ? { id: data.alert.id, title: data.alert.title, expiresAt: data.alert.expiresAt } : null,
      alerts: (data && data.alerts || []).map((a) => ({ id: a.id, title: a.title, expiresAt: a.expiresAt }))
    });
  },
  overlay(remote, local) {
    if (!remote) return local;
    if (!local) return remote;
    const remoteNewer = Number(remote.updatedAt || 0) >= Number(local.updatedAt || 0);
    const primary = remoteNewer ? remote : local;
    const secondary = remoteNewer ? local : remote;
    const menu = (primary.menu || []).slice();
    const assets = (primary.assets || []).slice();
    (secondary.assets || []).concat(secondary.menu.map((i) => i.image)).forEach((src) => {
      if (src && assets.indexOf(src) < 0 && String(src).indexOf("data:") !== 0) assets.push(src);
    });
    const sourceStories = Array.isArray(primary.stories)
      ? primary.stories
      : (Array.isArray(secondary.stories) ? secondary.stories : []);
    const otherStories = Array.isArray(primary.stories) ? (secondary.stories || []) : [];
    const storyById = {};
    otherStories.forEach((s) => { if (s && s.id) storyById[s.id] = s; });
    sourceStories.forEach((s) => { if (s && s.id) storyById[s.id] = s; });
    const stories = sourceStories.map((s) => storyById[s.id] || s).filter((s) => s && s.id);
    (primary.stories || []).concat(secondary.stories || []).forEach((s) => {
      if (s && s.image && String(s.image).indexOf("data:") !== 0 && assets.indexOf(s.image) < 0) {
        const path = String(s.image).split("?")[0];
        if (path.indexOf("assets/") === 0 && assets.indexOf(path) < 0) assets.push(path);
      }
    });
    const merged = {
      categories: (primary.categories && primary.categories.length) ? primary.categories : secondary.categories,
      menu,
      assets,
      stories,
      updatedAt: Math.max(Number(remote.updatedAt || 0), Number(local.updatedAt || 0))
    };
    this.attachAlerts(merged, {
      alerts: [].concat(primary.alerts || [], secondary.alerts || []),
      alert: primary.alert || secondary.alert
    });
    return merged;
  },
  isFileOrigin() {
    try {
      return location.protocol === "file:";
    } catch (err) {
      return false;
    }
  },
  utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  },
  base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(String(b64 || "").replace(/\s/g, ""))));
  },
  async dataUrlToBase64(dataUrl) {
    const res = await fetch(dataUrl);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },
  ghHeaders() {
    const token = this.token();
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  },
  async fetchJson(url, timeout) {
    const ms = timeout == null ? this.FETCH_MS : timeout;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    try {
      const res = await fetch(this.cacheUrl(url), {
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
  async loadFileCatalog() {
    if (this.isFileOrigin()) return null;
    try {
      return this.normalize(await this.fetchJson("menu.json", 5000));
    } catch (err) {
      return null;
    }
  },
  async loadGithubCatalog() {
    try {
      const meta = await this.getFileMeta("menu.json");
      if (!meta || !meta.content) return null;
      return this.normalize(JSON.parse(this.base64ToUtf8(meta.content)));
    } catch (err) {
      console.warn("MenuStore.loadGithubCatalog", err);
      return null;
    }
  },
  async loadRemote() {
    return (await this.loadFileCatalog()) || (await this.loadGithubCatalog());
  },
  mediaUrl(src, cacheBust) {
    const fallback = "assets/pastry-mix.jpg";
    const s = String(src || fallback);
    if (s.indexOf("data:") === 0) return s;
    const uploads = s.match(/assets\/uploads\/[A-Za-z0-9._-]+/);
    if (uploads) {
      const path = uploads[0];
      const query = s.indexOf("?") >= 0 ? s.slice(s.indexOf("?")) : (cacheBust ? "?v=" + cacheBust : "");
      return "https://raw.githubusercontent.com/" + this.repo() + "/main/" + path + query;
    }
    if (/^https?:\/\//i.test(s)) return s;
    const path = s.split("?")[0];
    const query = s.indexOf("?") >= 0 ? s.slice(s.indexOf("?")) : "";
    if (query) return s;
    return cacheBust ? path + "?v=" + cacheBust : s;
  },
  async getFileMeta(path) {
    const url = "https://api.github.com/repos/" + this.repo() + "/contents/" + path;
    const res = await fetch(url, { headers: this.ghHeaders(), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  },
  async putFile(path, contentBase64, message, opts) {
    const url = "https://api.github.com/repos/" + this.repo() + "/contents/" + path;
    const send = async (sha) => {
      const body = {
        message: message || "Update menu",
        content: contentBase64,
        branch: "main"
      };
      if (sha) body.sha = sha;
      return fetch(url, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, this.ghHeaders()),
        body: JSON.stringify(body)
      });
    };
    let sha = null;
    if (!(opts && opts.newFile)) {
      const meta = await this.getFileMeta(path);
      sha = meta && meta.sha;
    }
    let res = await send(sha);
    if ((res.status === 409 || res.status === 422) && !(opts && opts.newFile && sha)) {
      const meta = await this.getFileMeta(path);
      res = await send(meta && meta.sha);
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error("HTTP " + res.status + " " + errText.slice(0, 180));
    }
    return res.json();
  },
  async publishImages(data) {
    let stripped = false;
    const menu = [];
    const assets = Array.isArray(data.assets) ? data.assets.slice() : [];
    for (let i = 0; i < (data.menu || []).length; i++) {
      const item = Object.assign({}, data.menu[i]);
      const keep = item._keepImage || "";
      delete item._keepImage;
      if (item.image && String(item.image).slice(0, 5) === "data:") {
        try {
          const stamp = Date.now();
          const path = "assets/uploads/" + item.id + "-" + stamp + ".jpg";
          const b64 = await this.dataUrlToBase64(item.image);
          await this.putFile(path, b64, "Update dish photo", { newFile: true });
          item.image = this.mediaUrl(path, stamp);
          if (assets.indexOf(path) < 0) assets.push(path);
        } catch (err) {
          console.warn("MenuStore.publishImages", item.id, err);
          stripped = true;
          item.image = (keep && String(keep).indexOf("data:") !== 0)
            ? keep
            : "assets/pastry-mix.jpg";
        }
      } else if (item.image) {
        item.image = this.mediaUrl(item.image);
        const path = String(item.image).split("?")[0];
        if (path.indexOf("assets/") === 0 && assets.indexOf(path) < 0) assets.push(path);
      }
      menu.push(item);
    }
    const stories = [];
    for (let i = 0; i < (data.stories || []).length; i++) {
      const story = Object.assign({}, data.stories[i]);
      const keep = story._keepImage || "";
      delete story._keepImage;
      if (story.image && String(story.image).slice(0, 5) === "data:") {
        try {
          const stamp = Date.now();
          const path = "assets/uploads/story-" + story.id + "-" + stamp + ".jpg";
          const b64 = await this.dataUrlToBase64(story.image);
          await this.putFile(path, b64, "Update story photo", { newFile: true });
          story.image = this.mediaUrl(path, stamp);
          if (assets.indexOf(path) < 0) assets.push(path);
        } catch (err) {
          console.warn("MenuStore.publishImages story", story.id, err);
          stripped = true;
          if (keep && String(keep).indexOf("data:") !== 0) story.image = keep;
          else continue;
        }
      } else if (story.image) {
        story.image = this.mediaUrl(story.image);
        const path = String(story.image).split("?")[0];
        if (path.indexOf("assets/") === 0 && assets.indexOf(path) < 0) assets.push(path);
      }
      if (story.image && String(story.image).slice(0, 5) !== "data:") stories.push(story);
    }
    return { data: Object.assign({}, data, { menu, assets, stories }), stripped };
  },
  async saveRemote(data, keptAlerts) {
    if (!this.token()) return null;
    try {
      const prepared = await this.publishImages(this.payload(data, { touch: true }));
      const alerts = this.liveAlerts({
        alerts: [].concat(keptAlerts || [], data.alerts || [], prepared.data.alerts || []),
        alert: data.alert || prepared.data.alert
      });
      if (alerts.length) {
        prepared.data.alerts = alerts;
        prepared.data.alert = alerts[0];
      } else {
        delete prepared.data.alerts;
        delete prepared.data.alert;
      }
      const json = JSON.stringify(prepared.data, null, 2);
      await this.putFile("menu.json", this.utf8ToBase64(json), "Publish menu from admin");
      return prepared;
    } catch (err) {
      console.warn("MenuStore.saveRemote", err);
      return null;
    }
  },
  load() {
    return this.loadLocal() || this.loadPublished() || this.defaultData();
  },
  async refreshPublished() {
    const remote = await this.loadRemote();
    if (!remote) return null;
    this.savePublished(remote);
    return remote;
  },
  async loadAsync() {
    const remote = await this.loadRemote();
    const local = this.loadLocal();
    if (remote) {
      this.saveLocal(remote);
      this.savePublished(remote);
      return remote;
    }
    return local || this.defaultData();
  },
  async save(data) {
    const keptAlerts = this.liveAlerts(data);
    const clean = this.payload(data, { touch: true });
    if (keptAlerts.length) {
      clean.alerts = keptAlerts;
      clean.alert = keptAlerts[0];
    }
    this.saveLocal(clean);
    const prepared = await this.saveRemote(clean, keptAlerts);
    if (prepared && prepared.data) {
      if (keptAlerts.length) {
        prepared.data.alerts = this.liveAlerts({
          alerts: keptAlerts.concat(prepared.data.alerts || []),
          alert: prepared.data.alert
        });
        if (prepared.data.alerts[0]) prepared.data.alert = prepared.data.alerts[0];
      }
      this.saveLocal(prepared.data);
      this.savePublished(prepared.data);
      return {
        local: true,
        remote: prepared.stripped ? "images-stripped" : true,
        data: prepared.data
      };
    }
    return { local: true, remote: false, data: clean };
  },
  async reset() {
    localStorage.removeItem(window.YAM_STORE_KEY);
    const fresh = this.defaultData();
    await this.saveRemote(fresh);
    this.saveLocal(fresh);
    this.savePublished(fresh);
    return fresh;
  }
};
