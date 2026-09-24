(function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" }).catch(() => {});
  }
  const money = (n) => {
    if (n == null) return "حسب الكمية";
    return `${Number(n).toLocaleString("ar-IQ")} د.ع`;
  };

  let categories = [];
  let menu = [];
  let stories = [];

  const els = {
    grid: document.getElementById("menu-grid"),
    cats: document.getElementById("category-bar"),
    featured: document.getElementById("featured-row"),
    search: document.getElementById("menu-search"),
    overlay: document.getElementById("overlay"),
    cartDrawer: document.getElementById("cart-drawer"),
    cartItems: document.getElementById("cart-items"),
    cartCount: document.getElementById("cart-count"),
    cartTotal: document.getElementById("cart-total"),
    mobileBar: document.getElementById("mobile-bar"),
    mobileTotal: document.getElementById("mobile-total"),
    itemModal: document.getElementById("item-modal"),
    itemHero: document.getElementById("item-hero"),
    itemTitle: document.getElementById("item-modal-title"),
    itemDesc: document.getElementById("item-modal-desc"),
    itemForm: document.getElementById("item-form"),
    checkoutModal: document.getElementById("checkout-modal"),
    checkoutForm: document.getElementById("checkout-form"),
    checkoutSummary: document.getElementById("checkout-summary"),
    locationBox: document.getElementById("location-box"),
    locationStatus: document.getElementById("location-status"),
    locationPreview: document.getElementById("location-preview"),
    shareLocation: document.getElementById("share-location"),
    toast: document.getElementById("toast"),
    hours: document.getElementById("hours-text")
  };

  let currentCategory = "all";
  let searchQuery = "";
  let editingCartIndex = null;
  let activeItem = null;
  let qty = 1;
  let customerLocation = null;
  const cart = JSON.parse(localStorage.getItem("yam-cart") || "[]");

  const saveCart = () => localStorage.setItem("yam-cart", JSON.stringify(cart));
  const cartQty = () => cart.reduce((s, i) => s + i.qty, 0);
  const cartSum = () => cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);

  function hydrateItem(item) {
    const extras = (typeof window.YAM_EXTRAS_FOR === "function")
      ? window.YAM_EXTRAS_FOR(item)
      : (((window.YAM_DEFAULT && window.YAM_DEFAULT.extras) || {})[item.extrasKey] || {});
    return Object.assign({}, item, { extras });
  }

  let liveAlerts = [];
  let alertIndex = 0;
  let alertTimer = null;
  let chimeAudio = null;

  function playNotifyChime() {
    try {
      if (!chimeAudio) {
        chimeAudio = new Audio("assets/notify-chime.wav?v=61");
        chimeAudio.preload = "auto";
      }
      chimeAudio.currentTime = 0;
      chimeAudio.volume = 0.92;
      const play = chimeAudio.play();
      if (play && play.catch) play.catch(() => {});
    } catch (err) {}
  }

  function applyCatalog(data) {
    categories = (data && data.categories || []).slice();
    menu = (data && data.menu || []).map(hydrateItem);
    stories = (data && data.stories || []).slice();
    liveAlerts = Array.isArray(data && data.alerts) && data.alerts.length
      ? data.alerts.slice()
      : (data && data.alert ? [data.alert] : []);
    renderStories();
    renderAlertBanner();
  }

  function loadCatalog() {
    applyCatalog((window.MenuStore && window.MenuStore.loadImmediate()) || { categories: [], menu: [] });
  }

  function liveAlertList() {
    const now = Date.now();
    return (liveAlerts || []).filter((a) => a && a.title && Number(a.expiresAt || 0) > now);
  }

  function stopAlertRotate() {
    if (alertTimer) {
      clearInterval(alertTimer);
      alertTimer = null;
    }
  }

  function paintAlert(alert) {
    const titleEl = document.getElementById("urgent-title");
    const bodyEl = document.getElementById("urgent-body");
    const cta = document.getElementById("urgent-cta");
    const copy = document.getElementById("urgent-copy");
    if (!alert) return;
    const apply = () => {
      if (titleEl) titleEl.textContent = alert.title;
      if (bodyEl) bodyEl.textContent = alert.body || "";
      if (cta) {
        cta.textContent = alert.kind === "tomorrow" ? "احجز من اليوم" : "اطلب الآن";
        cta.href = "#menu";
      }
      if (copy) copy.classList.remove("is-swap");
    };
    if (copy) {
      copy.classList.add("is-swap");
      setTimeout(apply, 180);
    } else apply();
  }

  function renderAlertDots(list) {
    const dots = document.getElementById("urgent-dots");
    if (!dots) return;
    if (list.length < 2) {
      dots.hidden = true;
      dots.innerHTML = "";
      return;
    }
    dots.hidden = false;
    dots.innerHTML = list.map((_, i) =>
      `<button type="button" class="urgent-dot ${i === alertIndex ? "active" : ""}" data-alert-i="${i}" aria-label="إشعار ${i + 1}"></button>`
    ).join("");
  }

  function showAlertAt(i) {
    const list = liveAlertList();
    const box = document.getElementById("urgent-banner");
    if (!box) return;
    if (!list.length) {
      box.hidden = true;
      stopAlertRotate();
      renderAlertDots([]);
      return;
    }
    alertIndex = ((i % list.length) + list.length) % list.length;
    paintAlert(list[alertIndex]);
    renderAlertDots(list);
    box.hidden = false;
  }

  function startAlertRotate() {
    stopAlertRotate();
    if (liveAlertList().length < 2) return;
    alertTimer = setInterval(() => showAlertAt(alertIndex + 1), 5000);
  }

  function renderAlertBanner() {
    const box = document.getElementById("urgent-banner");
    if (!box) return;
    const list = liveAlertList();
    if (!list.length) {
      box.hidden = true;
      stopAlertRotate();
      renderAlertDots([]);
      return;
    }
    if (alertIndex >= list.length) alertIndex = 0;
    showAlertAt(alertIndex);
    startAlertRotate();
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function renderCategories() {
    els.cats.innerHTML = categories.map((c) =>
      `<button class="cat-btn ${c.id === currentCategory ? "active" : ""}" data-id="${c.id}" type="button">${c.label}</button>`
    ).join("");
  }

  function priceLabel(item) {
    if (item.variants) {
      const min = Math.min(...item.variants.map((v) => v.price));
      return `من ${money(min)}`;
    }
    return money(item.price);
  }

  const IMG_V = Date.now();

  function dishImage(src) {
    if (window.MenuStore && window.MenuStore.mediaUrl) {
      return window.MenuStore.mediaUrl(src, IMG_V);
    }
    const s = String(src || "assets/pastry-mix.jpg");
    if (s.indexOf("data:") === 0 || s.indexOf("?") >= 0) return s;
    return s + "?v=" + IMG_V;
  }

  function renderMenu() {
    const q = searchQuery.trim();
    const items = menu.filter((i) => {
      const inCat = currentCategory === "all" || i.category === currentCategory;
      if (!inCat) return false;
      if (!q) return true;
      const hay = `${i.name || ""} ${i.desc || ""} ${i.unit || ""}`.toLowerCase();
      return hay.indexOf(q.toLowerCase()) >= 0;
    });
    if (!items.length) {
      els.grid.innerHTML = `<div class="empty-search">لا يوجد صنف بهذا الاسم في التصنيف الحالي.</div>`;
      return;
    }
    els.grid.innerHTML = items.map((item) => `
      <article class="dish-card">
        <div class="dish-photo">
          <img src="${dishImage(item.image)}" alt="${item.name}" onerror="this.onerror=null;this.src='assets/pastry-mix.jpg'">
          <span class="dish-badge">${item.unit || (item.variants ? "عدة أحجام" : "حسب الطلب")}</span>
        </div>
        <div class="dish-body">
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
          <div class="price">${priceLabel(item)}</div>
          <button class="btn btn-primary" data-add="${item.id}" type="button">أضف للسلة</button>
        </div>
      </article>
    `).join("");
  }

  function featuredItems() {
    const ids = ["pastry-mix", "dolma", "kleija-free-fat", "kabsa"];
    const picked = ids.map((id) => menu.find((i) => i.id === id)).filter(Boolean);
    return picked.length ? picked : menu.slice(0, 4);
  }

  function renderFeatured() {
    if (!els.featured) return;
    const items = featuredItems();
    if (!items.length) {
      els.featured.innerHTML = "";
      return;
    }
    els.featured.innerHTML = items.map((item) => `
      <button class="featured-card" type="button" data-add="${item.id}" aria-label="أضف ${item.name}">
        <img src="${dishImage(item.image)}" alt="" onerror="this.onerror=null;this.src='assets/pastry-mix.jpg'">
        <div>
          <strong>${item.name}</strong>
          <span>${priceLabel(item)}</span>
        </div>
      </button>
    `).join("");
  }

  const STORY_KIND_LABEL = { review: "رأي زبون", dish: "أكلة جديدة", ad: "إعلان" };
  const STORY_SEEN_KEY = "yam-story-seen-v1";
  const STORY_MS = 5500;
  let storyIndex = 0;
  let storyTimer = null;
  let storyPaused = false;
  let storyStartedAt = 0;
  let storyElapsed = 0;

  function readStorySeen() {
    try { return JSON.parse(localStorage.getItem(STORY_SEEN_KEY) || "{}") || {}; }
    catch (err) { return {}; }
  }

  function markStorySeen(id) {
    const seen = readStorySeen();
    seen[id] = Date.now();
    try { localStorage.setItem(STORY_SEEN_KEY, JSON.stringify(seen)); } catch (err) {}
  }

  function activeStories() {
    const now = Date.now();
    return (stories || [])
      .filter((s) => s && s.image && Number(s.expiresAt || 0) > now)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function renderStories() {
    const strip = document.getElementById("stories-strip");
    const row = document.getElementById("stories-row");
    if (!strip || !row) return;
    const list = activeStories();
    strip.hidden = !list.length;
    if (!list.length) {
      row.innerHTML = "";
      return;
    }
    const seen = readStorySeen();
    row.innerHTML = list.map((s, i) => {
      const unseen = !seen[s.id] || Number(seen[s.id]) < Number(s.updatedAt || s.createdAt || 0);
      return `
        <button class="story-ring ${unseen ? "unseen" : "seen"}" type="button" data-story-index="${i}">
          <span class="story-ring-frame">
            <span class="story-ring-photo">
              <img src="${dishImage(s.image)}" alt="" onerror="this.onerror=null;this.src='assets/pastry-mix.jpg'">
            </span>
          </span>
          <small>${s.title || ""}</small>
        </button>`;
    }).join("");
  }

  function storyProgressHtml(list, index) {
    return list.map((_, i) =>
      `<span class="story-bar ${i < index ? "done" : ""} ${i === index ? "active" : ""}"><i></i></span>`
    ).join("");
  }

  function storyTimeLabel(createdAt) {
    const mins = Math.max(1, Math.round((Date.now() - Number(createdAt || Date.now())) / 60000));
    if (mins < 60) return mins + " د";
    return Math.round(mins / 60) + " س";
  }

  function fillStory(s) {
    const photo = document.getElementById("story-photo");
    const avatar = document.getElementById("story-avatar");
    const src = dishImage(s.image);
    photo.src = src;
    if (avatar) avatar.src = src;
    const label = (s.title || s.caption || "").trim();
    document.getElementById("story-title").textContent = label;
    document.getElementById("story-kind").textContent = storyTimeLabel(s.createdAt);
    const cap = document.getElementById("story-caption");
    if (cap) {
      cap.textContent = "";
      cap.hidden = true;
    }
    const input = document.getElementById("story-reply-input");
    if (input) input.value = "";
  }

  function showStoryAt(index) {
    const list = activeStories();
    const viewer = document.getElementById("story-viewer");
    if (!viewer || !list.length) {
      closeStoryViewer();
      return;
    }
    if (index >= list.length) {
      closeStoryViewer();
      renderStories();
      return;
    }
    if (index < 0) index = 0;
    storyIndex = index;
    const s = list[storyIndex];
    markStorySeen(s.id);
    document.getElementById("story-progress").innerHTML = storyProgressHtml(list, storyIndex);
    fillStory(s);
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    restartStoryTimer();
    renderStories();
  }

  function nextStory() {
    showStoryAt(storyIndex + 1);
  }

  function prevStory() {
    if (storyIndex <= 0) {
      restartStoryTimer();
      return;
    }
    showStoryAt(storyIndex - 1);
  }

  function clearStoryTimer() {
    if (storyTimer) {
      clearTimeout(storyTimer);
      storyTimer = null;
    }
  }

  function restartStoryTimer() {
    clearStoryTimer();
    storyPaused = false;
    storyElapsed = 0;
    storyStartedAt = Date.now();
    const bars = document.querySelectorAll("#story-progress .story-bar.active i");
    bars.forEach((el) => {
      el.style.animation = "none";
      el.offsetHeight;
      el.style.animation = "";
    });
    storyTimer = setTimeout(nextStory, STORY_MS);
  }

  function pauseStory() {
    if (storyPaused) return;
    const viewer = document.getElementById("story-viewer");
    if (!viewer || viewer.hidden) return;
    storyPaused = true;
    storyElapsed += Date.now() - storyStartedAt;
    clearStoryTimer();
    document.querySelectorAll("#story-progress .story-bar.active i").forEach((el) => {
      el.style.animationPlayState = "paused";
    });
  }

  function resumeStory() {
    if (!storyPaused) return;
    const viewer = document.getElementById("story-viewer");
    if (!viewer || viewer.hidden) return;
    storyPaused = false;
    storyStartedAt = Date.now();
    const left = Math.max(80, STORY_MS - storyElapsed);
    document.querySelectorAll("#story-progress .story-bar.active i").forEach((el) => {
      el.style.animationPlayState = "running";
    });
    storyTimer = setTimeout(nextStory, left);
  }

  function closeStoryViewer() {
    clearStoryTimer();
    const viewer = document.getElementById("story-viewer");
    if (viewer) viewer.hidden = true;
    document.body.style.overflow = "";
  }

  function storyImageLink(src) {
    const s = String(src || "");
    if (!s || s.indexOf("data:") === 0) return "";
    if (window.MenuStore && window.MenuStore.mediaUrl) {
      return window.MenuStore.mediaUrl(s).split("?")[0];
    }
    if (/^https?:\/\//i.test(s)) return s.split("?")[0];
    return s.split("?")[0];
  }

  function replyToStory() {
    const cfg = window.SITE_CONFIG || {};
    const input = document.getElementById("story-reply-input");
    const typed = input ? input.value.trim() : "";
    const current = activeStories()[storyIndex];
    const lines = ["رد على قصة"];
    if (current) {
      const title = (current.title || current.caption || "").trim();
      if (title) lines.push("العنوان: " + title);
      const img = storyImageLink(current.image);
      if (img) lines.push("الصورة: " + img);
    }
    if (typed) lines.push("", typed);
    const text = encodeURIComponent(lines.join("\n"));
    const raw = String(cfg.whatsapp || "").replace(/[^\d]/g, "");
    window.location.assign(raw ? `https://wa.me/${raw}?text=${text}` : `https://wa.me/?text=${text}`);
  }

  function bindStories() {
    const row = document.getElementById("stories-row");
    const viewer = document.getElementById("story-viewer");
    const stage = document.getElementById("story-stage") || viewer;
    if (row) {
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-story-index]");
        if (!btn) return;
        showStoryAt(Number(btn.getAttribute("data-story-index")) || 0);
      });
    }
    const closeBtn = document.getElementById("story-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeStoryViewer();
      });
      closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    }
    const reply = document.getElementById("story-reply");
    if (reply) {
      ["pointerdown", "pointerup", "pointermove", "click"].forEach((ev) => {
        reply.addEventListener(ev, (e) => e.stopPropagation());
      });
      reply.addEventListener("pointerdown", pauseStory);
      reply.addEventListener("submit", (e) => {
        e.preventDefault();
        e.stopPropagation();
        replyToStory();
      });
      const input = document.getElementById("story-reply-input");
      if (input) input.addEventListener("focus", pauseStory);
    }
    let pressX = 0;
    let pressY = 0;
    let pressT = 0;
    let moved = false;
    let holding = false;
    if (stage) {
      stage.addEventListener("pointerdown", (e) => {
        if (e.target.closest && (e.target.closest("#story-close") || e.target.closest("#story-reply"))) return;
        pressX = e.clientX;
        pressY = e.clientY;
        pressT = Date.now();
        moved = false;
        holding = true;
        pauseStory();
      });
      stage.addEventListener("pointermove", (e) => {
        if (!holding) return;
        if (Math.abs(e.clientX - pressX) > 12 || Math.abs(e.clientY - pressY) > 12) moved = true;
      });
      stage.addEventListener("pointerup", (e) => {
        if (!holding) return;
        holding = false;
        if (viewer.hidden) return;
        const dx = e.clientX - pressX;
        const dy = e.clientY - pressY;
        const held = Date.now() - pressT;
        if (moved && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) nextStory();
          else prevStory();
          return;
        }
        if (!moved && held < 350) {
          const rect = stage.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < rect.width * 0.32) prevStory();
          else nextStory();
          return;
        }
        resumeStory();
      });
      stage.addEventListener("pointercancel", () => {
        holding = false;
        resumeStory();
      });
    }
    document.addEventListener("keydown", (e) => {
      const open = document.getElementById("story-viewer");
      if (!open || open.hidden) return;
      if (e.key === "Escape") closeStoryViewer();
      if (e.key === "ArrowLeft") nextStory();
      if (e.key === "ArrowRight") prevStory();
    });
  }

  function selectedPrice(item, form) {
    if (item.variants) {
      const id = form.querySelector("[name=variant]:checked").value;
      return item.variants.find((v) => v.id === id).price;
    }
    return item.price;
  }

  function selectedVariantLabel(item, form) {
    if (!item.variants) return item.unit || "";
    const id = form.querySelector("[name=variant]:checked").value;
    return item.variants.find((v) => v.id === id).label;
  }

  function extrasFromForm(item, form) {
    const chosen = [];
    Object.entries(item.extras || {}).forEach(([key, extra]) => {
      if (extra.type === "radio") {
        const val = form.querySelector(`[name="${key}"]:checked`);
        if (val) chosen.push(`${extra.label}: ${val.value}`);
      } else if (form.querySelector(`[name="${key}"]`)?.checked) {
        chosen.push(extra.label);
      }
    });
    const note = form.querySelector("[name=note]")?.value.trim();
    if (note) chosen.push(`ملاحظة: ${note}`);
    return chosen;
  }

  function extraStateFromForm(item, form) {
    const state = {};
    Object.entries(item.extras || {}).forEach(([key, extra]) => {
      if (extra.type === "radio") {
        const val = form.querySelector(`[name="${key}"]:checked`);
        state[key] = val ? val.value : "";
      } else {
        state[key] = !!form.querySelector(`[name="${key}"]`)?.checked;
      }
    });
    return state;
  }

  function applyCartLineToForm(item, line) {
    const form = els.itemForm;
    if (!form || !line) return;
    if (item.variants) {
      const vid = line.variantId || ((item.variants.find((v) => v.label === line.variant) || {}).id);
      const radio = vid ? form.querySelector(`[name="variant"][value="${vid}"]`) : null;
      if (radio) radio.checked = true;
    }
    const state = line.extraState || {};
    Object.entries(item.extras || {}).forEach(([key, extra]) => {
      if (extra.type === "radio") {
        const el = state[key] ? form.querySelector(`[name="${key}"][value="${state[key]}"]`) : null;
        if (el) el.checked = true;
        return;
      }
      const box = form.querySelector(`[name="${key}"]`);
      if (!box) return;
      if (Object.prototype.hasOwnProperty.call(state, key)) box.checked = !!state[key];
      else if (Array.isArray(line.extras)) box.checked = line.extras.indexOf(extra.label) >= 0;
    });
    const noteEl = form.querySelector("[name=note]");
    if (noteEl) {
      if (line.note) noteEl.value = line.note;
      else if (Array.isArray(line.extras)) {
        const found = line.extras.find((x) => String(x).indexOf("ملاحظة:") === 0);
        if (found) noteEl.value = String(found).replace(/^ملاحظة:\s*/, "");
      }
    }
    qty = Number(line.qty) || 1;
    const step = item.step || 1;
    if (step < 1) qty = Math.round(qty * 10) / 10;
    const qtyEl = document.getElementById("qty-val");
    if (qtyEl) qtyEl.textContent = qty;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.textContent = "حفظ التعديل";
  }

  function renderItemForm(item) {
    qty = item.step ? 1 : 1;
    const variants = item.variants
      ? `<fieldset class="choice-row"><legend>الحجم / النوع</legend>${item.variants.map((v, i) =>
          `<label class="chip"><input type="radio" name="variant" value="${v.id}" ${i === 0 ? "checked" : ""} /> ${v.label}</label>`
        ).join("")}</fieldset>`
      : "";

    const extraFields = Object.entries(item.extras || {}).map(([key, extra]) => {
      if (extra.type === "radio") {
        return extra.options.map((o) =>
          `<label class="toggle-extra">
            <input type="radio" name="${key}" value="${o.value || o.label}" ${o.checked ? "checked" : ""} />
            <span>${o.label}</span>
          </label>`
        ).join("");
      }
      return `<label class="toggle-extra">
        <input type="checkbox" name="${key}" ${extra.checked ? "checked" : ""} />
        <span>${extra.label}${extra.hint ? ` <small class="muted">${extra.hint}</small>` : ""}</span>
      </label>`;
    }).join("");

    const unit = item.unit === "كيلو" || item.step ? "كيلو" : "كمية";
    els.itemForm.innerHTML = `
      ${variants}
      <div class="qty-row">
        <span>${unit}</span>
        <div class="qty-controls">
          <button type="button" data-qty="-">−</button>
          <strong id="qty-val">1</strong>
          <button type="button" data-qty="+">+</button>
        </div>
      </div>
      ${extraFields}
      <label>ملاحظات على هذا الصنف
        <textarea name="note" rows="2" placeholder="مثال: خبز نعم/لا، توصيل الساعة 7..."></textarea>
      </label>
      <button class="btn btn-primary btn-block" type="submit">إضافة إلى السلة</button>
    `;
  }

  function openItem(item, cartLine) {
    if (!cartLine) editingCartIndex = null;
    activeItem = item;
    els.itemTitle.textContent = item.name;
    els.itemDesc.textContent = item.desc;
    els.itemHero.style.backgroundImage = `url("${dishImage(item.image)}")`;
    els.itemHero.style.backgroundSize = "cover";
    els.itemHero.style.backgroundPosition = "center";
    renderItemForm(item);
    if (cartLine) applyCartLineToForm(item, cartLine);
    els.itemModal.classList.add("open");
    els.itemModal.setAttribute("aria-hidden", "false");
    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModals() {
    els.itemModal.classList.remove("open");
    els.itemModal.setAttribute("aria-hidden", "true");
    els.checkoutModal.classList.remove("open");
    els.checkoutModal.setAttribute("aria-hidden", "true");
    els.cartDrawer.classList.remove("open");
    els.cartDrawer.setAttribute("aria-hidden", "true");
    const mapModal = document.getElementById("map-modal");
    if (mapModal) {
      mapModal.classList.remove("open");
      mapModal.setAttribute("aria-hidden", "true");
    }
    els.overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function openCart() {
    renderCart();
    els.cartDrawer.classList.add("open");
    els.cartDrawer.setAttribute("aria-hidden", "false");
    els.overlay.hidden = false;
    els.itemModal.classList.remove("open");
    els.checkoutModal.classList.remove("open");
    document.body.style.overflow = "hidden";
  }

  function renderCart() {
    els.cartCount.textContent = cartQty();
    const total = money(cartSum());
    els.cartTotal.textContent = total;
    els.mobileTotal.textContent = total;
    els.mobileBar.hidden = cart.length === 0;

    if (!cart.length) {
      els.cartItems.innerHTML = `<div class="empty-cart">سلتك فارغة. اختر من القائمة ما لذّ وطاب.</div>`;
      return;
    }

    els.cartItems.innerHTML = cart.map((item, idx) => `
      <div class="cart-item${item.custom ? " is-custom" : ""}">
        <div class="cart-item-top">
          <h4>${item.name}</h4>
          <div class="cart-item-actions">
            <button class="cart-edit" type="button" data-edit="${idx}">تعديل</button>
            <button class="remove-item" data-remove="${idx}" type="button">حذف</button>
          </div>
        </div>
        <div>${item.variant || ""}</div>
        <div class="extras">${(item.extras || []).join(" · ") || "بدون إضافات"}</div>
        <div class="cart-item-foot">
          ${item.custom ? `<span class="muted">يُؤكد السعر عبر واتساب</span>` : `<div class="cart-qty">
            <button type="button" data-cart-qty="${idx}" data-dir="-" aria-label="إنقاص الكمية">−</button>
            <strong>${item.qty}</strong>
            <button type="button" data-cart-qty="${idx}" data-dir="+" aria-label="زيادة الكمية">+</button>
          </div>`}
          <div class="price">${item.price == null ? "حسب الكمية" : `${item.qty} × ${money(item.price)}`}</div>
        </div>
      </div>
    `).join("");
  }

  function changeCartQty(idx, dir) {
    const line = cart[idx];
    if (!line) return;
    const catalogItem = menu.find((i) => i.id === line.id);
    const step = line.step || (catalogItem && catalogItem.step) || 1;
    let next = Number(line.qty || 0) + (dir === "+" ? step : -step);
    next = Math.max(step, next);
    if (step < 1) next = Math.round(next * 10) / 10;
    line.qty = next;
    saveCart();
    renderCart();
  }

  function editCartItem(idx) {
    const line = cart[idx];
    if (line && line.custom) {
      editingCartIndex = idx;
      fillSpecialForm(line);
      closeModals();
      editingCartIndex = idx;
      const section = document.getElementById("special-order");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("عدّل الطلب الخاص ثم احفظه");
      return;
    }
    const item = line && menu.find((i) => i.id === line.id);
    if (!item) {
      toast("تعذر تعديل هذا الصنف");
      return;
    }
    editingCartIndex = idx;
    els.cartDrawer.classList.remove("open");
    els.cartDrawer.setAttribute("aria-hidden", "true");
    openItem(item, line);
  }

  function specialEntryFromForm(form) {
    const desc = String(form.desc.value || "").trim();
    const servings = String(form.servings.value || "").trim();
    const occasion = String(form.occasion.value || "").trim();
    const note = String(form.note.value || "").trim();
    const extras = [];
    extras.push(desc);
    if (servings) extras.push("الكمية: " + servings);
    if (occasion) extras.push("المناسبة: " + occasion);
    if (note) extras.push("ملاحظة: " + note);
    return {
      id: "custom-" + Date.now(),
      name: "أكل خاص",
      variant: occasion,
      extras,
      extraState: {},
      note,
      custom: true,
      customDesc: desc,
      customServings: servings,
      customOccasion: occasion,
      qty: 1,
      step: 1,
      price: null
    };
  }

  function fillSpecialForm(line) {
    const form = document.getElementById("special-form");
    if (!form) return;
    form.desc.value = line.customDesc || "";
    form.servings.value = line.customServings || "";
    form.occasion.value = line.customOccasion || "";
    form.note.value = line.note || "";
    const title = document.getElementById("special-form-title");
    const btn = document.getElementById("special-submit");
    if (title) title.textContent = "تعديل الطلب الخاص";
    if (btn) btn.textContent = "حفظ الطلب الخاص";
  }

  function resetSpecialForm() {
    const form = document.getElementById("special-form");
    if (!form) return;
    form.reset();
    const title = document.getElementById("special-form-title");
    const btn = document.getElementById("special-submit");
    if (title) title.textContent = "أكل غير موجود في القائمة";
    if (btn) btn.textContent = "أضف الطلب الخاص إلى السلة";
  }

  function addToCart(item, form) {
    const note = form.querySelector("[name=note]")?.value.trim() || "";
    const variantInput = item.variants ? form.querySelector("[name=variant]:checked") : null;
    const entry = {
      id: item.id,
      name: item.name,
      variant: selectedVariantLabel(item, form),
      variantId: variantInput ? variantInput.value : "",
      extras: extrasFromForm(item, form),
      extraState: extraStateFromForm(item, form),
      note,
      qty,
      step: item.step || 1,
      price: selectedPrice(item, form)
    };
    const wasEdit = editingCartIndex != null && cart[editingCartIndex];
    if (wasEdit) cart[editingCartIndex] = entry;
    else cart.push(entry);
    editingCartIndex = null;
    saveCart();
    renderCart();
    closeModals();
    if (wasEdit) openCart();
    toast(wasEdit ? "تم تعديل الطلب في السلة" : "تمت إضافة الصنف إلى السلة");
  }

  function mapsUrl(lat, lng) {
    return `https://maps.google.com/?q=${lat},${lng}`;
  }

  function setLocationStatus(text, kind) {
    if (!els.locationStatus) return;
    els.locationStatus.textContent = text;
    els.locationStatus.classList.remove("ok", "err");
    if (kind) els.locationStatus.classList.add(kind);
    if (els.locationBox) els.locationBox.classList.toggle("is-set", kind === "ok");
  }

  function applyLocation(lat, lng) {
    const url = mapsUrl(lat, lng);
    customerLocation = { lat, lng, url };
    setLocationStatus("تم تحديد الموقع", "ok");
    if (els.locationPreview) {
      els.locationPreview.href = url;
      els.locationPreview.classList.add("is-visible");
    }
    if (els.shareLocation) els.shareLocation.textContent = "إعادة تحديد موقعي";
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("المتصفح لا يدعم تحديد الموقع", "err");
      toast("جهازك أو متصفحك لا يدعم تحديد الموقع");
      return;
    }
    setLocationStatus("جارٍ تحديد الموقع...", "");
    if (els.shareLocation) els.shareLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (els.shareLocation) els.shareLocation.disabled = false;
        applyLocation(pos.coords.latitude, pos.coords.longitude);
        toast("تم حفظ موقعك مع الطلب");
      },
      (err) => {
        if (els.shareLocation) els.shareLocation.disabled = false;
        const msg = err.code === 1
          ? "المتصفح رفض صلاحية الموقع. اسمح بالموقع ثم أعد المحاولة"
          : "تعذر تحديد الموقع. حاول مرة أخرى";
        setLocationStatus("لم يُحدَّد الموقع", "err");
        toast(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function renderCheckoutSummary() {
    const lines = cart.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} × ${i.qty}`).join("<br>");
    const pending = cart.some((i) => i.price == null);
    els.checkoutSummary.innerHTML = `${lines}<br><strong>المجموع: ${money(cartSum())}</strong>${pending ? "<br>بعض الأصناف سعرها حسب الكمية ويُؤكد عبر واتساب." : ""}`;
  }

  function buildWhatsappMessage(data) {
    const cfg = window.SITE_CONFIG || {};
    const lines = [
      `طلب جديد من موقع ${cfg.businessName || "مأكولات الياقوت والمرجان"}`,
      "",
      `الاسم: ${data.name}`,
      `الهاتف: ${data.phone}`,
      `العنوان: ${data.address}`,
      data.locationUrl ? `الموقع على الخريطة: ${data.locationUrl}` : "الموقع: لم يُحدَّد",
      `الاستلام: ${data.fulfillment}`,
      `خبز: ${data.bread || "لم يُحدَّد"}`,
      data.notes ? `ملاحظات: ${data.notes}` : "",
      "",
      "الطلب:"
    ].filter((x, i, arr) => x !== "" || arr[i - 1] !== "");

    cart.forEach((item, i) => {
      if (item.custom) {
        lines.push(`${i + 1}) أكل خاص`);
        if (item.customDesc) lines.push(`   الوصف: ${item.customDesc}`);
        if (item.customServings) lines.push(`   الكمية: ${item.customServings}`);
        if (item.customOccasion) lines.push(`   المناسبة: ${item.customOccasion}`);
        if (item.note) lines.push(`   ملاحظة: ${item.note}`);
        lines.push("   السعر: يُؤكد عبر واتساب");
        return;
      }
      lines.push(`${i + 1}) ${item.name}`);
      if (item.variant) lines.push(`   النوع: ${item.variant}`);
      lines.push(`   الكمية: ${item.qty}`);
      if (item.extras && item.extras.length) lines.push(`   الإضافات: ${item.extras.join("، ")}`);
      lines.push(`   السعر: ${item.price == null ? "حسب الكمية" : money(item.price)}`);
    });
    lines.push("", `المجموع التقريبي: ${money(cartSum())}`);
    return lines.join("\n");
  }

  function sendWhatsapp(data) {
    sendWhatsappText(buildWhatsappMessage(data));
  }

  const deliveryPins = { from: null, to: null };

  function haversineKm(a, b) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function setPinStatus(kind, text, state) {
    const status = document.getElementById("delivery-" + kind + "-status");
    const box = document.getElementById("delivery-" + kind + "-box");
    if (status) {
      status.textContent = text;
      status.classList.remove("ok", "err");
      if (state) status.classList.add(state);
    }
    if (box) box.classList.toggle("is-set", state === "ok");
  }

  function applyDeliveryPin(kind, lat, lng) {
    const url = mapsUrl(lat, lng);
    deliveryPins[kind] = { lat, lng, url };
    setPinStatus(kind, "تم تحديد الموقع", "ok");
    fillCoordInputs(kind, lat, lng);
    const preview = document.getElementById("delivery-" + kind + "-preview");
    if (preview) {
      preview.href = url;
      preview.classList.add("is-visible");
    }
  }

  function fillCoordInputs(kind, lat, lng) {
    const el = document.getElementById("delivery-" + kind + "-pair");
    if (el) el.value = Number(lat).toFixed(6) + ", " + Number(lng).toFixed(6);
  }

  function arabicDigits(value) {
    return String(value || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  }

  function parseCoordPair(raw) {
    const s = arabicDigits(raw).replace(/[،]/g, ",").trim();
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < 29 || lat > 38 || lng < 38 || lng > 49) return null;
    return { lat, lng };
  }

  function readCoords(kind) {
    return parseCoordPair(document.getElementById("delivery-" + kind + "-pair")?.value);
  }

  function pinFromCoords(kind) {
    const pair = readCoords(kind);
    if (!pair) {
      toast("أدخل الإحداثيات كاملة مثل 32.609251, 44.015284");
      setPinStatus(kind, "الإحداثيات غير صحيحة", "err");
      return;
    }
    applyDeliveryPin(kind, pair.lat, pair.lng);
    toast(kind === "from" ? "تم حفظ موقع الانطلاق" : "تم حفظ موقع الوصول");
  }

  function pinDelivery(kind) {
    const btn = document.getElementById("delivery-" + kind + "-btn");
    if (!navigator.geolocation) {
      setPinStatus(kind, "المتصفح لا يدعم تحديد الموقع", "err");
      toast("جهازك أو متصفحك لا يدعم تحديد الموقع. اختر من الخريطة أو أدخل الإحداثيات");
      return;
    }
    setPinStatus(kind, "جارٍ تحديد الموقع...", "");
    if (btn) btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (btn) btn.disabled = false;
        applyDeliveryPin(kind, pos.coords.latitude, pos.coords.longitude);
        toast(kind === "from" ? "تم حفظ موقع الانطلاق" : "تم حفظ موقع الوصول");
      },
      (err) => {
        if (btn) btn.disabled = false;
        const msg = err.code === 1
          ? "المتصفح رفض صلاحية الموقع. اختر من الخريطة أو أدخل الإحداثيات"
          : "تعذر تحديد موقعك الحالي. اختر من الخريطة أو أدخل الإحداثيات";
        setPinStatus(kind, "لم يُحدَّد الموقع الحالي", "err");
        toast(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  let mapPicker = {
    kind: "to",
    pending: null,
    map: null,
    marker: null
  };

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (loadLeaflet.wait) return loadLeaflet.wait;
    loadLeaflet.wait = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("map"));
      document.body.appendChild(script);
    });
    return loadLeaflet.wait;
  }

  function mapCenterFor(kind) {
    if (deliveryPins[kind]) return [deliveryPins[kind].lat, deliveryPins[kind].lng];
    const other = kind === "from" ? "to" : "from";
    if (deliveryPins[other]) return [deliveryPins[other].lat, deliveryPins[other].lng];
    return [33.3152, 44.3661];
  }

  function setPendingMapPin(lat, lng) {
    mapPicker.pending = { lat, lng };
    const coord = document.getElementById("map-coord");
    const confirm = document.getElementById("map-confirm");
    if (coord) coord.textContent = `خط العرض ${lat.toFixed(6)} — خط الطول ${lng.toFixed(6)}`;
    if (confirm) confirm.disabled = false;
    if (mapPicker.map) {
      if (mapPicker.marker) mapPicker.marker.setLatLng([lat, lng]);
      else mapPicker.marker = window.L.marker([lat, lng], { draggable: true }).addTo(mapPicker.map)
        .on("dragend", (e) => {
          const p = e.target.getLatLng();
          setPendingMapPin(p.lat, p.lng);
        });
    }
  }

  async function openMapPicker(kind) {
    const modal = document.getElementById("map-modal");
    const title = document.getElementById("map-modal-title");
    const hint = document.getElementById("map-modal-hint");
    const confirm = document.getElementById("map-confirm");
    const coord = document.getElementById("map-coord");
    if (!modal) return;
    mapPicker.kind = kind;
    mapPicker.pending = deliveryPins[kind] ? { lat: deliveryPins[kind].lat, lng: deliveryPins[kind].lng } : null;
    if (title) title.textContent = kind === "from" ? "اختيار موقع الانطلاق" : "اختيار موقع الوصول";
    if (hint) hint.textContent = "ابحث عن المنطقة أو اضغط على الخريطة، ثم ثبّت الموقع.";
    if (coord) coord.textContent = mapPicker.pending
      ? `خط العرض ${mapPicker.pending.lat.toFixed(6)} — خط الطول ${mapPicker.pending.lng.toFixed(6)}`
      : "اضغط على الخريطة لتحديد النقطة";
    if (confirm) confirm.disabled = !mapPicker.pending;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      const L = await loadLeaflet();
      L.Icon.Default.imagePath = "https://unpkg.com/leaflet@1.9.4/dist/images/";
      const start = mapCenterFor(kind);
      if (!mapPicker.map) {
        mapPicker.map = L.map("delivery-map", { zoomControl: true }).setView(start, 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap"
        }).addTo(mapPicker.map);
        mapPicker.map.on("click", (e) => setPendingMapPin(e.latlng.lat, e.latlng.lng));
      } else {
        mapPicker.map.setView(start, 13);
      }
      if (mapPicker.marker) {
        mapPicker.map.removeLayer(mapPicker.marker);
        mapPicker.marker = null;
      }
      if (mapPicker.pending) setPendingMapPin(mapPicker.pending.lat, mapPicker.pending.lng);
      const search = document.getElementById("map-search");
      const results = document.getElementById("map-search-results");
      if (search) search.value = "";
      if (results) {
        results.innerHTML = "";
        results.hidden = true;
      }
      setTimeout(() => {
        mapPicker.map.invalidateSize();
        if (search) search.focus();
      }, 80);
    } catch (err) {
      toast("تعذر فتح الخريطة. أدخل الإحداثيات يدوياً");
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function placeLabel(props) {
    const p = props || {};
    return [p.name, p.street, p.district, p.locality, p.city, p.state, p.county]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join("، ");
  }

  async function searchIraqPlaces(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    try {
      const photon = await fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&lang=ar&limit=6&lat=33.3152&lon=44.3661");
      if (photon.ok) {
        const data = await photon.json();
        const rows = (data.features || []).map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          return { lat, lng, label: placeLabel(f.properties) || q };
        }).filter((row) => row.lat > 29 && row.lat < 38 && row.lng > 38 && row.lng < 49);
        if (rows.length) return rows;
      }
    } catch (err) {}
    const nom = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=iq&limit=6&accept-language=ar&q=" + encodeURIComponent(q));
    if (!nom.ok) return [];
    const list = await nom.json();
    return (list || []).map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      label: item.display_name || q
    }));
  }

  function renderMapResults(rows) {
    const box = document.getElementById("map-search-results");
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = "<li><button type=\"button\" disabled>لا توجد نتائج، جرّب اسم أوضح</button></li>";
      box.hidden = false;
      return;
    }
    box.innerHTML = rows.map((row, i) =>
      `<li><button type="button" data-i="${i}">${escapeHtml(row.label)}<small>${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}</small></button></li>`
    ).join("");
    box.hidden = false;
    box.querySelectorAll("button[data-i]").forEach((btn) => {
      btn.addEventListener("click", () => applyMapSearchResult(rows[Number(btn.dataset.i)]));
    });
  }

  function applyMapSearchResult(row) {
    if (!row) return;
    if (mapPicker.map) mapPicker.map.setView([row.lat, row.lng], 16);
    setPendingMapPin(row.lat, row.lng);
    const field = document.querySelector(mapPicker.kind === "from" ? "[name=fromAddress]" : "[name=toAddress]");
    if (field && row.label) field.value = row.label.split("،").slice(0, 3).join("،").trim();
    const box = document.getElementById("map-search-results");
    if (box) box.hidden = true;
    toast("تم تحديد النقطة من البحث، ثبّت الموقع");
  }

  async function runMapSearch() {
    const input = document.getElementById("map-search");
    const q = (input && input.value || "").trim();
    if (q.length < 2) {
      toast("اكتب اسم المنطقة أو الشارع للبحث");
      return;
    }
    const box = document.getElementById("map-search-results");
    if (box) {
      box.hidden = false;
      box.innerHTML = "<li><button type=\"button\" disabled>جارٍ البحث...</button></li>";
    }
    const seq = (mapPicker.searchSeq = (mapPicker.searchSeq || 0) + 1);
    try {
      const rows = await searchIraqPlaces(q);
      if (seq !== mapPicker.searchSeq) return;
      renderMapResults(rows);
    } catch (err) {
      if (seq !== mapPicker.searchSeq) return;
      toast("تعذر البحث، اضغط على الخريطة مباشرة");
      if (box) box.hidden = true;
    }
  }

  function confirmMapPin() {
    if (!mapPicker.pending) {
      toast("ابحث عن المكان أو اضغط على الخريطة أولاً");
      return;
    }
    applyDeliveryPin(mapPicker.kind, mapPicker.pending.lat, mapPicker.pending.lng);
    toast(mapPicker.kind === "from" ? "تم حفظ موقع الانطلاق" : "تم حفظ موقع الوصول");
    closeModals();
  }

  function validPhone(value) {
    const d = String(value || "").replace(/[^\d]/g, "");
    return d.length >= 10 && d.length <= 14;
  }

  function sendWhatsappText(text) {
    const cfg = window.SITE_CONFIG || {};
    const encoded = encodeURIComponent(text);
    const raw = String(cfg.whatsapp || "").replace(/[^\d]/g, "");
    const placeholder = !raw || raw.includes("0000000") || raw.length < 11;
    const url = placeholder
      ? `https://wa.me/?text=${encoded}`
      : `https://wa.me/${raw}?text=${encoded}`;
    window.location.assign(url);
  }

  function buildDeliveryMessage(form) {
    const cfg = window.SITE_CONFIG || {};
    const lines = [
      "طلب توصيلة",
      `من موقع ${cfg.businessName || "مأكولات الياقوت والمرجان"}`,
      "",
      `الغرض: ${form.item.value.trim()}`,
      "",
      "المسلم (أخذ الغرض):",
      `الاسم: ${form.senderName.value.trim()}`,
      `الهاتف: ${form.senderPhone.value.trim()}`,
      `عنوان الانطلاق: ${form.fromAddress.value.trim()}`,
      deliveryPins.from ? `موقع الانطلاق: ${deliveryPins.from.url}` : "موقع الانطلاق: لم يُحدَّد",
      deliveryPins.from ? `إحداثيات الانطلاق: ${deliveryPins.from.lat.toFixed(6)}, ${deliveryPins.from.lng.toFixed(6)}` : "",
      "",
      "المستلم:",
      `الاسم: ${form.receiverName.value.trim()}`,
      `الهاتف: ${form.receiverPhone.value.trim()}`,
      `عنوان الوصول: ${form.toAddress.value.trim()}`,
      deliveryPins.to ? `موقع الوصول: ${deliveryPins.to.url}` : "موقع الوصول: لم يُحدَّد",
      deliveryPins.to ? `إحداثيات الوصول: ${deliveryPins.to.lat.toFixed(6)}, ${deliveryPins.to.lng.toFixed(6)}` : "",
      ""
    ];
    if (deliveryPins.from && deliveryPins.to) {
      lines.push(`المسافة التقريبية: ${haversineKm(deliveryPins.from, deliveryPins.to).toFixed(1)} كم`);
    }
    lines.push("السعر: يُحدد عبر واتساب");
    const note = form.note.value.trim();
    if (note) lines.push("", `ملاحظات: ${note}`);
    lines.push("", "الدفع الإلكتروني عبر كي كارد متوفر عند التأكيد.");
    return lines.join("\n");
  }

  function bindDelivery() {
    ["from", "to"].forEach((kind) => {
      document.getElementById("delivery-" + kind + "-btn")?.addEventListener("click", () => pinDelivery(kind));
      document.getElementById("delivery-" + kind + "-map")?.addEventListener("click", () => openMapPicker(kind));
      document.getElementById("delivery-" + kind + "-coords")?.addEventListener("click", () => pinFromCoords(kind));
      document.getElementById("delivery-" + kind + "-pair")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          pinFromCoords(kind);
        }
      });
    });
    document.getElementById("close-map")?.addEventListener("click", closeModals);
    document.getElementById("map-confirm")?.addEventListener("click", confirmMapPin);
    const searchForm = document.getElementById("map-search-form");
    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        runMapSearch();
      });
    }
    const form = document.getElementById("delivery-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.item.value.trim()) {
        toast("اكتب وصف الغرض أولاً");
        return;
      }
      if (!validPhone(form.senderPhone.value) || !validPhone(form.receiverPhone.value)) {
        toast("أدخل رقم هاتف صحيح للمسلم والمستلم");
        return;
      }
      if (!deliveryPins.from || !deliveryPins.to) {
        toast("حدّد موقع الانطلاق وموقع الوصول من الخريطة أو بالإحداثيات");
        return;
      }
      sendWhatsappText(buildDeliveryMessage(form));
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("yam-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "الوضع الفاتح" : "الوضع المظلم");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#161012" : "#6B1220";
  }

  function bind() {
    applyTheme(localStorage.getItem("yam-theme") || "dark");
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
    });

    const cfg = window.SITE_CONFIG || {};
    document.getElementById("hours-text").textContent = cfg.hours || "";
    const phoneLink = document.getElementById("phone-link");
    if (phoneLink && cfg.whatsapp) {
      const digits = String(cfg.whatsapp).replace(/[^\d]/g, "");
      phoneLink.href = `https://wa.me/${digits}`;
      phoneLink.textContent = cfg.phoneDisplay || "07869789710";
      const wa = document.getElementById("wa-float");
      if (wa) wa.href = `https://wa.me/${digits}`;
    }

    const header = document.getElementById("top");
    if (header) {
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 10);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    if (els.search) {
      els.search.addEventListener("input", () => {
        searchQuery = els.search.value || "";
        renderMenu();
      });
    }

    if (els.featured) {
      els.featured.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-add]");
        if (!btn) return;
        const item = menu.find((i) => i.id === btn.dataset.add);
        if (item) openItem(item);
      });
    }

    bindDelivery();

    const specialForm = document.getElementById("special-form");
    if (specialForm) {
      specialForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const entry = specialEntryFromForm(specialForm);
        if (!entry.customDesc) {
          toast("اكتب وصف الأكل الخاص أولاً");
          return;
        }
        const wasEdit = editingCartIndex != null && cart[editingCartIndex] && cart[editingCartIndex].custom;
        if (wasEdit) {
          entry.id = cart[editingCartIndex].id;
          cart[editingCartIndex] = entry;
        } else {
          cart.push(entry);
        }
        editingCartIndex = null;
        saveCart();
        renderCart();
        resetSpecialForm();
        toast(wasEdit ? "تم تعديل الطلب الخاص في السلة" : "تمت إضافة الطلب الخاص إلى السلة");
        openCart();
      });
    }

    els.cats.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      currentCategory = btn.dataset.id;
      renderCategories();
      renderMenu();
    });

    els.grid.addEventListener("click", (e) => {
      const id = e.target.dataset.add;
      if (!id) return;
      openItem(menu.find((i) => i.id === id));
    });

    els.itemForm.addEventListener("click", (e) => {
      const dir = e.target.dataset.qty;
      if (!dir) return;
      const step = activeItem?.step || 1;
      qty = dir === "+" ? qty + step : Math.max(step, qty - step);
      if (step < 1) qty = Math.round(qty * 10) / 10;
      document.getElementById("qty-val").textContent = qty;
    });

    els.itemForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addToCart(activeItem, els.itemForm);
    });

    ["open-cart", "open-cart-2", "mobile-open-cart"].forEach((id) => {
      document.getElementById(id).addEventListener("click", openCart);
    });
    document.getElementById("close-cart").addEventListener("click", closeModals);
    document.getElementById("close-item").addEventListener("click", () => {
      if (editingCartIndex != null) {
        els.itemModal.classList.remove("open");
        els.itemModal.setAttribute("aria-hidden", "true");
        editingCartIndex = null;
        openCart();
        return;
      }
      closeModals();
    });
    document.getElementById("close-checkout").addEventListener("click", closeModals);
    els.overlay.addEventListener("click", () => {
      if (els.itemModal.classList.contains("open") && editingCartIndex != null) {
        els.itemModal.classList.remove("open");
        els.itemModal.setAttribute("aria-hidden", "true");
        editingCartIndex = null;
        openCart();
        return;
      }
      closeModals();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (els.itemModal.classList.contains("open") && editingCartIndex != null) {
        els.itemModal.classList.remove("open");
        els.itemModal.setAttribute("aria-hidden", "true");
        editingCartIndex = null;
        openCart();
        return;
      }
      closeModals();
    });

    els.cartItems.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit]");
      const qtyBtn = e.target.closest("[data-cart-qty]");
      const removeBtn = e.target.closest("[data-remove]");
      if (editBtn) {
        editCartItem(Number(editBtn.dataset.edit));
        return;
      }
      if (qtyBtn) {
        changeCartQty(Number(qtyBtn.dataset.cartQty), qtyBtn.dataset.dir);
        return;
      }
      if (!removeBtn) return;
      cart.splice(Number(removeBtn.dataset.remove), 1);
      saveCart();
      renderCart();
    });

    document.getElementById("go-checkout").addEventListener("click", () => {
      if (!cart.length) return toast("أضف صنفاً أولاً");
      renderCheckoutSummary();
      els.cartDrawer.classList.remove("open");
      els.cartDrawer.setAttribute("aria-hidden", "true");
      els.itemModal.classList.remove("open");
      els.checkoutModal.classList.add("open");
      els.checkoutModal.setAttribute("aria-hidden", "false");
      els.overlay.hidden = false;
      document.body.style.overflow = "hidden";
      if (customerLocation) applyLocation(customerLocation.lat, customerLocation.lng);
      else requestLocation();
    });

    if (els.shareLocation) els.shareLocation.addEventListener("click", requestLocation);

    els.checkoutForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(els.checkoutForm);
      const bread = String(form.get("bread") || "").trim();
      if (!bread) {
        toast("حدّد إذا كنت تريد خبزاً مع الطلب أو لا");
        return;
      }
      if (!customerLocation) {
        toast("حدّد موقعك على الخريطة قبل إرسال الطلب");
        requestLocation();
        return;
      }
      sendWhatsapp({
        name: form.get("name").trim(),
        phone: form.get("phone").trim(),
        address: form.get("address").trim(),
        fulfillment: form.get("fulfillment"),
        bread,
        notes: form.get("notes").trim(),
        locationUrl: customerLocation.url
      });
    });
  }

  function start() {
    loadCatalog();
    renderCategories();
    renderFeatured();
    renderMenu();
    renderStories();
    renderCart();
    bind();
    bindStories();
    if (window.MenuStore && window.MenuStore.refreshPublished) {
      const applyLive = (data) => {
        if (!data || !data.menu || !data.menu.length) return;
        applyCatalog(data);
        renderCategories();
        renderFeatured();
        renderMenu();
        renderStories();
      };
      window.MenuStore.refreshPublished().then(applyLive).catch((err) => console.warn("refreshPublished", err));
      setTimeout(() => {
        window.MenuStore.refreshPublished().then(applyLive).catch(() => {});
      }, 8000);
    }
    setupInstall();
    setupNotify();
    const banner = document.getElementById("urgent-banner");
    if (banner) {
      banner.addEventListener("mouseenter", stopAlertRotate);
      banner.addEventListener("mouseleave", startAlertRotate);
      banner.addEventListener("click", (e) => {
        const btn = e.target.closest ? e.target.closest("[data-alert-i]") : null;
        if (!btn) return;
        showAlertAt(Number(btn.getAttribute("data-alert-i")));
        startAlertRotate();
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" }).catch((err) => console.warn("sw", err));
    }
    setTimeout(consumeOpenParam, 400);
  }

  function setupInstall() {
    const banner = document.getElementById("install-banner");
    const btn = document.getElementById("install-btn");
    const headerBtn = document.getElementById("install-app-btn");
    const close = document.getElementById("install-close");
    const text = document.getElementById("install-text");
    const steps = document.getElementById("install-steps");
    if (!banner || !btn) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (standalone) {
      if (headerBtn) headerBtn.hidden = true;
      return;
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
      || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let deferred = null;
    const hideKey = "yam-install-popup";

    function showPopup(force) {
      if (!force && sessionStorage.getItem(hideKey) === "1") return;
      banner.hidden = false;
    }

    function hidePopup(permanent) {
      banner.hidden = true;
      sessionStorage.setItem(hideKey, "1");
      if (permanent) localStorage.setItem(hideKey, "1");
      window.dispatchEvent(new Event("yam-install-closed"));
    }

    function showSteps(items) {
      if (!steps) return;
      if (!items || !items.length) {
        steps.hidden = true;
        steps.innerHTML = "";
        return;
      }
      steps.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
      steps.hidden = false;
    }

    const inApp = /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|WebView|; wv\)/i.test(navigator.userAgent || "");

    function chromeIntent() {
      const abs = "https://maakolat.github.io/food/";
      return "intent://" + abs.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end";
    }

    function setCopy(nativePrompt) {
      if (inApp) {
        if (text) text.textContent = "التثبيت من داخل فيسبوك أو إنستغرام يفشل أحياناً. افتح الموقع في كروم أو سفاري ثم ثبّت:";
        showSteps([
          "اضغط القائمة ⋮ أو فتح في المتصفح",
          "افتح كروم أو سفاري",
          "بعدها ثبّت التطبيق من هناك"
        ]);
        btn.textContent = "فتح في كروم";
        return;
      }
      if (ios) {
        if (text) text.textContent = "ثبّته ليظهر مع التطبيقات على هاتفك:";
        showSteps([
          "اضغط زر المشاركة في سفاري",
          "اختر إضافة إلى الشاشة الرئيسية",
          "ثم اضغط إضافة"
        ]);
        btn.textContent = "حسناً، فهمت";
        return;
      }
      if (nativePrompt) {
        if (text) text.textContent = "يثبت على الهاتف ويظهر مع التطبيقات، وتفتحه بدون المتصفح.";
        showSteps([]);
        btn.textContent = "تثبيت على الهاتف";
        return;
      }
      if (text) text.textContent = "إذا ظهر خطأ، ثبّته يدوياً من المتصفح:";
      showSteps([
        "افتح الموقع في كروم وليس من تطبيق ثاني",
        "اضغط القائمة ⋮ أعلى الصفحة",
        "اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية"
      ]);
      btn.textContent = "تثبيت على الهاتف";
    }

    if (close) close.addEventListener("click", () => hidePopup(true));
    banner.addEventListener("click", (e) => {
      if (e.target === banner) hidePopup(true);
    });

    async function tryInstall() {
      if (inApp) {
        try { window.location.href = chromeIntent(); } catch (err) {}
        setCopy(false);
        showPopup(true);
        return;
      }
      if (deferred) {
        try {
          deferred.prompt();
          const choice = await deferred.userChoice;
          deferred = null;
          if (choice && choice.outcome === "accepted") {
            hidePopup(true);
            return;
          }
        } catch (err) {
          deferred = null;
        }
        setCopy(false);
        showPopup(true);
        return;
      }
      if (ios) {
        setCopy(false);
        showPopup(true);
        return;
      }
      setCopy(false);
      showPopup(true);
    }

    btn.addEventListener("click", tryInstall);
    if (headerBtn) headerBtn.addEventListener("click", () => {
      setCopy(!!deferred);
      showPopup(true);
      if (deferred) tryInstall();
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      setCopy(true);
      if (mobile) showPopup();
    });

    window.addEventListener("appinstalled", () => {
      hidePopup(true);
      if (headerBtn) headerBtn.hidden = true;
    });

    if (mobile && localStorage.getItem(hideKey) !== "1") {
      setCopy(false);
      setTimeout(() => showPopup(), 700);
    }
  }

  function consumeOpenParam(raw) {
    let open = raw;
    if (!open) {
      try { open = new URLSearchParams(location.search).get("open") || ""; }
      catch (err) { open = ""; }
    }
    if (open === "stories") {
      const list = activeStories();
      if (list.length) showStoryAt(0);
      const strip = document.getElementById("stories-strip");
      if (strip) strip.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (open === "menu" || open === "alert") {
      const banner = document.getElementById("urgent-banner");
      if (open === "alert" && banner && !banner.hidden) {
        banner.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const section = document.getElementById("menu");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setupNotify() {
    const bar = document.getElementById("notify-bar");
    const allowBtn = document.getElementById("notify-allow");
    const laterBtn = document.getElementById("notify-later");
    const enableBtn = document.getElementById("notify-enable");
    const text = document.getElementById("notify-text");
    const laterKey = "yam-notify-later";
    const denyKey = "yam-notify-deny";
    const supported = "Notification" in window && "serviceWorker" in navigator;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    const cfg = window.SITE_CONFIG || {};

    function urlBase64ToUint8Array(base64String) {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }

    function askSwCheck() {
      if (!navigator.serviceWorker) return;
      const send = (reg) => {
        const worker = (reg && (reg.active || reg.waiting)) || navigator.serviceWorker.controller;
        if (worker) worker.postMessage({ type: "yam-check", reason: "page" });
      };
      if (navigator.serviceWorker.controller) send();
      else navigator.serviceWorker.ready.then(send).catch(() => {});
    }

    async function enablePeriodic() {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.periodicSync) {
          await reg.periodicSync.register("yam-updates", { minInterval: 15 * 60 * 1000 });
        }
      } catch (err) {}
    }

    async function registerPush() {
      if (!cfg.vapidPublic || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(cfg.vapidPublic);
      let sub = await reg.pushManager.getSubscription();
      let same = false;
      try {
        const got = sub && sub.options && sub.options.applicationServerKey
          ? new Uint8Array(sub.options.applicationServerKey)
          : null;
        same = !!(got && got.length === key.length && got.every((b, i) => b === key[i]));
      } catch (err) {}
      if (sub && !same) {
        try { await sub.unsubscribe(); } catch (err) {}
        sub = null;
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key
        });
      }
      const payload = JSON.stringify(sub.toJSON());
      try { localStorage.setItem("yam-push-sub", payload); } catch (err) {}
      if (cfg.notifyTopic) {
        await fetch("https://ntfy.sh/" + encodeURIComponent(cfg.notifyTopic), {
          method: "POST",
          headers: { "Title": "sub", "Content-Type": "text/plain" },
          body: payload
        });
      }
    }

    function hideBar(until) {
      if (!bar) return;
      bar.hidden = true;
      if (until === "later") {
        try { localStorage.setItem(laterKey, String(Date.now() + 12 * 3600000)); } catch (err) {}
      }
      if (until === "deny") {
        try { localStorage.setItem(denyKey, "1"); } catch (err) {}
      }
    }

    function laterActive() {
      try {
        if (localStorage.getItem(denyKey) === "1") return true;
        const until = Number(localStorage.getItem(laterKey) || 0);
        return until > Date.now();
      } catch (err) {
        return false;
      }
    }

    function showBar() {
      if (!bar || !supported) return;
      if (Notification.permission !== "default") return;
      if (laterActive()) return;
      const install = document.getElementById("install-banner");
      if (install && !install.hidden) {
        setTimeout(showBar, 2500);
        return;
      }
      if (ios && !standalone) {
        if (text) text.textContent = "على الآيفون: ثبّت التطبيق أولاً من المشاركة ثم إضافة للشاشة الرئيسية، وبعدها فعّل الإشعارات حتى تصلك والتطبيق مغلق.";
      } else if (text) {
        text.textContent = "فعّل الإشعارات وثبّت التطبيق ليصلك الخبر بجرس حتى لو التطبيق مغلق.";
      }
      bar.hidden = false;
    }

    async function requestPermission() {
      if (!supported) {
        toast("هذا المتصفح لا يدعم الإشعارات");
        return;
      }
      if (ios && !standalone) {
        toast("ثبّت التطبيق على الشاشة الرئيسية أولاً، ثم فعّل الإشعارات");
        showBar();
        return;
      }
      let perm = Notification.permission;
      if (perm === "default") {
        try { perm = await Notification.requestPermission(); }
        catch (err) { perm = Notification.permission; }
      }
      if (perm === "granted") {
        hideBar();
        if (enableBtn) enableBtn.hidden = true;
        await enablePeriodic();
        try { await registerPush(); } catch (err) { console.warn("push subscribe", err); }
        askSwCheck();
        toast("تم تفعيل الإشعارات. سيصلك الخبر على الهاتف حتى والتطبيق مغلق");
      } else {
        hideBar("deny");
        toast("تم رفض الإشعارات من إعدادات المتصفح");
      }
    }

    if (enableBtn) {
      if (!supported || Notification.permission === "granted") enableBtn.hidden = true;
      enableBtn.addEventListener("click", requestPermission);
    }
    if (allowBtn) allowBtn.addEventListener("click", requestPermission);
    if (laterBtn) laterBtn.addEventListener("click", () => hideBar("later"));
    window.addEventListener("yam-install-closed", showBar);

    if (supported && Notification.permission === "granted") {
      enablePeriodic();
      registerPush().catch(() => {});
      setTimeout(askSwCheck, 800);
    } else {
      setTimeout(showBar, 1200);
    }

    setInterval(() => {
      if (document.visibilityState === "visible") {
        askSwCheck();
        if (Notification.permission === "granted") registerPush().catch(() => {});
      }
    }, 45000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") askSwCheck();
    });

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data || {};
        if (data.type === "yam-open") {
          const url = String(data.url || "");
          if (url.indexOf("open=stories") >= 0) consumeOpenParam("stories");
          else if (url.indexOf("open=alert") >= 0) consumeOpenParam("alert");
          else if (url.indexOf("open=menu") >= 0) consumeOpenParam("menu");
        }
        if (data.type === "yam-news") {
          if (data.stories && data.stories.length) {
            renderStories();
            toast(data.stories.length === 1 ? "ستوري جديد — اضغط الدائرة للمشاهدة" : "ستوريات جديدة وصلت");
          }
          if (data.dishes && data.dishes.length) {
            toast(data.dishes.length === 1 ? "صنف جديد في القائمة" : "أصناف جديدة في القائمة");
          }
        }
        if (data.type === "yam-urgent") {
          playNotifyChime();
          toast(data.title || "رسالة من الياقوت والمرجان");
          if (window.MenuStore && window.MenuStore.refreshPublished) {
            window.MenuStore.refreshPublished().then((fresh) => {
              if (!fresh) return;
              applyCatalog(fresh);
              renderCategories();
              renderFeatured();
              renderMenu();
            }).catch(() => {});
          }
          if (data.title && data.body) {
            const incoming = {
              id: data.id || ("live-" + Date.now()),
              title: data.title,
              body: data.body,
              kind: data.kind || "now",
              expiresAt: Date.now() + 24 * 3600000
            };
            liveAlerts = [incoming].concat(liveAlerts.filter((a) => a.id !== incoming.id));
            alertIndex = 0;
            renderAlertBanner();
          }
        }
      });
      navigator.serviceWorker.ready.then(() => setTimeout(askSwCheck, 1200));
      navigator.serviceWorker.addEventListener("controllerchange", () => askSwCheck());
    }
  }

  start();
})();
