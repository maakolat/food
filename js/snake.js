(function () {
  const KEY = "yam-snake-best-v1";
  const COLS = 11;
  const ROWS = 12;
  const START_TICK = 170;
  const MIN_TICK = 90;

  const canvas = document.getElementById("snake-board");
  const overlay = document.getElementById("snake-overlay");
  const startBtn = document.getElementById("snake-start");
  const pad = document.getElementById("snake-pad");
  if (!canvas || !overlay || !startBtn) return;

  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("snake-score");
  const lenEl = document.getElementById("snake-len");
  const eatenEl = document.getElementById("snake-eaten");
  const bestEl = document.getElementById("snake-best");
  const hint = document.getElementById("snake-hint");
  const titleEl = document.getElementById("snake-overlay-title");
  const textEl = document.getElementById("snake-overlay-text");
  const eyeEl = document.getElementById("snake-overlay-eyebrow");

  const imgs = {};
  let pool = [];
  let cell = 24;
  let snake = [];
  let dir = { x: 1, y: 0 };
  let queued = null;
  let foods = [];
  let meals = [];
  let grow = 0;
  let score = 0;
  let playing = false;
  let tickMs = START_TICK;
  let timer = null;
  let touchStart = null;
  let primed = false;

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function imageKey(src) {
    return String(src || "").split("?")[0]
      .replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\//, "")
      .replace(/^\.\//, "");
  }

  function media(src) {
    if (window.MenuStore && window.MenuStore.mediaUrl) return window.MenuStore.mediaUrl(src);
    return String(src || "");
  }

  function isAdminUpload(src) {
    return /assets\/uploads\//i.test(imageKey(src));
  }

  function latestMenu() {
    if (window.MenuStore && window.MenuStore.loadImmediate) {
      const live = window.MenuStore.loadImmediate();
      if (live && live.menu) return live.menu;
    }
    return [];
  }

  function dishesFromMenu(menu) {
    const seen = {};
    const uploaded = [];
    (menu || []).forEach((item) => {
      if (!item || !item.image) return;
      const image = media(item.image);
      if (!image || image.indexOf("data:") === 0) return;
      if (!isAdminUpload(image)) return;
      const key = imageKey(image);
      if (seen[key]) return;
      seen[key] = 1;
      uploaded.push({ id: String(item.id || key), name: String(item.name || "صنف"), image: image });
    });
    return uploaded;
  }

  function refreshPool(menu) {
    pool = dishesFromMenu(menu || latestMenu());
    return pool;
  }

  function loadImg(src) {
    if (!src) return null;
    if (imgs[src]) return imgs[src];
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = function () { draw(); };
    img.src = src;
    imgs[src] = img;
    return img;
  }

  function readBest() {
    try { return Number(localStorage.getItem(KEY) || 0) || 0; }
    catch (err) { return 0; }
  }

  function writeBest(value) {
    try { localStorage.setItem(KEY, String(value)); } catch (err) {}
  }

  function renderBest() {
    const best = readBest();
    if (bestEl) bestEl.textContent = best ? String(best) : "—";
  }

  function setHud() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (lenEl) lenEl.textContent = String(snake.length || 3);
    if (eatenEl) eatenEl.textContent = String(meals.length);
    renderBest();
  }

  function showOverlay(eyebrow, title, text, btn) {
    if (eyeEl) eyeEl.textContent = eyebrow;
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    startBtn.textContent = btn;
    overlay.hidden = false;
    overlay.classList.add("is-on");
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlay.classList.remove("is-on");
  }

  function occupied() {
    const map = {};
    snake.forEach((p) => { map[p.x + "," + p.y] = 1; });
    foods.forEach((f) => { map[f.x + "," + f.y] = 1; });
    return map;
  }

  function emptyCell(busy) {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!busy[x + "," + y]) free.push({ x: x, y: y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function pickDish(busyIds) {
    const src = pool.length ? pool : refreshPool();
    if (!src.length) return null;
    const avoid = busyIds || [];
    const fresh = src.filter((d) => avoid.indexOf(d.id) < 0);
    const list = shuffle(fresh.length ? fresh : src);
    const dish = list[0];
    loadImg(dish.image);
    return dish;
  }

  function spawnFood(count) {
    const want = Math.max(1, count || 2);
    while (foods.length < want) {
      const busy = occupied();
      const cellPos = emptyCell(busy);
      if (!cellPos) break;
      const dish = pickDish(foods.map((f) => f.id).concat(meals.slice(-3).map((m) => m.id)));
      if (!dish) break;
      foods.push({ x: cellPos.x, y: cellPos.y, id: dish.id, name: dish.name, image: dish.image });
    }
  }

  function stopLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startLoop() {
    stopLoop();
    timer = setInterval(tick, tickMs);
  }

  function fitCanvas() {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const cssW = Math.max(220, wrap.clientWidth);
    cell = Math.floor(cssW / COLS);
    const cssH = cell * ROWS;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cell * COLS * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = (cell * COLS) + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function roundRect(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawImageCover(img, x, y, size) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, x - (dw - size) / 2, y - (dh - size) / 2, dw, dh);
    return true;
  }

  function drawDish(cx, cy, size, dish) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const img = loadImg(dish.image);
    if (!drawImageCover(img, cx - size / 2, cy - size / 2, size)) {
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 248, 238, 0.9)";
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.stroke();
  }

  function wrapName(name, maxW) {
    const label = String(name || "صنف").trim();
    if (ctx.measureText(label).width <= maxW) return [label];
    const words = label.split(/\s+/);
    if (words.length > 1) {
      const lines = [];
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const trial = line + " " + words[i];
        if (ctx.measureText(trial).width <= maxW) line = trial;
        else {
          lines.push(line);
          line = words[i];
        }
      }
      lines.push(line);
      return lines.slice(0, 2);
    }
    let a = label;
    while (a.length > 2 && ctx.measureText(a).width > maxW) a = a.slice(0, -1);
    return [a];
  }

  function drawFoodName(food) {
    const cx = food.x * cell + cell / 2;
    const cy = food.y * cell + cell / 2;
    const size = cell * 0.9;
    const maxW = Math.min(cell * 2.4, cell * COLS - 8);
    const fontSize = Math.max(12, Math.floor(cell * 0.34));
    ctx.font = "800 " + fontSize + "px Cairo, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapName(food.name, maxW - 14);
    const lineH = fontSize + 4;
    const tw = Math.min(maxW, Math.max.apply(null, lines.map((t) => ctx.measureText(t).width)) + 16);
    const th = lineH * lines.length + 8;
    let lx = cx - tw / 2;
    let ly = cy + size / 2 - 4;
    lx = Math.max(4, Math.min(lx, cell * COLS - tw - 4));
    ly = Math.max(4, Math.min(ly, cell * ROWS - th - 4));
    ctx.fillStyle = "rgba(28, 16, 12, 0.88)";
    roundRect(lx, ly, tw, th, 10);
    ctx.fill();
    ctx.fillStyle = "#fff8ee";
    lines.forEach((line, i) => {
      ctx.fillText(line, lx + tw / 2, ly + 4 + lineH * i + lineH / 2);
    });
  }

  function draw() {
    const w = cell * COLS;
    const h = cell * ROWS;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1b1012";
    roundRect(0, 0, w, h, 18);
    ctx.fill();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2) continue;
        ctx.fillStyle = "rgba(243, 227, 180, 0.05)";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    foods.forEach((food) => {
      const cx = food.x * cell + cell / 2;
      const cy = food.y * cell + cell / 2;
      drawDish(cx, cy, cell * 0.9, food);
    });
    for (let i = snake.length - 1; i >= 1; i--) {
      const p = snake[i];
      const meal = meals[meals.length - i];
      const cx = p.x * cell + cell / 2;
      const cy = p.y * cell + cell / 2;
      const size = cell * (i === snake.length - 1 ? 0.68 : 0.78);
      if (meal) drawDish(cx, cy, size, meal);
      else {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "#e06b78" : "#c44555";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 248, 238, 0.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (!snake.length) return;
    const head = snake[0];
    const hx = head.x * cell + cell / 2;
    const hy = head.y * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(hx, hy, cell * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#f4c9d4";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e3be55";
    ctx.stroke();
    const ex = dir.x * cell * 0.14;
    const ey = dir.y * cell * 0.14;
    const ox = -dir.y * cell * 0.13;
    const oy = dir.x * cell * 0.13;
    ctx.fillStyle = "#1c100c";
    ctx.beginPath();
    ctx.arc(hx + ex + ox, hy + ey + oy, cell * 0.08, 0, Math.PI * 2);
    ctx.arc(hx + ex - ox, hy + ey - oy, cell * 0.08, 0, Math.PI * 2);
    ctx.fill();
    foods.forEach(drawFoodName);
  }

  function hitSelf(nx, ny) {
    const last = grow > 0 ? snake.length : Math.max(0, snake.length - 1);
    for (let i = 0; i < last; i++) {
      if (snake[i].x === nx && snake[i].y === ny) return true;
    }
    return false;
  }

  function setDir(nx, ny) {
    const cur = queued || dir;
    if (primed && cur.x === -nx && cur.y === -ny) return;
    if (!nx && !ny) return;
    queued = { x: nx, y: ny };
    primed = true;
  }

  function gameOver() {
    playing = false;
    stopLoop();
    const best = readBest();
    const record = score > best;
    if (record) writeBest(score);
    setHud();
    const names = meals.slice(-4).map((m) => m.name).filter(Boolean);
    const extra = names.length ? " آخر ما أكلتِ: " + names.join("، ") + "." : "";
    if (hint) hint.textContent = record ? "رقم قياسي جديد للدودة." : "اصطدمتِ. جرّبي مسار أطول.";
    showOverlay(
      record ? "رقم قياسي" : "انتهت الجولة",
      record ? "الدودة كبرت كثير" : "الدودة اصطدمت",
      "أكلتِ " + meals.length + " أصناف · الطول " + snake.length + " · النقاط " + score + "." + extra,
      "لعبة جديدة"
    );
  }

  function eatAt(nx, ny) {
    const idx = foods.findIndex((f) => f.x === nx && f.y === ny);
    if (idx < 0) return false;
    const food = foods.splice(idx, 1)[0];
    meals.push({ id: food.id, name: food.name, image: food.image });
    grow += 1;
    score += 12 + snake.length;
    tickMs = Math.max(MIN_TICK, tickMs - 6);
    startLoop();
    spawnFood(2);
    if (hint) hint.textContent = "أكلتِ " + food.name + "! الدودة كبرت.";
    return true;
  }

  function tick() {
    if (!playing) return;
    if (!primed) {
      draw();
      return;
    }
    if (queued) {
      dir = queued;
      queued = null;
    }
    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || hitSelf(nx, ny)) {
      gameOver();
      draw();
      return;
    }
    snake.unshift({ x: nx, y: ny });
    eatAt(nx, ny);
    if (grow > 0) grow -= 1;
    else snake.pop();
    setHud();
    draw();
  }

  function resetBoard() {
    stopLoop();
    playing = false;
    dir = { x: 1, y: 0 };
    queued = null;
    grow = 0;
    score = 0;
    meals = [];
    foods = [];
    tickMs = START_TICK;
    primed = false;
    snake = [{ x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 }];
    spawnFood(2);
    setHud();
    fitCanvas();
  }

  const NEED_MSG = "ارفعوا صور الأصناف من لوحة الإدارة. الدودة تأكل الصور المرفوعة فقط، مو الصور الافتراضية.";

  function startGame() {
    function begin() {
      const src = refreshPool();
      if (!src.length) {
        showOverlay("القائمة", "ماكو صور مرفوعة", NEED_MSG, "حاولي لاحقاً");
        return;
      }
      src.forEach((d) => loadImg(d.image));
      resetBoard();
      hideOverlay();
      playing = true;
      if (hint) hint.textContent = "اختاري اتجاه من الأسهم أو اسحبي. الدودة ما تمشي إلا بعد أول حركة.";
      startLoop();
      draw();
    }
    refreshPool();
    if (pool.length) {
      begin();
      return;
    }
    if (window.MenuStore && window.MenuStore.refreshPublished) {
      startBtn.disabled = true;
      window.MenuStore.refreshPublished().then((data) => {
        startBtn.disabled = false;
        if (data && data.menu) refreshPool(data.menu);
        begin();
      }).catch(() => {
        startBtn.disabled = false;
        begin();
      });
      return;
    }
    begin();
  }

  startBtn.addEventListener("click", startGame);
  pad && pad.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !playing) return;
    setDir(Number(btn.dataset.dx), Number(btn.dataset.dy));
  });
  document.addEventListener("keydown", (e) => {
    if (!playing) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
    };
    const next = map[e.key];
    if (!next) return;
    e.preventDefault();
    setDir(next[0], next[1]);
  });
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      playing = false;
      stopLoop();
      return;
    }
    if (!overlay.classList.contains("is-on") && snake.length > 1) {
      playing = true;
      startLoop();
    }
  });
  window.addEventListener("resize", () => fitCanvas());
  if (window.ResizeObserver) {
    new ResizeObserver(() => fitCanvas()).observe(canvas.parentElement);
  }

  resetBoard();
  showOverlay(
    "لقمة ورا لقمة",
    "هل تشبعين الدودة؟",
    "الأصناف المرفوعة من لوحة الإدارة، وكل واحد مكتوب اسمه. كلي بدون ما تصطدمي بالجدار أو بجسمك.",
    "ابدئي الدودة"
  );

  window.YAM_SNAKE = {
    useMenu: function (menu) {
      const next = refreshPool(menu);
      next.forEach((d) => loadImg(d.image));
      if (playing) return;
      resetBoard();
      showOverlay(
        "لقمة ورا لقمة",
        "هل تشبعين الدودة؟",
        "الأصناف المرفوعة من لوحة الإدارة، وكل واحد مكتوب اسمه. كلي بدون ما تصطدمي بالجدار أو بجسمك.",
        "ابدئي الدودة"
      );
    }
  };
  if (window.MenuStore && window.MenuStore.loadImmediate) {
    const live = window.MenuStore.loadImmediate();
    if (live && live.menu) window.YAM_SNAKE.useMenu(live.menu);
  }
})();
