(function () {
  const SUBS_PATH = "notify-subs.json";
  const VAPID_SESSION = "yam-vapid-private";
  const MAX_SUBS = 250;

  function cfg() {
    return window.SITE_CONFIG || {};
  }

  function topic() {
    return String(cfg().notifyTopic || "").trim();
  }

  function vapidPublic() {
    return String(cfg().vapidPublic || "").trim();
  }

  function vapidPrivate() {
    try { return String(sessionStorage.getItem(VAPID_SESSION) || "").trim(); }
    catch (err) { return ""; }
  }

  function b64urlToBytes(s) {
    const pad = "=".repeat((4 - (String(s).length % 4)) % 4);
    const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/") + pad;
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function bytesToB64url(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function concat() {
    let len = 0;
    for (let i = 0; i < arguments.length; i++) len += arguments[i].length;
    const out = new Uint8Array(len);
    let o = 0;
    for (let i = 0; i < arguments.length; i++) {
      out.set(arguments[i], o);
      o += arguments[i].length;
    }
    return out;
  }

  function strBytes(s) {
    return new TextEncoder().encode(s);
  }

  function u32be(n) {
    return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  }

  async function hmac(keyBytes, data) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  }

  async function hkdf(ikm, salt, info, len) {
    const prk = await hmac(salt, ikm);
    return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);
  }

  async function importVapidSignKey() {
    const pub = b64urlToBytes(vapidPublic());
    const priv = b64urlToBytes(vapidPrivate());
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) {
      throw new Error("vapid-key");
    }
    return crypto.subtle.importKey("jwk", {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: bytesToB64url(priv),
      ext: true
    }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }

  async function makeJwt(aud, signKey) {
    const header = bytesToB64url(strBytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const payload = bytesToB64url(strBytes(JSON.stringify({
      aud: aud,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: "mailto:food@users.noreply.github.com"
    })));
    const unsigned = header + "." + payload;
    const sig = new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signKey,
      strBytes(unsigned)
    ));
    return unsigned + "." + bytesToB64url(sig);
  }

  async function encryptPayload(sub, payloadBytes) {
    const uaPubRaw = b64urlToBytes(sub.keys.p256dh);
    const auth = b64urlToBytes(sub.keys.auth);
    const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
    const uaKey = await crypto.subtle.importKey("raw", uaPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
    const ikm = await hkdf(shared, auth, concat(strBytes("WebPush: info\0"), uaPubRaw, asPub), 32);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(ikm, salt, strBytes("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(ikm, salt, strBytes("Content-Encoding: nonce\0"), 12);
    const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
    const padded = concat(new Uint8Array([2]), payloadBytes);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));
    return concat(salt, u32be(4096), new Uint8Array([asPub.length]), asPub, cipher);
  }

  function subKey(sub) {
    return String((sub && sub.endpoint) || "").trim();
  }

  function validSub(sub) {
    return !!(sub && sub.endpoint && sub.keys && sub.keys.p256dh && sub.keys.auth);
  }

  function mergeSubs(lists) {
    const map = {};
    (lists || []).forEach((list) => {
      (list || []).forEach((sub) => {
        if (!validSub(sub)) return;
        map[subKey(sub)] = {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime || null,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
        };
      });
    });
    return Object.keys(map).map((k) => map[k]).slice(-MAX_SUBS);
  }

  async function harvestNtfy() {
    const t = topic();
    if (!t) return [];
    const url = "https://ntfy.sh/" + encodeURIComponent(t) + "/json?poll=1&since=all";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const found = [];
    text.split("\n").forEach((line) => {
      if (!line.trim()) return;
      try {
        const ev = JSON.parse(line);
        const msg = ev.message || ev.msg || "";
        const sub = typeof msg === "string" ? JSON.parse(msg) : msg;
        if (validSub(sub)) found.push(sub);
      } catch (err) {}
    });
    return found;
  }

  async function loadGithubSubs() {
    if (!window.MenuStore || !window.MenuStore.getFileMeta) return [];
    try {
      const meta = await window.MenuStore.getFileMeta(SUBS_PATH);
      if (!meta || !meta.content) return [];
      const data = JSON.parse(window.MenuStore.base64ToUtf8(meta.content));
      return Array.isArray(data.subs) ? data.subs : (Array.isArray(data) ? data : []);
    } catch (err) {
      return [];
    }
  }

  async function saveGithubSubs(subs) {
    if (!window.MenuStore || !window.MenuStore.putFile) return;
    const json = JSON.stringify({ updatedAt: Date.now(), subs: mergeSubs([subs]) }, null, 2);
    await window.MenuStore.putFile(SUBS_PATH, window.MenuStore.utf8ToBase64(json), "Update notify subscribers");
  }

  async function postPush(endpoint, headers, body) {
    const attempts = [
      endpoint,
      "https://corsproxy.io/?" + encodeURIComponent(endpoint),
      "https://corsproxy.org/?" + encodeURIComponent(endpoint)
    ];
    for (let i = 0; i < attempts.length; i++) {
      try {
        const res = await fetch(attempts[i], {
          method: "POST",
          headers: headers,
          body: body || undefined
        });
        if (res.status) return res.status;
      } catch (err) {}
    }
    return 0;
  }

  async function sendOne(sub, jwt, payloadBytes) {
    const headers = {
      Authorization: "vapid t=" + jwt + ", k=" + vapidPublic(),
      TTL: "86400",
      Urgency: "high"
    };
    if (payloadBytes && payloadBytes.length) {
      try {
        const encrypted = await encryptPayload(sub, payloadBytes);
        const status = await postPush(sub.endpoint, Object.assign({
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream"
        }, headers), encrypted);
        if (status >= 200 && status < 300) return status;
        if (status === 404 || status === 410) return status;
      } catch (err) {}
    }
    return postPush(sub.endpoint, headers, undefined);
  }

  async function collectSubs() {
    const [fresh, stored] = await Promise.all([
      harvestNtfy().catch(() => []),
      loadGithubSubs().catch(() => [])
    ]);
    return mergeSubs([fresh, stored]);
  }

  async function syncSubs() {
    const subs = await collectSubs();
    if (subs.length) {
      try { await saveGithubSubs(subs); } catch (err) {}
    }
    return subs.length;
  }

  async function notifyCustomers(opts) {
    opts = opts || {};
    if (!vapidPublic() || !vapidPrivate()) return 0;
    const subs = await collectSubs();
    if (!subs.length) return 0;
    try { await saveGithubSubs(subs); } catch (err) {}

    const signKey = await importVapidSignKey();
    const jwtByAud = {};
    const payload = strBytes(JSON.stringify({
      title: opts.title || "تحديث من الياقوت والمرجان",
      body: opts.body || "افتح التطبيق",
      url: opts.url || "./",
      tag: opts.tag || "yam-news",
      urgent: !!opts.urgent
    }));

    let sent = 0;
    const gone = {};
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      try {
        const aud = new URL(sub.endpoint).origin;
        if (!jwtByAud[aud]) jwtByAud[aud] = await makeJwt(aud, signKey);
        const status = await sendOne(sub, jwtByAud[aud], payload);
        if (status >= 200 && status < 300) sent += 1;
        if (status === 404 || status === 410) gone[subKey(sub)] = true;
      } catch (err) {}
    }
    const kept = subs.filter((s) => !gone[subKey(s)]);
    if (kept.length !== subs.length) {
      try { await saveGithubSubs(kept); } catch (err) {}
    }
    return sent;
  }

  window.YamPush = {
    syncSubs: syncSubs,
    notifyCustomers: notifyCustomers
  };
})();
