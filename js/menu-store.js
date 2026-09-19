window.YAM_STORE_KEY = "yam-menu-v1";
window.YAM_PUB_KEY = "yam-pub-v2";

window.MenuStore = {
  FETCH_MS: 12000,
  defaultData() {
    const src = window.YAM_DEFAULT || { categories: [], menu: [], extras: {}, assets: [] };
    return {
      categories: src.categories.map((c) => Object.assign({}, c)),
      menu: src.menu.map((item) => JSON.parse(JSON.stringify(item))),
      assets: (src.assets || []).slice()
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
  normalize(data) {
    if (!data) return null;
    const inner = data.data && Array.isArray(data.data.menu) ? data.data : data;
    if (!inner || !Array.isArray(inner.menu) || !inner.menu.length) return null;
    const fallback = window.YAM_DEFAULT || {};
    return {
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
  },
  payload(data) {
    const cleanMenu = (data.menu || []).map((item) => {
      const copy = Object.assign({}, item);
      delete copy.extras;
      copy.image = this.mediaUrl(copy.image);
      return copy;
    });
    return {
      categories: data.categories || [],
      menu: cleanMenu,
      assets: data.assets || [],
      updatedAt: Date.now()
    };
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
    return JSON.stringify((data && data.menu || []).map((item) => ({
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
    })));
  },
  overlay(remote, local) {
    if (!remote) return local;
    if (!local) return remote;
    const remoteNewer = Number(remote.updatedAt || 0) >= Number(local.updatedAt || 0);
    const primary = remoteNewer ? remote : local;
    const secondary = remoteNewer ? local : remote;
    const byId = {};
    secondary.menu.forEach((item) => { byId[item.id] = item; });
    primary.menu.forEach((item) => { byId[item.id] = item; });
    const seen = {};
    const menu = [];
    primary.menu.forEach((item) => {
      menu.push(byId[item.id]);
      seen[item.id] = true;
    });
    secondary.menu.forEach((item) => {
      if (item && item.id && !seen[item.id]) menu.push(item);
    });
    const assets = (primary.assets || []).slice();
    (secondary.assets || []).concat(secondary.menu.map((i) => i.image)).forEach((src) => {
      if (src && assets.indexOf(src) < 0 && String(src).indexOf("data:") !== 0) assets.push(src);
    });
    return {
      categories: (primary.categories && primary.categories.length) ? primary.categories : secondary.categories,
      menu,
      assets,
      updatedAt: Math.max(Number(remote.updatedAt || 0), Number(local.updatedAt || 0))
    };
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
    return { data: Object.assign({}, data, { menu, assets }), stripped };
  },
  async saveRemote(data) {
    if (!this.token()) return null;
    try {
      const prepared = await this.publishImages(this.payload(data));
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
    const merged = this.overlay(remote, local) || local || this.defaultData();
    const localNewer = local && Number(local.updatedAt || 0) > Number(remote && remote.updatedAt || 0);
    if (localNewer && this.fingerprint(merged) !== this.fingerprint(remote || { menu: [] })) {
      const prepared = await this.saveRemote(merged);
      if (prepared && prepared.data) {
        this.saveLocal(prepared.data);
        this.savePublished(prepared.data);
        return prepared.data;
      }
    }
    this.saveLocal(merged);
    this.savePublished(merged);
    return merged;
  },
  async save(data) {
    const clean = this.payload(data);
    this.saveLocal(clean);
    const prepared = await this.saveRemote(clean);
    if (prepared && prepared.data) {
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
