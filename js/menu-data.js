window.YAM_DEFAULT = {
  extras: {
    savory: {
      sofra: { type: "toggle", label: "سفرة", hint: "تجهيز للسفرة والتقديم" },
      pickles: { type: "toggle", label: "طرشي" }
    },
    sweet: {
      sofra: { type: "toggle", label: "تجهيز للسفرة / تقديم ضيافة" },
      box: { type: "toggle", label: "علبة مناسبة" }
    },
    grill: {
      sofra: { type: "toggle", label: "سفرة", hint: "تجهيز للسفرة والتقديم" },
      pickles: { type: "toggle", label: "طرشي" },
      rice: { type: "toggle", label: "تمن أحمر", checked: true },
      greens: { type: "toggle", label: "خضرة" }
    },
    chicken: {
      sofra: { type: "toggle", label: "سفرة", hint: "تجهيز للسفرة والتقديم" },
      extraPickles: { type: "toggle", label: "طرشي إضافي" }
    },
    none: {}
  },
  extraOptions: {
    sofra: { type: "toggle", label: "سفرة", hint: "تجهيز للسفرة والتقديم" },
    pickles: { type: "toggle", label: "طرشي" },
    extraPickles: { type: "toggle", label: "طرشي إضافي" },
    rice: { type: "toggle", label: "تمن أحمر", checked: true },
    greens: { type: "toggle", label: "خضرة" },
    sweetSofra: { type: "toggle", label: "تجهيز للسفرة / تقديم ضيافة" },
    box: { type: "toggle", label: "علبة مناسبة" }
  },
  extraGroups: {
    savory: ["sofra", "pickles"],
    sweet: ["sweetSofra", "box"],
    grill: ["sofra", "pickles", "rice", "greens"],
    chicken: ["sofra", "extraPickles"],
    none: []
  },
  categories: [
    { id: "all", label: "الكل" },
    { id: "pastry", label: "معجنات ومقبلات" },
    { id: "kibbeh", label: "الكبة" },
    { id: "mains", label: "أطباق رئيسية" },
    { id: "dolma", label: "الدولمة" },
    { id: "sweets", label: "الحلويات" },
    { id: "special", label: "حسب الكمية" }
  ],
  assets: [
    "assets/pastry-mix.jpg",
    "assets/kibbeh-mix.jpg",
    "assets/kibbeh-halabi.jpg",
    "assets/kibbeh-mosul.jpg",
    "assets/kibbeh-burghul.jpg",
    "assets/kabsa.jpg",
    "assets/chicken-tray.jpg",
    "assets/dolma.jpg",
    "assets/kleija-ghee.jpg",
    "assets/kleija-walnut.jpg",
    "assets/kleija-plain.jpg",
    "assets/basbousa.jpg",
    "assets/cake-plain.jpg",
    "assets/cake-layer.jpg",
    "assets/qatayef.jpg",
    "assets/grilled-fish.jpg",
    "assets/qouzi.jpg"
  ],
  menu: [
    { id: "pastry-mix", category: "pastry", name: "لحم بعجين وميني بيتزا وفطائر", desc: "تشكيلة 50 قطعة، مناسبة للضيافة.", price: 35000, unit: "50 قطعة", image: "assets/pastry-mix.jpg", extrasKey: "savory" },
    { id: "rice-kibbeh-mix", category: "pastry", name: "كبة تمن وبورك وسمبوسة", desc: "50 قطعة مشكلة من كبة التمن والبورك والسمبوسة.", price: 35000, unit: "50 قطعة", image: "assets/kibbeh-mix.jpg", extrasKey: "savory" },
    { id: "kibbeh-halabi", category: "kibbeh", name: "كبة حلبية", desc: "كبة حلبية مقرمشة.", price: 10000, unit: "15 قطعة", image: "assets/kibbeh-halabi.jpg", extrasKey: "savory" },
    { id: "kibbeh-mosul", category: "kibbeh", name: "كبة هلالية موصلية", desc: "كبة موصلية هلالية.", price: 15000, unit: "10 قطع", image: "assets/kibbeh-mosul.jpg", extrasKey: "savory" },
    { id: "kibbeh-burghul", category: "kibbeh", name: "كبة برغل", desc: "اختَر الحجم المناسب لك.", image: "assets/kibbeh-burghul.jpg", extrasKey: "savory", variants: [{ id: "double", label: "دبل — 7 قطع", price: 10000 }, { id: "medium", label: "الوسط — 10 قطع", price: 10000 }] },
    { id: "kabsa", category: "mains", name: "كبسة الدجاج والمقلوبة", desc: "طبق رئيسي جاهز للسفرة.", price: 20000, unit: "صينية", image: "assets/kabsa.jpg", extrasKey: "grill" },
    { id: "chicken-tray", category: "mains", name: "صينية الدجاج", desc: "مع الملحقات: طرشي وخضرة وتتبيلة الدجاج.", image: "assets/chicken-tray.jpg", extrasKey: "chicken", variants: [{ id: "full", label: "صينية كاملة مع الملحقات", price: 15000 }, { id: "half", label: "نص صينية", price: 8000 }] },
    { id: "dolma", category: "dolma", name: "جدر دولمة", desc: "دولمة بيتية على ثلاث أحجام.", image: "assets/dolma.jpg", extrasKey: "savory", variants: [{ id: "large", label: "الحجم الكبير", price: 25000 }, { id: "medium", label: "الوسط", price: 17000 }, { id: "small", label: "الصغير", price: 10000 }] },
    { id: "kleija-free-fat", category: "sweets", name: "كليجة بالدهن الحر", desc: "بالتمر والحلقوم، السعر للكيلو.", price: 12000, unit: "كيلو", step: 0.5, image: "assets/kleija-ghee.jpg", extrasKey: "sweet" },
    { id: "kleija-walnut", category: "sweets", name: "كليجة الجوز", desc: "كليجة فاخرة بالجوز، السعر للكيلو.", price: 15000, unit: "كيلو", step: 0.5, image: "assets/kleija-walnut.jpg", extrasKey: "sweet" },
    { id: "kleija-janna", category: "sweets", name: "كليجة بدهن جنة", desc: "السعر للكيلو.", price: 7000, unit: "كيلو", step: 0.5, image: "assets/kleija-plain.jpg", extrasKey: "sweet" },
    { id: "basbousa", category: "sweets", name: "بسبوسة", desc: "اختَر بالقطر أو بالعسل، السعر للكيلو.", unit: "كيلو", step: 0.5, image: "assets/basbousa.jpg", extrasKey: "sweet", variants: [{ id: "qater", label: "بالقطر — الكيلو", price: 10000 }, { id: "honey", label: "بالعسل — الكيلو", price: 15000 }] },
    { id: "plain-cake", category: "sweets", name: "كيك سادة", desc: "قالب كبير.", price: 7000, unit: "قالب كبير", image: "assets/cake-plain.jpg", extrasKey: "sweet" },
    { id: "layer-cake", category: "sweets", name: "كيك الطبقات", desc: "حسب عدد الطبقات من 3 إلى 10 آلاف.", image: "assets/cake-layer.jpg", extrasKey: "sweet", variants: [{ id: "c3", label: "طبقات خفيفة — 3,000 د.ع", price: 3000 }, { id: "c5", label: "وسط — 5,000 د.ع", price: 5000 }, { id: "c8", label: "كبير — 8,000 د.ع", price: 8000 }, { id: "c10", label: "فاخر — 10,000 د.ع", price: 10000 }] },
    { id: "qatayef", category: "sweets", name: "قطايف بالقشطة", desc: "10 قطع.", price: 8000, unit: "10 قطع", image: "assets/qatayef.jpg", extrasKey: "sweet" },
    { id: "grilled-fish", category: "special", name: "سمك شوي", desc: "مع التمن الأحمر والطرشي. السعر حسب الكمية.", price: null, image: "assets/grilled-fish.jpg", extrasKey: "grill" },
    { id: "qouzi", category: "special", name: "قوزي لحم", desc: "حسب الكمية المطلوبة للمناسبة.", price: null, image: "assets/qouzi.jpg", extrasKey: "savory" }
  ]
};

window.YAM_EXTRA_IDS = function (item) {
  if (item && Array.isArray(item.extraIds)) return item.extraIds.slice();
  const groups = (window.YAM_DEFAULT && window.YAM_DEFAULT.extraGroups) || {};
  const key = item && item.extrasKey;
  if (key && groups[key]) return groups[key].slice();
  return [];
};

window.YAM_EXTRAS_FOR = function (item) {
  const defs = (window.YAM_DEFAULT && window.YAM_DEFAULT.extraOptions) || {};
  const custom = (item && item.customExtras) || {};
  const extras = {};
  window.YAM_EXTRA_IDS(item).forEach((id) => {
    if (custom[id]) extras[id] = Object.assign({ type: "toggle" }, custom[id]);
    else if (defs[id]) extras[id] = Object.assign({}, defs[id]);
  });
  return extras;
};
