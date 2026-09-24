(function () {
  const KEY = "yam-game-best-v1";
  const dishes = [
    { id: "dolma", name: "دولمة", image: "assets/dolma.jpg" },
    { id: "kibbeh", name: "كبة حلبية", image: "assets/kibbeh-halabi.jpg" },
    { id: "kleija", name: "كليجة", image: "assets/kleija-ghee.jpg" },
    { id: "qatayef", name: "قطايف", image: "assets/qatayef.jpg" },
    { id: "kabsa", name: "كبسة", image: "assets/kabsa.jpg" },
    { id: "pastry", name: "معجنات", image: "assets/pastry-mix.jpg" }
  ];

  const board = document.getElementById("game-board");
  const overlay = document.getElementById("game-overlay");
  const startBtn = document.getElementById("game-start");
  const hint = document.getElementById("game-hint");
  if (!board || !overlay || !startBtn) return;

  const scoreEl = document.getElementById("game-score");
  const movesEl = document.getElementById("game-moves");
  const timeEl = document.getElementById("game-time");
  const bestEl = document.getElementById("game-best");
  const titleEl = document.getElementById("game-overlay-title");
  const textEl = document.getElementById("game-overlay-text");
  const eyeEl = document.getElementById("game-overlay-eyebrow");

  let cards = [];
  let flipped = [];
  let lock = false;
  let matches = 0;
  let moves = 0;
  let score = 0;
  let seconds = 0;
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

  function formatTime(n) {
    const m = Math.floor(n / 60);
    const s = n % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function readBest() {
    try {
      return Number(localStorage.getItem(KEY) || 0) || 0;
    } catch (err) {
      return 0;
    }
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
    if (movesEl) movesEl.textContent = String(moves);
    if (timeEl) timeEl.textContent = formatTime(seconds);
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
      seconds += 1;
      if (timeEl) timeEl.textContent = formatTime(seconds);
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

  function buildBoard() {
    const pack = shuffle(dishes.concat(dishes)).map((dish, index) => ({
      uid: dish.id + "-" + index,
      id: dish.id,
      name: dish.name,
      image: dish.image
    }));
    cards = pack;
    board.innerHTML = pack.map((card) => (
      '<button class="game-card" type="button" data-uid="' + card.uid + '" data-id="' + card.id + '" aria-label="بطاقة مخفية">' +
        '<span class="game-card-inner">' +
          '<span class="game-face game-front" aria-hidden="true"></span>' +
          '<span class="game-face game-back">' +
            '<img src="' + card.image + '" alt="">' +
            '<em>' + card.name + '</em>' +
          "</span>" +
        "</span>" +
      "</button>"
    )).join("");
  }

  function reset() {
    stopTimer();
    playing = false;
    lock = false;
    flipped = [];
    matches = 0;
    moves = 0;
    score = 0;
    seconds = 0;
    setHud();
    renderBest();
    buildBoard();
  }

  function win() {
    playing = false;
    stopTimer();
    const timeBonus = Math.max(0, 180 - seconds) * 2;
    score += timeBonus;
    const best = readBest();
    const record = score > best;
    if (record) writeBest(score);
    renderBest();
    setHud();
    if (hint) hint.textContent = record ? "رقم قياسي جديد على هذا الجهاز." : "سفرتك اكتملت. تقدرين تلعبين مرة ثانية أو تطلبين من القائمة.";
    showOverlay(
      record ? "رقم قياسي" : "أحسنت",
      "السفرة اكتملت",
      "النقاط " + score + " · الحركات " + moves + " · الوقت " + formatTime(seconds),
      "العبي مرة ثانية"
    );
  }

  function flipBack(a, b) {
    setTimeout(() => {
      a.classList.remove("is-flipped");
      b.classList.remove("is-flipped");
      a.setAttribute("aria-label", "بطاقة مخفية");
      b.setAttribute("aria-label", "بطاقة مخفية");
      lock = false;
    }, 720);
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
    moves += 1;
    const first = flipped[0];
    const second = flipped[1];
    flipped = [];
    if (first.dataset.id === second.dataset.id) {
      first.classList.add("is-matched");
      second.classList.add("is-matched");
      matches += 1;
      const speedBonus = seconds < 20 ? 40 : seconds < 45 ? 20 : 0;
      score += 100 + speedBonus;
      setHud();
      if (hint) hint.textContent = "وجدتِ " + (card.name) + "!";
      lock = false;
      if (matches === dishes.length) win();
    } else {
      score = Math.max(0, score - 8);
      setHud();
      first.classList.add("is-miss");
      second.classList.add("is-miss");
      setTimeout(() => {
        first.classList.remove("is-miss");
        second.classList.remove("is-miss");
      }, 420);
      if (hint) hint.textContent = "مو نفس الصنف. جرّبي بطاقتين غير.";
      flipBack(first, second);
    }
  }

  function startGame() {
    reset();
    hideOverlay();
    playing = true;
    startTimer();
    if (hint) hint.textContent = "ضغطة على البطاقة تقلبها. طابقي كل صنف مع توأمه.";
  }

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".game-card");
    if (btn) onCard(btn);
  });
  startBtn.addEventListener("click", startGame);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") playing = false;
    else if (!overlay.classList.contains("is-on") && matches < dishes.length && seconds > 0) playing = true;
  });

  reset();
  showOverlay("جاهزة؟", "طابق الأصناف", "اقلبي بطاقتين في كل مرة، وجمعي السفرة كاملة.", "ابدئي اللعب");
})();
