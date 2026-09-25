(function () {
  const KEY = "yam-game-best-v2";
  const LIMIT = 300;
  const PEEK = 2200;

  const board = document.getElementById("game-board");
  const overlay = document.getElementById("game-overlay");
  const startBtn = document.getElementById("game-start");
  const hint = document.getElementById("game-hint");
  if (!board || !overlay || !startBtn) return;

  const scoreEl = document.getElementById("game-score");
  const comboEl = document.getElementById("game-combo");
  const timeEl = document.getElementById("game-time");
  const timeBox = document.querySelector(".game-time-box");
  const bestEl = document.getElementById("game-best");
  const titleEl = document.getElementById("game-overlay-title");
  const textEl = document.getElementById("game-overlay-text");
  const eyeEl = document.getElementById("game-overlay-eyebrow");

  let pool = [];
  let dishes = [];
  let cards = [];
  let flipped = [];
  let lock = false;
  let matches = 0;
  let misses = 0;
  let combo = 0;
  let score = 0;
  let left = LIMIT;
  let timer = null;
  let playing = false;

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

  function dishesFromMenu(menu) {
    const seen = {};
    const uploaded = [];
    const others = [];
    (menu || []).forEach((item) => {
      if (!item || !item.image) return;
      const image = media(item.image);
      if (!image || image.indexOf("data:") === 0) return;
      const key = imageKey(image);
      if (seen[key]) return;
      seen[key] = 1;
      const row = { id: String(item.id || key), name: String(item.name || "صنف"), image: image };
      if (/uploads\//i.test(key)) uploaded.push(row);
      else others.push(row);
    });
    return uploaded.length >= 4 ? uploaded : uploaded.concat(others);
  }

  function pickRound() {
    const src = pool.length ? pool : dishesFromMenu(
      (window.MenuStore && window.MenuStore.loadImmediate && (window.MenuStore.loadImmediate().menu || [])) || []
    );
    const count = Math.min(8, src.length);
    dishes = shuffle(src).slice(0, count);
    board.style.setProperty("--game-cols", dishes.length <= 6 ? "3" : "4");
  }

  function formatTime(n) {
    const m = Math.floor(Math.max(0, n) / 60);
    const s = Math.max(0, n) % 60;
    return m + ":" + String(s).padStart(2, "0");
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
    if (comboEl) comboEl.textContent = combo > 1 ? "×" + combo : "0";
    if (timeEl) timeEl.textContent = formatTime(left);
    if (timeBox) timeBox.classList.toggle("is-low", playing && left <= 15);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!playing) return;
      left -= 1;
      setHud();
      if (left <= 0) lose();
    }, 1000);
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

  function cardHtml(card) {
    return (
      '<button class="game-card" type="button" data-uid="' + card.uid + '" data-id="' + card.id + '" aria-label="بطاقة مخفية">' +
        '<span class="game-card-inner">' +
          '<span class="game-face game-front" aria-hidden="true"></span>' +
          '<span class="game-face game-back">' +
            '<img src="' + card.image + '" alt="' + card.name + '">' +
          "</span>" +
        "</span>" +
      "</button>"
    );
  }

  function buildBoard(pack) {
    cards = pack;
    board.innerHTML = pack.map(cardHtml).join("");
  }

  function currentPack() {
    return Array.prototype.map.call(board.querySelectorAll(".game-card"), (btn) => {
      const found = cards.find((item) => item.uid === btn.dataset.uid);
      return {
        uid: btn.dataset.uid,
        id: btn.dataset.id,
        name: found ? found.name : "",
        image: found ? found.image : "",
        matched: btn.classList.contains("is-matched")
      };
    });
  }

  function shuffleUnmatched() {
    const pack = currentPack();
    const open = pack.filter((card) => !card.matched);
    const kept = pack.filter((card) => card.matched);
    const mixed = kept.concat(shuffle(open));
    board.classList.add("is-shuffle");
    buildBoard(mixed);
    mixed.forEach((card) => {
      if (!card.matched) return;
      const btn = board.querySelector('[data-uid="' + card.uid + '"]');
      if (!btn) return;
      btn.classList.add("is-flipped", "is-matched");
      btn.setAttribute("aria-label", card.name);
    });
    setTimeout(() => board.classList.remove("is-shuffle"), 420);
    if (hint) hint.textContent = "البطاقات تبدّلت! ركّزي من جديد.";
  }

  function allButtons() {
    return board.querySelectorAll(".game-card");
  }

  function reset() {
    stopTimer();
    playing = false;
    lock = false;
    flipped = [];
    matches = 0;
    misses = 0;
    combo = 0;
    score = 0;
    left = LIMIT;
    setHud();
    renderBest();
    pickRound();
    const pack = shuffle(dishes.concat(dishes)).map((dish, index) => ({
      uid: dish.id + "-" + index,
      id: dish.id,
      name: dish.name,
      image: dish.image
    }));
    buildBoard(pack);
  }

  function finish(won) {
    playing = false;
    stopTimer();
    lock = true;
    const best = readBest();
    const record = won && score > best;
    if (record) writeBest(score);
    renderBest();
    setHud();
    if (won) {
      if (hint) hint.textContent = record ? "رقم قياسي جديد." : "سفرتك اكتملت قبل نفاد الوقت.";
      showOverlay(
        record ? "رقم قياسي" : "أحسنت",
        "لحقتِ السفرة",
        "النقاط " + score + " · السلسلة الأعلى ساعدتك · بقي " + formatTime(left),
        "تحدّي أقوى"
      );
    } else {
      if (hint) hint.textContent = "الوقت خلص. جرّبي مرة ثانية واحفظي الأماكن بسرعة.";
      showOverlay(
        "انتهى الوقت",
        "السفرة تفرّقت",
        "طابقتِ " + matches + " من " + dishes.length + " أصناف · النقاط " + score,
        "أعيدي المحاولة"
      );
    }
  }

  function win() {
    score += Math.max(0, left) * 5;
    finish(true);
  }

  function lose() {
    left = 0;
    finish(false);
  }

  function peekThenPlay() {
    lock = true;
    playing = false;
    Array.prototype.forEach.call(allButtons(), (btn) => btn.classList.add("is-flipped"));
    if (hint) hint.textContent = "احفظي أماكن الأصناف... تُخفى بعد لحظات.";
    setTimeout(() => {
      Array.prototype.forEach.call(allButtons(), (btn) => {
        if (!btn.classList.contains("is-matched")) {
          btn.classList.remove("is-flipped");
          btn.setAttribute("aria-label", "بطاقة مخفية");
        }
      });
      lock = false;
      playing = true;
      startTimer();
      if (hint) hint.textContent = "طابقي بالصورة فقط. خطآن متتاليان يحرّكان البطاقات.";
    }, PEEK);
  }

  function onCard(btn) {
    if (!playing || lock) return;
    if (btn.classList.contains("is-flipped") || btn.classList.contains("is-matched")) return;
    const card = cards.find((item) => item.uid === btn.dataset.uid);
    if (!card) return;
    btn.classList.add("is-flipped");
    btn.setAttribute("aria-label", card.name);
    flipped.push(btn);
    if (flipped.length < 2) return;

    lock = true;
    const first = flipped[0];
    const second = flipped[1];
    flipped = [];
    if (first.dataset.id === second.dataset.id) {
      first.classList.add("is-matched");
      second.classList.add("is-matched");
      matches += 1;
      misses = 0;
      combo += 1;
      const comboBonus = combo > 1 ? combo * 40 : 0;
      const rushBonus = left > 50 ? 30 : left > 25 ? 15 : 0;
      score += 120 + comboBonus + rushBonus;
      setHud();
      if (hint) {
        hint.textContent = combo > 1
          ? "سلسلة ×" + combo + " — وجدتِ " + card.name + "!"
          : "وجدتِ " + card.name + "!";
      }
      lock = false;
      if (matches === dishes.length) win();
    } else {
      combo = 0;
      misses += 1;
      score = Math.max(0, score - 15);
      setHud();
      first.classList.add("is-miss");
      second.classList.add("is-miss");
      setTimeout(() => {
        first.classList.remove("is-miss", "is-flipped");
        second.classList.remove("is-miss", "is-flipped");
        first.setAttribute("aria-label", "بطاقة مخفية");
        second.setAttribute("aria-label", "بطاقة مخفية");
        if (misses >= 2) {
          misses = 0;
          shuffleUnmatched();
        } else if (hint) {
          hint.textContent = "مو نفس الصورة. خطأ آخر يحرّك البطاقات.";
        }
        lock = false;
      }, 500);
    }
  }

  function startGame() {
    reset();
    hideOverlay();
    peekThenPlay();
  }

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".game-card");
    if (btn) onCard(btn);
  });
  startBtn.addEventListener("click", startGame);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") playing = false;
    else if (!overlay.classList.contains("is-on") && matches < dishes.length && left < LIMIT && left > 0) playing = true;
  });

  reset();
  showOverlay(
    "تحدّي",
    "هل تلحقين السفرة؟",
    "5 دقائق وصور أصنافكم الحقيقية بدون أسماء. احفظي الصورة ثم طابقي قبل نفاد الوقت.",
    "ابدئي التحدي"
  );

  window.YAM_GAME = {
    useMenu: function (menu) {
      const next = dishesFromMenu(menu);
      const same = next.map((d) => imageKey(d.image)).sort().join("|") === pool.map((d) => imageKey(d.image)).sort().join("|");
      pool = next;
      if (playing || lock || same) return;
      pickRound();
      reset();
      showOverlay(
        "تحدّي",
        "هل تلحقين السفرة؟",
        "5 دقائق وصور أصنافكم الحقيقية بدون أسماء. احفظي الصورة ثم طابقي قبل نفاد الوقت.",
        "ابدئي التحدي"
      );
    }
  };
  if (window.MenuStore && window.MenuStore.loadImmediate) {
    const live = window.MenuStore.loadImmediate();
    if (live && live.menu) window.YAM_GAME.useMenu(live.menu);
  }
})();
