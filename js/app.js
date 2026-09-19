(function () {
  const money = (n) => {
    if (n == null) return "حسب الكمية";
    return `${Number(n).toLocaleString("ar-IQ")} د.ع`;
  };

  let categories = [];
  let menu = [];

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

  function applyCatalog(data) {
    categories = (data && data.categories || []).slice();
    menu = (data && data.menu || []).map(hydrateItem);
  }

  function loadCatalog() {
    applyCatalog((window.MenuStore && window.MenuStore.loadImmediate()) || { categories: [], menu: [] });
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
    els.locationStatus.textContent = text;
    els.locationStatus.classList.remove("ok", "err");
    if (kind) els.locationStatus.classList.add(kind);
    els.locationBox.classList.toggle("is-set", kind === "ok");
  }

  function applyLocation(lat, lng) {
    const url = mapsUrl(lat, lng);
    customerLocation = { lat, lng, url };
    setLocationStatus("تم تحديد الموقع", "ok");
    els.locationPreview.hidden = false;
    els.locationPreview.classList.add("is-visible");
    els.locationPreview.href = url;
    els.shareLocation.textContent = "إعادة تحديد الموقع";
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("المتصفح لا يدعم تحديد الموقع", "err");
      toast("فعّل الموقع من إعدادات المتصفح أو اكتب العنوان بدقة");
      return;
    }
    setLocationStatus("جاري تحديد الموقع...", "");
    els.shareLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        els.shareLocation.disabled = false;
        applyLocation(pos.coords.latitude, pos.coords.longitude);
        toast("تم حفظ موقعك مع الطلب");
      },
      (err) => {
        els.shareLocation.disabled = false;
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
    const cfg = window.SITE_CONFIG || {};
    const text = encodeURIComponent(buildWhatsappMessage(data));
    const raw = String(cfg.whatsapp || "").replace(/[^\d]/g, "");
    const placeholder = !raw || raw.includes("0000000") || raw.length < 11;
    const url = placeholder
      ? `https://wa.me/?text=${text}`
      : `https://wa.me/${raw}?text=${text}`;
    window.location.assign(url);
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

    els.shareLocation.addEventListener("click", requestLocation);

    els.checkoutForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!customerLocation) {
        toast("حدّد موقعك على الخريطة قبل إرسال الطلب");
        requestLocation();
        return;
      }
      const form = new FormData(els.checkoutForm);
      const bread = String(form.get("bread") || "").trim();
      if (!bread) {
        toast("حدّد إذا كنت تريد خبزاً مع الطلب أو لا");
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
    renderCart();
    bind();
    if (window.MenuStore && window.MenuStore.refreshPublished) {
      const applyLive = (data) => {
        if (!data || !data.menu || !data.menu.length) return;
        applyCatalog(data);
        renderCategories();
        renderFeatured();
        renderMenu();
      };
      window.MenuStore.refreshPublished().then(applyLive).catch((err) => console.warn("refreshPublished", err));
      setTimeout(() => {
        window.MenuStore.refreshPublished().then(applyLive).catch(() => {});
      }, 8000);
    }
  }
  start();
})();
