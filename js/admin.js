(function () {
  const SESSION = "yam-admin-ok";
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
  let editingId = null;
  const publishStatus = document.getElementById("publish-status");

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

  function expectedPin() {
    return String((window.SITE_CONFIG || {}).adminPin || "").trim();
  }

  function isAuthed() {
    return sessionStorage.getItem(SESSION) === "1";
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
  }

  function showLogin() {
    loginScreen.hidden = false;
    adminApp.hidden = true;
  }

  function catLabel(id) {
    const found = catalog.categories.find((c) => c.id === id);
    return found ? found.label : id;
  }

  function fillSelects() {
    const cat = form.category;
    cat.innerHTML = catalog.categories
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
  }

  function renderList() {
    countEl.textContent = `${catalog.menu.length} صنف`;
    if (!catalog.menu.length) {
      listEl.innerHTML = `<div class="empty-cart">لا توجد أصناف بعد. اضغط إضافة صنف.</div>`;
      return;
    }
    listEl.innerHTML = catalog.menu.map((item) => `
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
    overlay.hidden = true;
    document.body.style.overflow = "";
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
      ? "القائمة منشورة لكل الزبائن. قد يحتاج الموقع دقيقة حتى يظهر التعديل."
      : "الحفظ على هذا الجهاز فقط. تعذر النشر للزبائن — تحقق من الإنترنت ثم احفظ مرة ثانية.";
  }

  async function persist() {
    const result = await window.MenuStore.save(catalog);
    if (result.data) catalog = result.data;
    fillSelects();
    renderList();
    setPublishStatus(!!result.remote);
    return result;
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = String(new FormData(loginForm).get("pin") || "").trim();
    if (!expectedPin() || pin !== expectedPin()) {
      loginError.hidden = false;
      return;
    }
    sessionStorage.setItem(SESSION, "1");
    loginError.hidden = true;
    showApp();
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION);
    showLogin();
  });

  document.getElementById("add-dish").addEventListener("click", () => openModal(null));
  document.getElementById("close-dish").addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

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

  document.getElementById("reset-menu").addEventListener("click", async () => {
    if (!confirm("استعادة القائمة الأصلية؟ ستُحذف الأصناف التي أضفتها من لوحة التحكم.")) return;
    catalog = await window.MenuStore.reset();
    fillSelects();
    renderList();
    setPublishStatus(true);
    toast("تمت استعادة القائمة الأصلية");
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
      catalog.menu = catalog.menu.filter((i) => i.id !== delId);
      const result = await persist();
      toast(result.remote ? "تم حذف الصنف من الموقع" : "تم الحذف على هذا الجهاز فقط");
    }
  });

  function compressImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / img.width, max / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
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
    if (idx >= 0) catalog.menu[idx] = item;
    else catalog.menu.push(item);
    clearUpload();
    if (submitBtn) submitBtn.disabled = true;
    let result;
    try {
      result = await persist();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    closeModal();
    if (result.remote === "images-stripped") {
      toast("تم حفظ الصنف. الصورة الجديدة لم تُرفع — جرّب صورة أصغر أو اختَر صورة جاهزة");
    } else if (result.remote) {
      toast("تم حفظ الصورة والتعديل. حدّث صفحة الزبائن بعد دقيقة");
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

  async function init() {
    showFileOriginHint();
    catalog = window.MenuStore.load();
    if (isAuthed()) showApp();
    else showLogin();
    try {
      catalog = await window.MenuStore.loadAsync();
      setPublishStatus(true);
      if (isAuthed()) {
        fillSelects();
        renderList();
      }
    } catch (err) {
      console.warn("admin init", err);
      setPublishStatus(false);
    }
  }
  init();
})();
