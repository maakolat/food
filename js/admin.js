(function () {
  const SESSION = "yam-admin-ok";
  const VAULT = "yam-admin-vault";
  const FAILS = "yam-admin-fails";
  const TOKEN_SESSION = "yam-gh-token";
  const VAPID_SESSION = "yam-vapid-private";
  const loginScreen = document.getElementById("login-screen");
  const adminApp = document.getElementById("admin-app");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const listEl = document.getElementById("admin-list");
  const countEl = document.getElementById("dish-count");
  const modal = document.getElementById("dish-modal");
  const overlay = document.getElementById("overlay");
  const form = document.getElementById("dish-form");
  const toastEl = document.getElementById("toast");
  const variantRows = document.getElementById("variant-rows");

  let catalog = window.MenuStore.load();
  if (!Array.isArray(catalog.stories)) catalog.stories = [];
  let editingId = null;
  let editingStoryId = null;
  let remoteLoaded = false;
  let lastSafeMenuLen = 0;
  const TAB_GUIDES = {
    dishes: "تبويب الأصناف: أضيفي أو عدّلي أكلة واحدة. الحفظ يحدّث هذا الصنف ولا يمسح باقي القائمة.",
    stories: "تبويب الستوري: ارفعي الصورة وانشري. هذا التبويب لا يغيّر الأصناف.",
    alerts: "تبويب الإشعارات: أرسلي خبر عاجل للزبائن. القائمة والستوري يبقون كما هم.",
    status: "تبويب الحالة: عدد الأصناف والستوريات وحالة النشر. التنقل بين التبويبات آمن ولا يحذف بيانات."
  };
  const publishStatus = document.getElementById("publish-status");
  const storyModal = document.getElementById("story-modal");
  const storyForm = document.getElementById("story-form");
  const storiesEl = document.getElementById("admin-stories");

  function imageKey(src) {
    return String(src || "").split("?")[0];
  }

  function dishImage(src) {
    if (window.MenuStore && window.MenuStore.mediaUrl) {
      return window.MenuStore.mediaUrl(src, catalog.updatedAt || 1);
    }
    const s = String(src || "assets/pastry-mix.jpg");
    if (s.indexOf("data:") === 0 || s.indexOf("?") >= 0) return s;
    return s + "?v=" + (catalog.updatedAt || 1);
  }

  function previewEl() {
    return document.getElementById("dish-image-preview");
  }

  function showPreview(src) {
    const img = previewEl();
    if (!img) return;
    if (!src) {
      img.hidden = true;
      img.removeAttribute("src");
      return;
    }
    img.hidden = false;
    img.src = dishImage(src);
  }

  function currentFormImage() {
    return form.dataset.uploadedImage || form.imageUrl.value.trim() || form.image.value.trim() || "";
  }

  function clearUpload() {
    delete form.dataset.uploadedImage;
    form.imageFile.value = "";
  }

  const money = (n) => {
    if (n == null) return "حسب الكمية";
    return `${Number(n).toLocaleString("ar-IQ")} د.ع`;
  };

  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function vaultHex() {
    try { return localStorage.getItem(VAULT) || ""; } catch (err) { return ""; }
  }

  function failState() {
    try { return JSON.parse(localStorage.getItem(FAILS) || "null") || { n: 0, until: 0 }; }
    catch (err) { return { n: 0, until: 0 }; }
  }

  function saveFails(state) {
    try { localStorage.setItem(FAILS, JSON.stringify(state)); } catch (err) {}
  }

  function lockedUntil() {
    const state = failState();
    return Number(state.until || 0);
  }

  function registerFail() {
    const state = failState();
    state.n = Number(state.n || 0) + 1;
    if (state.n >= 5) {
      state.until = Date.now() + 120000;
      state.n = 0;
    }
    saveFails(state);
  }

  function clearFails() {
    try { localStorage.removeItem(FAILS); } catch (err) {}
  }

  function isAuthed() {
    try {
      return sessionStorage.getItem(SESSION) === "1" && !!sessionStorage.getItem(TOKEN_SESSION);
    } catch (err) {
      return false;
    }
  }

  function bundledAuth() {
    return String((window.SITE_CONFIG || {}).githubAuth || "");
  }

  function prepareLoginForm() {
    const setup = !vaultHex() && !bundledAuth();
    const hint = document.getElementById("setup-hint");
    const fields = document.getElementById("setup-fields");
    const resetWrap = document.getElementById("reset-vault-wrap");
    if (hint) hint.hidden = !setup;
    if (fields) fields.hidden = !setup;
    if (resetWrap) resetWrap.hidden = !vaultHex();
    const tokenInput = loginForm.token;
    const pin2 = loginForm.pin2;
    if (tokenInput) tokenInput.required = setup;
    if (pin2) pin2.required = setup;
  }

  function showError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    loginError.hidden = false;
  }

  function showFileOriginHint() {
    const hint = document.getElementById("file-origin-hint");
    if (!hint) return;
    const fileOrigin = window.MenuStore && window.MenuStore.isFileOrigin
      ? window.MenuStore.isFileOrigin()
      : (location.protocol === "file:");
    hint.hidden = !fileOrigin;
  }

  function showApp() {
    loginScreen.hidden = true;
    adminApp.hidden = false;
    fillSelects();
    renderList();
    renderStories();
    renderStatus();
    showTab(currentTab());
  }

  function rememberSafeCatalog() {
    lastSafeMenuLen = (catalog.menu || []).length;
  }

  function currentTab() {
    const hash = String(location.hash || "").replace("#", "");
    if (TAB_GUIDES[hash]) return hash;
    try {
      const saved = sessionStorage.getItem("yam-admin-tab") || "";
      if (TAB_GUIDES[saved]) return saved;
    } catch (err) {}
    return "dishes";
  }

  function showTab(id) {
    const tab = TAB_GUIDES[id] ? id : "dishes";
    document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== "tab-" + tab;
    });
    document.querySelectorAll(".admin-tabs [data-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const guide = document.getElementById("admin-guide");
    if (guide) guide.textContent = TAB_GUIDES[tab];
    try { sessionStorage.setItem("yam-admin-tab", tab); } catch (err) {}
  }

  function renderStatus() {
    const d = document.getElementById("status-dishes");
    const s = document.getElementById("status-stories");
    const a = document.getElementById("status-alert");
    const now = Date.now();
    const liveStories = (catalog.stories || []).filter((x) => Number(x.expiresAt || 0) > now);
    if (d) d.textContent = String((catalog.menu || []).length);
    if (s) s.textContent = String(liveStories.length);
    if (a) {
      const live = window.MenuStore && window.MenuStore.liveAlerts
        ? window.MenuStore.liveAlerts(catalog)
        : ((catalog.alerts || []).concat(catalog.alert ? [catalog.alert] : [])).filter((x) => x && Number(x.expiresAt || 0) > now);
      a.textContent = live.length
        ? (live.length === 1 ? "ظاهر الآن" : live.length + " ظاهرة")
        : "لا يوجد";
    }
    const tabDish = document.getElementById("tab-dish-count");
    const tabStory = document.getElementById("tab-story-count");
    if (tabDish) tabDish.textContent = String((catalog.menu || []).length);
    if (tabStory) tabStory.textContent = String(liveStories.length);
  }

  function showLogin() {
    loginScreen.hidden = false;
    adminApp.hidden = true;
    prepareLoginForm();
  }

  function catLabel(id) {
    const found = catalog.categories.find((c) => c.id === id);
    return found ? found.label : id;
  }

  function fillSelects() {
    if (!form || !form.category) return;
    const cats = catalog.categories || [];
    const cat = form.category;
    cat.innerHTML = cats
      .filter((c) => c.id !== "all")
      .map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`)
      .join("");
    const assets = [];
    (catalog.assets || []).concat((catalog.menu || []).map((item) => item.image)).forEach((src) => {
      const path = imageKey(src);
      if (path && path.indexOf("data:") !== 0 && assets.indexOf(path) < 0) assets.push(path);
    });
    form.image.innerHTML = `<option value="">— اختَر صورة —</option>` +
      assets.map((src) => `<option value="${esc(src)}">${esc(src.replace("assets/", ""))}</option>`).join("");
    const dishList = document.getElementById("alert-dish-list");
    if (dishList) {
      dishList.innerHTML = catalog.menu.map((i) => `<option value="${esc(i.name)}"></option>`).join("");
    }
    renderAlertLast();
  }

  let alertKind = "now";
  let alertTouched = false;

  function composeAlert(kind, dish) {
    const name = String(dish || "").trim();
    const ofDish = name ? "«" + name + "»" : "";
    if (kind === "tomorrow") {
      return {
        title: name ? ("غداً تتوفر " + ofDish) : "غداً على سفرتنا أكلة مميزة",
        body: name
          ? ("بشارة لطيفة: غداً إن شاء الله " + ofDish + " بطعم البيت. احجز من اليوم حتى ما يفوتك.")
          : "بشارة لطيفة: غداً إن شاء الله تتوفر أكلة شهية بطعم البيت. احجز مكانك من اليوم."
      };
    }
    if (kind === "book") {
      return {
        title: name ? ("حجز مباشر على " + ofDish) : "الحجز المباشر مفتوح الآن",
        body: name
          ? ("الكمية محدودة و" + ofDish + " بانتظارك. اطلب من التطبيق والتأكيد يوصلك واتساب.")
          : "الكمية محدودة والحجز مفتوح الآن. افتح التطبيق واطلب، والتأكيد يوصلك واتساب."
      };
    }
    if (kind === "custom") {
      return { title: "", body: "" };
    }
    return {
      title: name ? ("توفّرت " + ofDish + " الآن") : "توفّرت الآن على السفرة",
      body: name
        ? ("يا هلا، " + ofDish + " صارت جاهزة والحجز مباشر. اطلبها قبل ما تخلص — الياقوت والمرجان.")
        : "يا هلا، صنف طازج توفّر الآن والحجز مباشر. اطلبه قبل ما تخلص الكمية — الياقوت والمرجان."
    };
  }

  function fillAlertDraft(force) {
    const titleEl = document.getElementById("alert-title");
    const bodyEl = document.getElementById("alert-body");
    const dishEl = document.getElementById("alert-dish");
    if (!titleEl || !bodyEl) return;
    if (!force && alertTouched) return;
    const drafted = composeAlert(alertKind, dishEl ? dishEl.value : "");
    if (drafted.title || force || alertKind !== "custom") {
      titleEl.value = drafted.title;
      bodyEl.value = drafted.body;
    }
    if (force) alertTouched = false;
  }

  function renderAlertLast() {
    const el = document.getElementById("alert-last");
    if (!el) return;
    const live = window.MenuStore && window.MenuStore.liveAlerts
      ? window.MenuStore.liveAlerts(catalog)
      : [];
    if (!live.length) {
      el.textContent = "ما زال ما انرسل إشعار عاجل.";
      return;
    }
    if (live.length === 1) {
      const when = new Date(live[0].createdAt || Date.now()).toLocaleString("ar-IQ");
      el.textContent = "إشعار ظاهر: «" + live[0].title + "» — " + when;
      return;
    }
    el.textContent = live.length + " إشعارات ظاهرة، تتبدل عند الزبون كل 5 ثوانٍ: " +
      live.map((a) => "«" + a.title + "»").join("، ");
  }

  function renderList() {
    const total = catalog.menu.length;
    countEl.textContent = total + " صنف";
    const tabDish = document.getElementById("tab-dish-count");
    if (tabDish) tabDish.textContent = String(total);
    const q = String((document.getElementById("dish-search") || {}).value || "").trim().toLowerCase();
    const items = catalog.menu.filter((item) => {
      if (!q) return true;
      return `${item.name || ""} ${item.desc || ""} ${catLabel(item.category)}`.toLowerCase().indexOf(q) >= 0;
    });
    if (!total) {
      listEl.innerHTML = `<div class="empty-cart">لا توجد أصناف بعد. اضغط إضافة صنف.</div>`;
      return;
    }
    if (!items.length) {
      listEl.innerHTML = `<div class="empty-cart">لا يوجد صنف بهذا الاسم.</div>`;
      return;
    }
    listEl.innerHTML = items.map((item) => `
      <article class="admin-dish">
        <img src="${esc(dishImage(item.image))}" alt="" onerror="this.onerror=null;this.src='assets/pastry-mix.jpg'">
        <div>
          <strong>${esc(item.name)}</strong>
          <p class="muted">${esc(catLabel(item.category))} · ${item.variants && item.variants.length ? "عدة أحجام" : money(item.price)}</p>
        </div>
        <div class="admin-dish-actions">
          <button class="btn btn-ghost" type="button" data-edit="${esc(item.id)}">تعديل</button>
          <button class="remove-item" type="button" data-del="${esc(item.id)}">حذف</button>
        </div>
      </article>
    `).join("");
  }

  const STORY_KINDS = {
    review: "رأي زبون",
    dish: "أكلة جديدة",
    ad: "إعلان تجاري"
  };
  const STORY_HOURS = { 24: "24 ساعة", 48: "48 ساعة", 72: "72 ساعة", 168: "أسبوع" };

  function storyRemaining(expiresAt) {
    const ms = Number(expiresAt) - Date.now();
    if (ms <= 0) return "منتهٍ — لن يظهر للزبائن";
    const hours = Math.ceil(ms / 3600000);
    if (hours < 24) return "متبقي " + hours + " ساعة";
    const days = Math.ceil(hours / 24);
    return "متبقي " + days + " يوم";
  }

  function renderStories() {
    if (!storiesEl) return;
    if (!Array.isArray(catalog.stories)) catalog.stories = [];
    const list = catalog.stories.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) {
      storiesEl.innerHTML = `<div class="empty-cart">لا يوجد ستوري. اضغط إضافة ستوري وارفع صورة.</div>`;
      renderStatus();
      return;
    }
    storiesEl.innerHTML = list.map((s) => {
      const expired = Number(s.expiresAt) <= Date.now();
      return `
      <article class="admin-dish ${expired ? "admin-story-expired" : ""}">
        <img src="${esc(dishImage(s.image))}" alt="" onerror="this.onerror=null;this.src='assets/pastry-mix.jpg'">
        <div>
          <strong>${esc(s.title || "ستوري")}</strong>
          <p class="muted">${esc(STORY_HOURS[s.durationHours] || "24 ساعة")} · ${esc(storyRemaining(s.expiresAt))}</p>
        </div>
        <div class="admin-dish-actions">
          <button class="btn btn-ghost" type="button" data-edit-story="${esc(s.id)}">تعديل</button>
          <button class="remove-item" type="button" data-del-story="${esc(s.id)}">حذف</button>
        </div>
      </article>`;
    }).join("");
    renderStatus();
  }

  function showStoryPreview(src) {
    const img = document.getElementById("story-image-preview");
    if (!img) return;
    if (!src) {
      img.hidden = true;
      img.removeAttribute("src");
      return;
    }
    img.hidden = false;
    img.src = dishImage(src);
  }

  function openStoryModal(story) {
    editingStoryId = story ? story.id : null;
    document.getElementById("story-form-eyebrow").textContent = story ? "تعديل" : "ستوري جديد";
    document.getElementById("story-form-title").textContent = story ? "تعديل الستوري" : "إضافة ستوري";
    storyForm.reset();
    delete storyForm.dataset.uploadedImage;
    storyForm.elements.namedItem("id").value = story ? story.id : "";
    storyForm.elements.namedItem("title").value = story ? story.title || story.caption || "" : "";
    storyForm.elements.namedItem("durationHours").value = String((story && story.durationHours) || 24);
    showStoryPreview(story ? story.image : "");
    storyModal.classList.add("open");
    storyModal.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeStoryModal() {
    if (!storyModal) return;
    storyModal.classList.remove("open");
    storyModal.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    document.body.style.overflow = "";
    editingStoryId = null;
  }

  function closeAnyModal() {
    if (storyModal && storyModal.classList.contains("open")) closeStoryModal();
    else closeModal();
  }

  function variantRow(v = {}) {
    const wrap = document.createElement("div");
    wrap.className = "admin-variant-row";
    wrap.innerHTML = `
      <input type="text" data-v="label" placeholder="الاسم مثل: الوسط" value="${esc(v.label || "")}" />
      <input type="number" data-v="price" min="0" step="500" placeholder="السعر" value="${v.price != null ? esc(v.price) : ""}" />
      <button type="button" class="remove-item" data-remove-variant>حذف</button>
    `;
    wrap.querySelector("[data-remove-variant]").addEventListener("click", () => wrap.remove());
    return wrap;
  }

  function openModal(item) {
    editingId = item ? item.id : null;
    document.getElementById("dish-form-eyebrow").textContent = item ? "تعديل" : "صنف جديد";
    document.getElementById("dish-form-title").textContent = item ? "تعديل الصنف" : "إضافة صنف";
    form.reset();
    clearUpload();
    form.id.value = item ? item.id : "";
    form.name.value = item ? item.name : "";
    form.desc.value = item ? item.desc || "" : "";
    form.category.value = item ? item.category : (catalog.categories.find((c) => c.id !== "all") || {}).id || "";
    renderExtraChecks(item);
    const rawImage = item ? String(item.image || "") : "";
    const pathOnly = imageKey(rawImage);
    const matchOpt = [...form.image.options].find((o) => o.value && (o.value === rawImage || o.value === pathOnly));
    form.image.value = matchOpt ? matchOpt.value : "";
    form.imageUrl.value = matchOpt ? "" : rawImage;
    form.unit.value = item ? item.unit || "" : "";
    form.kilo.checked = !!(item && item.step);
    form.price.value = item && item.price != null ? item.price : "";
    variantRows.innerHTML = "";
    (item && item.variants ? item.variants : []).forEach((v) => variantRows.appendChild(variantRow(v)));
    showPreview(rawImage || "");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!storyModal || !storyModal.classList.contains("open")) {
      overlay.hidden = true;
      document.body.style.overflow = "";
    }
  }

  function extraCheckRow(id, label, checked, custom) {
    const wrap = document.createElement("label");
    wrap.className = "toggle-extra admin-extra-row";
    wrap.innerHTML = `
      <input type="checkbox" data-extra-id="${esc(id)}" ${checked ? "checked" : ""} ${custom ? 'data-custom="1"' : ""} />
      <span>${esc(label)}</span>
      ${custom ? '<button type="button" class="remove-item" data-remove-extra>إزالة</button>' : ""}
    `;
    const btn = wrap.querySelector("[data-remove-extra]");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        wrap.remove();
      });
    }
    return wrap;
  }

  function renderExtraChecks(item) {
    const box = document.getElementById("extra-checks");
    if (!box) return;
    box.innerHTML = "";
    const defs = (window.YAM_DEFAULT && window.YAM_DEFAULT.extraOptions) || {};
    const selected = (typeof window.YAM_EXTRA_IDS === "function")
      ? window.YAM_EXTRA_IDS(item || { extrasKey: item ? item.extrasKey : "none" })
      : [];
    const custom = (item && item.customExtras) || {};
    Object.keys(defs).forEach((id) => {
      box.appendChild(extraCheckRow(id, defs[id].label, selected.indexOf(id) >= 0, false));
    });
    selected.forEach((id) => {
      if (defs[id]) return;
      const label = (custom[id] && custom[id].label) || id;
      box.appendChild(extraCheckRow(id, label, true, true));
    });
  }

  function collectExtras() {
    const extraIds = [];
    const customExtras = {};
    document.querySelectorAll("#extra-checks [data-extra-id]").forEach((input) => {
      if (!input.checked) return;
      const id = input.getAttribute("data-extra-id");
      extraIds.push(id);
      if (input.getAttribute("data-custom") === "1") {
        const span = (input.closest("label") || {}).querySelector("span");
        customExtras[id] = { type: "toggle", label: span ? span.textContent.trim() : id };
      }
    });
    return { extraIds, customExtras };
  }

  function extrasKeyFromIds(ids) {
    const groups = (window.YAM_DEFAULT && window.YAM_DEFAULT.extraGroups) || {};
    const norm = (arr) => (arr || []).slice().sort().join("|");
    const target = norm(ids);
    const found = Object.keys(groups).find((k) => norm(groups[k]) === target);
    return found || (ids.length ? "custom" : "none");
  }

  function collectVariants() {
    return [...variantRows.querySelectorAll(".admin-variant-row")].map((row, i) => {
      const label = row.querySelector('[data-v="label"]').value.trim();
      const price = Number(row.querySelector('[data-v="price"]').value);
      if (!label || !price) return null;
      return { id: `v${i + 1}`, label, price };
    }).filter(Boolean);
  }

  function setPublishStatus(ok) {
    if (!publishStatus) return;
    publishStatus.textContent = ok
      ? "القائمة منشورة لكل الزبائن. من فعّل الإشعارات يصله خبر الستوري أو الصنف الجديد."
      : "الحفظ على هذا الجهاز فقط. تعذر النشر للزبائن — تحقق من الإنترنت ثم احفظ مرة ثانية.";
  }

  async function persist(opts) {
    const menuLen = (catalog.menu || []).length;
    if (remoteLoaded && lastSafeMenuLen > 0 && menuLen === 0) {
      toast("تم إيقاف الحفظ: القائمة فارغة حتى لا تُحذف أصناف الزبائن");
      return { local: false, remote: false, data: catalog, blocked: true };
    }
    const result = await window.MenuStore.save(catalog);
    if (result.data) catalog = result.data;
    if (!Array.isArray(catalog.stories)) catalog.stories = [];
    fillSelects();
    renderList();
    renderStories();
    renderStatus();
    setPublishStatus(!!result.remote);
    if (result.remote) rememberSafeCatalog();
    if (result.remote === true && opts && opts.notify && window.YamPush) {
      try {
        result.pushed = await window.YamPush.notifyCustomers({
          kind: opts.notify,
          title: opts.title || (opts.notify === "story" ? "ستوري جديد" : "صنف جديد في القائمة"),
          body: opts.body || "من مأكولات الياقوت والمرجان",
          url: opts.notify === "story" ? "./?open=stories" : "./?open=menu",
          tag: opts.notify === "story" ? "yam-story" : "yam-menu"
        });
      } catch (err) {
        console.warn("notify", err);
        result.pushed = 0;
      }
    }
    return result;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = String(new FormData(loginForm).get("pin") || "").trim();
    const pin2 = String(new FormData(loginForm).get("pin2") || "").trim();
    const pasted = String(new FormData(loginForm).get("token") || "").trim();
    loginError.hidden = true;

    if (Date.now() < lockedUntil()) {
      const sec = Math.ceil((lockedUntil() - Date.now()) / 1000);
      showError("محاولات كثيرة. انتظر " + sec + " ثانية ثم أعد المحاولة.");
      return;
    }
    if (pin.length < 8) {
      showError("رمز الدخول يجب أن يكون 8 خانات على الأقل.");
      return;
    }

    let token = "";
    const existing = vaultHex();
    const bundled = bundledAuth();
    if (existing) {
      token = window.MenuStore.decodeAuth(existing, pin);
    } else if (bundled) {
      token = window.MenuStore.decodeAuth(bundled, pin);
    } else {
      if (!pasted) {
        showError("الصق رمز GitHub لأول دخول على هذا الجهاز.");
        return;
      }
      if (pin !== pin2) {
        showError("تأكيد رمز الدخول غير مطابق.");
        return;
      }
      token = pasted;
    }

    const ok = await window.MenuStore.verifyToken(token);
    if (!ok && existing && bundled) {
      token = window.MenuStore.decodeAuth(bundled, pin);
    }
    const verified = ok || await window.MenuStore.verifyToken(token);
    if (!verified) {
      registerFail();
      showError("رمز الدخول غير صحيح.");
      return;
    }

    try {
      localStorage.setItem(VAULT, window.MenuStore.encodeAuth(token, pin));
      sessionStorage.setItem(TOKEN_SESSION, token);
      sessionStorage.setItem(SESSION, "1");
      const vapidAuth = String((window.SITE_CONFIG || {}).vapidAuth || "");
      if (vapidAuth) sessionStorage.setItem(VAPID_SESSION, window.MenuStore.decodeAuth(vapidAuth, pin));
    } catch (err) {
      showError("تعذر حفظ الجلسة على هذا الجهاز.");
      return;
    }
    clearFails();
    loginForm.reset();
    showApp();
    if (window.YamPush) window.YamPush.syncSubs().catch(() => {});
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(SESSION);
      sessionStorage.removeItem(TOKEN_SESSION);
      sessionStorage.removeItem(VAPID_SESSION);
    } catch (err) {}
    showLogin();
  });

  const resetVaultBtn = document.getElementById("reset-vault");
  if (resetVaultBtn) {
    resetVaultBtn.addEventListener("click", () => {
      if (!confirm("سيتم حذف قفل هذا الجهاز فقط. ستحتاج رمز GitHub مرة ثانية.")) return;
      try {
        localStorage.removeItem(VAULT);
        localStorage.removeItem(FAILS);
        sessionStorage.removeItem(SESSION);
        sessionStorage.removeItem(TOKEN_SESSION);
        sessionStorage.removeItem(VAPID_SESSION);
      } catch (err) {}
      prepareLoginForm();
      showError("");
      loginError.hidden = true;
    });
  }

  document.getElementById("add-dish").addEventListener("click", () => openModal(null));
  document.getElementById("close-dish").addEventListener("click", closeModal);
  document.getElementById("add-story").addEventListener("click", () => openStoryModal(null));
  document.getElementById("close-story").addEventListener("click", closeStoryModal);
  overlay.addEventListener("click", closeAnyModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAnyModal(); });

  document.querySelectorAll(".admin-tabs [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.getAttribute("data-tab")));
  });
  window.addEventListener("hashchange", () => {
    const hash = String(location.hash || "").replace("#", "");
    if (TAB_GUIDES[hash]) showTab(hash);
  });
  const dishSearch = document.getElementById("dish-search");
  if (dishSearch) dishSearch.addEventListener("input", () => renderList());

  const alertForm = document.getElementById("alert-form");
  if (alertForm) {
    alertForm.querySelectorAll("[data-alert-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        alertKind = btn.getAttribute("data-alert-kind") || "now";
        alertForm.querySelectorAll("[data-alert-kind]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        fillAlertDraft(true);
      });
    });
    const dishEl = document.getElementById("alert-dish");
    const titleEl = document.getElementById("alert-title");
    const bodyEl = document.getElementById("alert-body");
    if (dishEl) {
      dishEl.addEventListener("input", () => {
        if (alertKind !== "custom") fillAlertDraft(true);
      });
    }
    if (titleEl) titleEl.addEventListener("input", () => { alertTouched = true; });
    if (bodyEl) bodyEl.addEventListener("input", () => { alertTouched = true; });
    fillAlertDraft(true);

    alertForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = String((titleEl && titleEl.value) || "").trim();
      const body = String((bodyEl && bodyEl.value) || "").trim();
      const dish = String((dishEl && dishEl.value) || "").trim();
      const hours = Number((document.getElementById("alert-hours") || {}).value) || 24;
      if (!title || !body) {
        toast("اكتب عنوان الرسالة ونصها");
        return;
      }
      if (!confirm("إرسال الإشعار الآن لكل الزبائن الذين فعّلوا الإشعارات؟")) return;
      const now = Date.now();
      const item = {
        id: "alert-" + now,
        kind: alertKind,
        title,
        body,
        dish,
        hours,
        createdAt: now,
        expiresAt: now + hours * 3600000
      };
      const current = window.MenuStore && window.MenuStore.liveAlerts
        ? window.MenuStore.liveAlerts(catalog)
        : [];
      catalog.alerts = [item].concat(current.filter((a) => a.id !== item.id)).slice(0, 8);
      catalog.alert = item;
      const sendBtn = document.getElementById("send-alert");
      if (sendBtn) sendBtn.disabled = true;
      let result;
      try {
        result = await persist();
        let pushed = 0;
        if (window.YamPush) {
          pushed = await window.YamPush.notifyCustomers({
            urgent: true,
            title,
            body,
            url: "./?open=alert",
            tag: "yam-urgent"
          });
        }
        result.pushed = pushed;
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
      renderAlertLast();
      if (result && result.pushed > 0) {
        toast("وصل الإشعار لـ " + result.pushed + " زبون بجرس الياقوت");
      } else if (result && result.remote) {
        toast("ظهر الشريط على الموقع. يصل الجرس لمن فعّل الإشعارات");
      } else {
        toast("تعذر النشر. تحقق من الإنترنت وأعد الإرسال");
      }
    });

    const clearBtn = document.getElementById("clear-alert");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        if (!catalog.alert && !(catalog.alerts && catalog.alerts.length)) {
          toast("لا يوجد شريط ظاهر حالياً");
          return;
        }
        if (!confirm("إخفاء كل الإشعارات من شريط الموقع؟")) return;
        catalog.alert = null;
        catalog.alerts = [];
        const result = await persist();
        renderAlertLast();
        toast(result.remote ? "اختفى الشريط من الموقع" : "حُذف على هذا الجهاز فقط");
      });
    }
  }

  document.getElementById("add-variant").addEventListener("click", () => {
    variantRows.appendChild(variantRow());
  });

  document.getElementById("add-custom-extra").addEventListener("click", () => {
    const input = document.getElementById("custom-extra-label");
    const label = input ? input.value.trim() : "";
    if (!label) {
      toast("اكتب اسم المربع أولاً");
      return;
    }
    const box = document.getElementById("extra-checks");
    if (box) box.appendChild(extraCheckRow("x" + Date.now(), label, true, true));
    if (input) input.value = "";
  });

  listEl.addEventListener("click", async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) {
      openModal(catalog.menu.find((i) => i.id === editId));
    }
    if (delId) {
      const item = catalog.menu.find((i) => i.id === delId);
      if (!item || !confirm(`حذف «${item.name}»؟`)) return;
      if (remoteLoaded && catalog.menu.length <= 1) {
        toast("لا يمكن حذف آخر صنف حتى تبقى القائمة للزبائن");
        return;
      }
      catalog.menu = catalog.menu.filter((i) => i.id !== delId);
      const result = await persist();
      if (result.blocked) return;
      toast(result.remote ? "تم حذف الصنف من الموقع" : "تم الحذف على هذا الجهاز فقط");
    }
  });

  storiesEl.addEventListener("click", async (e) => {
    const editId = e.target.dataset.editStory;
    const delId = e.target.dataset.delStory;
    if (editId) {
      openStoryModal((catalog.stories || []).find((s) => s.id === editId) || null);
    }
    if (delId) {
      const story = (catalog.stories || []).find((s) => s.id === delId);
      if (!story || !confirm(`حذف ستوري «${story.title || STORY_KINDS[story.kind] || ""}»؟`)) return;
      catalog.stories = (catalog.stories || []).filter((s) => s.id !== delId);
      const result = await persist();
      toast(result.remote ? "تم حذف الستوري من الموقع" : "تم الحذف على هذا الجهاز فقط");
    }
  });

  function compressImage(dataUrl, maxEdge) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = maxEdge || 900;
        const scale = Math.min(1, max / img.width, max / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", maxEdge && maxEdge > 1000 ? 0.78 : 0.72));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  form.image.addEventListener("change", () => {
    clearUpload();
    if (form.image.value) form.imageUrl.value = "";
    showPreview(currentFormImage());
  });

  form.imageUrl.addEventListener("input", () => {
    if (form.imageUrl.value.trim()) {
      clearUpload();
      form.image.value = "";
    }
    showPreview(currentFormImage());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    const variants = collectVariants();
    const priceRaw = form.price.value.trim();
    const uploaded = form.dataset.uploadedImage || "";
    const previous = (catalog.menu.find((i) => i.id === form.id.value) || {}).image || "";
    let image = uploaded || form.imageUrl.value.trim() || form.image.value.trim() || previous;
    if (image && String(image).slice(0, 5) === "data:") {
      image = await compressImage(image);
    }
    if (!image) {
      toast("اختَر صورة أو أدخل رابطاً");
      return;
    }
    const extras = collectExtras();
    const item = {
      id: form.id.value || `dish-${Date.now()}`,
      name: form.name.value.trim(),
      desc: form.desc.value.trim(),
      category: form.category.value,
      extrasKey: extrasKeyFromIds(extras.extraIds),
      extraIds: extras.extraIds,
      image,
      unit: form.unit.value.trim(),
      step: form.kilo.checked ? 0.5 : undefined,
      price: variants.length ? undefined : (priceRaw === "" ? null : Number(priceRaw)),
      variants: variants.length ? variants : undefined
    };
    if (Object.keys(extras.customExtras).length) item.customExtras = extras.customExtras;
    if (uploaded) item._keepImage = previous;
    if (!item.step) delete item.step;
    if (!item.variants) delete item.variants;
    if (item.price == null && !item.variants) item.price = null;

    const idx = catalog.menu.findIndex((i) => i.id === item.id);
    const isNew = idx < 0;
    if (idx >= 0) catalog.menu[idx] = item;
    else catalog.menu.push(item);
    clearUpload();
    if (submitBtn) submitBtn.disabled = true;
    let result;
    try {
      result = await persist(isNew ? {
        notify: "dish",
        title: "صنف جديد في القائمة",
        body: item.name || "تمت إضافة صنف جديد"
      } : undefined);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    closeModal();
    if (!result || result.blocked) return;
    if (result.remote === "images-stripped") {
      toast("تم حفظ الصنف. الصورة الجديدة لم تُرفع — جرّب صورة أصغر أو اختَر صورة جاهزة");
    } else if (result.remote) {
      if (isNew && result.pushed > 0) toast("تم نشر الصنف ووصل إشعار لـ " + result.pushed + " زبون");
      else if (isNew) toast("تم نشر الصنف. من فعّل الإشعارات يصله الخبر على الهاتف");
      else toast("تم تحديث الصنف على الموقع");
    } else {
      toast("حُفظ على هذا الجهاز فقط. تحقق من الإنترنت واحفظ مرة ثانية");
    }
  });

  form.imageFile.addEventListener("change", () => {
    const file = form.imageFile.files[0];
    if (!file) return;
    if (file.size > 6000000) {
      toast("الصورة كبيرة. اختَر صورة أصغر من 6 ميغابايت");
      form.imageFile.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      form.image.value = "";
      form.imageUrl.value = "";
      form.dataset.uploadedImage = await compressImage(reader.result);
      showPreview(form.dataset.uploadedImage);
      toast("تم تجهيز الصورة الجديدة");
    };
    reader.readAsDataURL(file);
  });

  storyForm.elements.namedItem("imageFile").addEventListener("change", () => {
    const file = storyForm.elements.namedItem("imageFile").files[0];
    if (!file) return;
    if (file.size > 8000000) {
      toast("الصورة كبيرة. اختَر صورة أصغر من 8 ميغابايت");
      storyForm.elements.namedItem("imageFile").value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      storyForm.dataset.uploadedImage = await compressImage(reader.result, 1280);
      showStoryPreview(storyForm.dataset.uploadedImage);
      toast("تم تجهيز صورة الستوري");
    };
    reader.readAsDataURL(file);
  });

  storyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = storyForm.querySelector('[type="submit"]');
    const previous = ((catalog.stories || []).find((s) => s.id === storyForm.elements.namedItem("id").value) || {}).image || "";
    let image = storyForm.dataset.uploadedImage || previous;
    if (!image) {
      toast("ارفع صورة للستوري");
      return;
    }
    if (String(image).slice(0, 5) === "data:") {
      image = await compressImage(image, 1280);
    }
    const hours = Number(storyForm.elements.namedItem("durationHours").value) || 24;
    const now = Date.now();
    const storyId = storyForm.elements.namedItem("id").value || ("story-" + now);
    const note = storyForm.elements.namedItem("title").value.trim();
    const story = {
      id: storyId,
      kind: "dish",
      title: note,
      caption: "",
      image,
      durationHours: hours,
      createdAt: editingStoryId
        ? Number(((catalog.stories || []).find((s) => s.id === editingStoryId) || {}).createdAt) || now
        : now,
      expiresAt: now + hours * 3600000,
      updatedAt: now
    };
    if (storyForm.dataset.uploadedImage) story._keepImage = previous;
    if (!Array.isArray(catalog.stories)) catalog.stories = [];
    const idx = catalog.stories.findIndex((s) => s.id === story.id);
    if (idx >= 0) catalog.stories[idx] = story;
    else catalog.stories.unshift(story);
    delete storyForm.dataset.uploadedImage;
    if (submitBtn) submitBtn.disabled = true;
    let result;
    try {
      result = await persist({
        notify: "story",
        title: "ستوري جديد",
        body: note || "افتح التطبيق لمشاهدة القصة"
      });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    closeStoryModal();
    if (!result || result.blocked) return;
    if (result.remote === "images-stripped") {
      toast("حُفظ الستوري. الصورة لم تُرفع — جرّب صورة أصغر");
    } else if (result.remote) {
      if (result.pushed > 0) toast("تم نشر الستوري ووصل إشعار لـ " + result.pushed + " زبون");
      else toast("تم نشر الستوري. من فعّل الإشعارات يصله الخبر على الهاتف");
    } else {
      toast("حُفظ على هذا الجهاز فقط. تحقق من الإنترنت واحفظ مرة ثانية");
    }
  });

  async function init() {
    showFileOriginHint();
    catalog = window.MenuStore.load();
    if (isAuthed()) showApp();
    else showLogin();
    try {
      catalog = await window.MenuStore.loadAsync();
      if (!Array.isArray(catalog.stories)) catalog.stories = [];
      remoteLoaded = !!(catalog.menu && catalog.menu.length);
      rememberSafeCatalog();
      setPublishStatus(true);
      if (isAuthed()) {
        fillSelects();
        renderList();
        renderStories();
        renderStatus();
        showTab(currentTab());
        if (window.YamPush) window.YamPush.syncSubs().catch(() => {});
      }
    } catch (err) {
      console.warn("admin init", err);
      setPublishStatus(false);
    }
  }
  init();
})();
