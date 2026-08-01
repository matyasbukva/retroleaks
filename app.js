'use strict';

/* ────────────────────────────────────────────────────────────
   RetroLeaks — batch light leak feldolgozó
   A screen blend a vászonon ugyanazt csinálja, mint a Core Image
   CIScreenBlendMode: a leak fekete háttere nem sötétít, a világos
   részek pedig ráfutnak a fotóra.
   ──────────────────────────────────────────────────────────── */

const PREVIEW_MAX = 900;          // az előnézet hosszabbik oldala
const THUMB_MAX = 320;            // a kontaktmásolat egy kockája
const JPEG_QUALITY = 0.92;
const MAX_PIXELS = 16e6;          // a Safari vászonkorlátja alatt maradunk
const MANY_FILES = 40;            // efölött figyelmeztetünk

/* Amit minden böngésző meg tud nyitni. */
const SAFE_FORMATS = {
  jpg: 'JPEG', jpeg: 'JPEG', jpe: 'JPEG', png: 'PNG',
  webp: 'WebP', gif: 'GIF', bmp: 'BMP'
};

/* Amit csak egyes böngészők: a HEIC iPhone-on megy, Windowson nem;
   a RAW formátumokat gyakorlatilag egyik böngésző sem nyitja meg. */
const RISKY_FORMATS = {
  heic: 'HEIC', heif: 'HEIF', avif: 'AVIF', tif: 'TIFF', tiff: 'TIFF',
  dng: 'DNG RAW', rw2: 'Panasonic RAW', cr2: 'Canon RAW', cr3: 'Canon RAW',
  nef: 'Nikon RAW', nrw: 'Nikon RAW', arw: 'Sony RAW', srf: 'Sony RAW',
  orf: 'Olympus RAW', raf: 'Fujifilm RAW', pef: 'Pentax RAW',
  srw: 'Samsung RAW', x3f: 'Sigma RAW'
};

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

function formatLabel(file) {
  const ext = extensionOf(file.name);
  if (SAFE_FORMATS[ext]) return SAFE_FORMATS[ext];
  if (RISKY_FORMATS[ext]) return RISKY_FORMATS[ext];
  if (file.type) return file.type.replace('image/', '').toUpperCase();
  return ext ? ext.toUpperCase() : 'ismeretlen';
}

function looksLikeImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  // Windowson a HEIC és a RAW gyakran üres MIME-típussal érkezik
  const ext = extensionOf(file.name);
  return Boolean(SAFE_FORMATS[ext] || RISKY_FORMATS[ext]);
}

/** Megnyitható-e ez a fájl EBBEN a böngészőben? */
function canDecode(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const img = new Image();
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 10000);
  });
}

const el = (id) => document.getElementById(id);

const ui = {
  picker: el('picker'),
  sourceMeta: el('sourceMeta'),
  sourceWarn: el('sourceWarn'),
  appError: el('appError'),
  counterNum: el('counterNum'),

  previewPanel: el('previewPanel'),
  previewImg: el('previewImg'),
  previewBusy: el('previewBusy'),
  previewMeta: el('previewMeta'),
  rerollBtn: el('rerollBtn'),

  frequency: el('frequency'),
  frequencyOut: el('frequencyOut'),
  intensity: el('intensity'),
  intensityOut: el('intensityOut'),
  orientation: el('orientation'),
  maxSide: el('maxSide'),
  maxSideOut: el('maxSideOut'),

  runBtn: el('runBtn'),
  progress: el('progress'),
  progressBar: el('progressBar'),
  progressMeta: el('progressMeta'),

  resultPanel: el('resultPanel'),
  sheet: el('sheet'),
  tally: el('tally'),
  saveBtn: el('saveBtn'),
  saveMeta: el('saveMeta'),
  chunk: el('chunk'),
  chunkOut: el('chunkOut'),

  leakCount: el('leakCount')
};

function showProblem(text) {
  ui.appError.hidden = false;
  ui.appError.textContent = text;
}

function clearProblem() {
  ui.appError.hidden = true;
  ui.appError.textContent = '';
}

const state = {
  leaks: [],
  files: [],
  results: [],
  previewRoll: null,      // { leak, rot, mirror } — a csúszkázás közben fix marad
  previewSourceURL: null,
  shareCursor: 0,
  busy: false
};

const leakCache = new Map();

/* ─────────── Leak katalógus ─────────── */

/* A katalógus be van építve a kódba, hogy az app akkor is működjön, ha
   közvetlenül fájlból nyitod meg: a file:// protokollon a fetch tiltott.
   A leaks/params.json csak felülírja, ha elérhető. */
const BUILTIN_LEAKS = [
  { file: 'L0.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L1.jpg', resize: 'FILL', align: 'MC' },
  { file: 'L2.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L3.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L4.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L5.jpg', resize: 'FILL', align: 'BL' },
  { file: 'L6.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L7.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L8.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L9.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L10.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L11.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L12.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L13.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L14.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L15.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L16.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L17.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L18.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L19.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L20.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L21.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L22.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L23.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L24.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L25.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L26.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L27.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L28.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L29.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L30.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L31.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L32.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L33.jpg', resize: 'FILL', align: 'TR' },
  { file: 'L34.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L35.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L36.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L37.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L38.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L39.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L40.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L41.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L42.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L43.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L44.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L45.jpg', resize: 'STRETCH', align: 'MC' }
];

function normalizeLeaks(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.file)
    .map((r) => ({
      file: String(r.file),
      resize: String(r.resize || 'STRETCH').toUpperCase(),
      align: String(r.align || 'MC').toUpperCase()
    }));
}

async function loadLeaks() {
  try {
    const response = await fetch('leaks/params.json', { cache: 'force-cache' });
    if (response.ok) {
      const parsed = normalizeLeaks(await response.json());
      if (parsed.length) return parsed;
    }
  } catch (error) {
    // file:// alatt a fetch mindig elbukik — a beépített listával megyünk tovább
  }
  return normalizeLeaks(BUILTIN_LEAKS);
}

function loadLeakImage(name) {
  if (leakCache.has(name)) return leakCache.get(name);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Hiányzik a leak: ${name}`));
    img.src = `leaks/${name}`;
  });

  leakCache.set(name, promise);
  return promise;
}

function rollLeak() {
  const leak = state.leaks[Math.floor(Math.random() * state.leaks.length)];
  const useOrientation = ui.orientation.checked;
  return {
    leak,
    rot: useOrientation ? [0, 90, 180, 270][Math.floor(Math.random() * 4)] : 0,
    mirror: useOrientation ? Math.random() < 0.5 : false
  };
}

/* ─────────── Kompozitálás ─────────── */

/** A forrásfotót vászonra rajzolja, EXIF-orientációval együtt, méretkorláttal. */
async function drawSource(file, maxSide) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;

  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(
      'a böngésző nem tudja megnyitni ezt a formátumot — mentsd JPEG-be'
    );
  }

  // A böngésző az EXIF-orientációt már alkalmazta, a naturalWidth/Height
  // a helyes állású méret.
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) {
    URL.revokeObjectURL(url);
    throw new Error('A kép mérete nem olvasható.');
  }

  const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  URL.revokeObjectURL(url);
  return canvas;
}

/** A leak elhelyezése a CSV STRETCH/FILL + igazítás szabályai szerint. */
function placeLeak(ctx, leakImg, roll, W, H) {
  const { rot, mirror } = roll;
  const { resize, align } = roll.leak;

  const sw = leakImg.naturalWidth;
  const sh = leakImg.naturalHeight;

  // Forgatás után a leak effektív oldalai felcserélődnek.
  const quarter = rot % 180 !== 0;
  const ew = quarter ? sh : sw;
  const eh = quarter ? sw : sh;

  let dw, dh, dx, dy;

  if (resize === 'FILL') {
    const s = Math.max(W / ew, H / eh);
    dw = ew * s;
    dh = eh * s;
    const v = align[0];
    const hz = align[1];
    dx = hz === 'L' ? 0 : hz === 'R' ? W - dw : (W - dw) / 2;
    dy = v === 'T' ? 0 : v === 'B' ? H - dh : (H - dh) / 2;
  } else {
    // STRETCH: pontosan kitölti a képet, az arány torzulhat.
    dw = W; dh = H; dx = 0; dy = 0;
  }

  // A forgatott koordinátarendszerben a rajzolt doboz oldalai visszacserélődnek,
  // hogy a vásznon a kívánt dw × dh lenyomat jöjjön ki.
  const bw = quarter ? dh : dw;
  const bh = quarter ? dw : dh;

  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  if (mirror) ctx.scale(-1, 1);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(leakImg, -bw / 2, -bh / 2, bw, bh);
  ctx.restore();
}

/** A leaket screen blenddel a vászonra égeti. A vászon helyben módosul. */
function applyLeak(canvas, leakImg, roll, intensity) {
  const W = canvas.width;
  const H = canvas.height;

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lx = layer.getContext('2d');

  // Fekete alap: a screen blendben semleges, tehát ahová nem ér el a leak,
  // ott a fotó érintetlen marad.
  lx.fillStyle = '#000000';
  lx.fillRect(0, 0, W, H);
  placeLeak(lx, leakImg, roll, W, H);

  // Intenzitás: a leak RGB értékeit szorozzuk. A fekete fekete marad,
  // a világos részek arányosan halványodnak.
  const k = Math.round(Math.max(0, Math.min(1, intensity)) * 255);
  if (k < 255) {
    lx.globalCompositeOperation = 'multiply';
    lx.fillStyle = `rgb(${k},${k},${k})`;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'source-over';
  }

  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  layer.width = 0;
  layer.height = 0;
}

const FILE_PROTOCOL_HELP =
  'az oldal fájlból (file://) fut, így a böngésző megtiltja a kép exportálását. ' +
  'Nyisd meg a github.io címről, vagy indíts helyi szervert a mappában: ' +
  'python -m http.server 8000';

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('a JPEG kódolás nem sikerült'))),
        'image/jpeg',
        quality
      );
    } catch (error) {
      // Beszennyezett vászon: a leak képet a böngésző más eredetűnek látja.
      // file:// alatt minden helyi fájl külön eredetnek számít.
      const tainted =
        (error && error.name === 'SecurityError') || /tainted/i.test(String(error && error.message));
      reject(new Error(tainted ? FILE_PROTOCOL_HELP : String(error && error.message)));
    }
  });
}

function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/* ─────────── Előnézet ─────────── */

let previewTimer = null;
let previewGeneration = 0;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 140);
}

async function renderPreview() {
  if (!state.files.length || !state.leaks.length) return;
  if (!state.previewRoll) state.previewRoll = rollLeak();

  // Gyors csúszkázásnál több render is elindulhat. A generációs jegy
  // gondoskodik arról, hogy csak a legfrissebb írja felül a képet.
  const generation = ++previewGeneration;
  ui.previewBusy.hidden = false;

  try {
    const canvas = await drawSource(state.files[0], PREVIEW_MAX);
    const leakImg = await loadLeakImage(state.previewRoll.leak.file);
    applyLeak(canvas, leakImg, state.previewRoll, Number(ui.intensity.value) / 100);

    const blob = await canvasToBlob(canvas, 0.86);
    releaseCanvas(canvas);

    if (generation !== previewGeneration) return;

    if (state.previewSourceURL) URL.revokeObjectURL(state.previewSourceURL);
    state.previewSourceURL = URL.createObjectURL(blob);
    ui.previewImg.src = state.previewSourceURL;

    const roll = state.previewRoll;
    const bits = [roll.leak.file, roll.leak.resize];
    if (roll.rot) bits.push(`${roll.rot}°`);
    if (roll.mirror) bits.push('tükrözve');
    ui.previewMeta.textContent = bits.join(' · ');
    clearProblem();
  } catch (error) {
    if (generation === previewGeneration) {
      ui.previewMeta.textContent = '';
      showProblem(error.message);
    }
  } finally {
    if (generation === previewGeneration) ui.previewBusy.hidden = true;
  }
}

/* ─────────── Batch ─────────── */

async function runBatch() {
  if (state.busy || !state.files.length) return;

  state.busy = true;
  ui.runBtn.disabled = true;
  ui.picker.disabled = true;
  ui.progress.hidden = false;
  ui.progressBar.style.width = '0%';

  clearResults();

  const frequency = Number(ui.frequency.value) / 100;
  const intensity = Number(ui.intensity.value) / 100;
  const maxSide = Number(ui.maxSide.value);
  const total = state.files.length;

  let leaked = 0;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const file = state.files[i];
    ui.progressMeta.textContent = `${i + 1} / ${total} — ${file.name}`;

    try {
      const canvas = await drawSource(file, maxSide);

      const gets = frequency >= 1 ? true : frequency <= 0 ? false : Math.random() < frequency;
      let roll = null;

      if (gets) {
        roll = rollLeak();
        const leakImg = await loadLeakImage(roll.leak.file);
        applyLeak(canvas, leakImg, roll, intensity);
        leaked++;
      }

      const blob = await canvasToBlob(canvas, JPEG_QUALITY);
      const thumb = await makeThumb(canvas);
      releaseCanvas(canvas);

      state.results.push({
        name: outputName(file.name),
        blob,
        thumbURL: thumb,
        leak: roll ? roll.leak.file : null
      });
    } catch (error) {
      failed++;
      showProblem(`${file.name} (${formatLabel(file)}): ${error.message}`);
      console.warn(file.name, error);
    }

    ui.progressBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
    await nextFrame();
  }

  ui.progressMeta.textContent = failed
    ? `Kész. ${state.results.length} kép, ${failed} sikertelen.`
    : `Kész. ${state.results.length} kép.`;

  buildSheet(leaked);

  state.busy = false;
  ui.runBtn.disabled = false;
  ui.picker.disabled = false;
}

async function makeThumb(canvas) {
  const s = Math.min(1, THUMB_MAX / Math.max(canvas.width, canvas.height));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(canvas.width * s));
  t.height = Math.max(1, Math.round(canvas.height * s));
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);

  const blob = await canvasToBlob(t, 0.7);
  releaseCanvas(t);
  return URL.createObjectURL(blob);
}

function outputName(original) {
  const stem = original.replace(/\.[^.]+$/, '') || 'kep';
  return `${stem}_leak.jpg`;
}

/* ─────────── Kontaktmásolat és mentés ─────────── */

function clearResults() {
  state.results.forEach((r) => URL.revokeObjectURL(r.thumbURL));
  state.results = [];
  state.shareCursor = 0;
  ui.sheet.innerHTML = '';
  ui.resultPanel.hidden = true;
}

function buildSheet(leaked) {
  ui.saveMeta.textContent = 'Egy kockára koppintva csak azt az egy képet küldöd el.';
  ui.sheet.innerHTML = '';

  state.results.forEach((result, i) => {
    // Gomb, nem div: a kocka megnyomása ezt az egy képet küldi a
    // megosztás-lapra, teljes felbontásban. A látszó bélyegkép kicsi,
    // szóval hosszú nyomással csak a kicsinyített változat mentődne.
    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'frame';
    frame.title = 'Mentés a Fotókba';

    const img = document.createElement('img');
    img.src = result.thumbURL;
    img.alt = result.leak
      ? `${i + 1}. kép, ${result.leak} leakkel`
      : `${i + 1}. kép, leak nélkül`;
    img.loading = 'lazy';

    const no = document.createElement('span');
    no.className = 'frame-no';
    no.textContent = String(i + 1).padStart(2, '0');

    frame.append(img, no);
    frame.addEventListener('click', () => shareOne(i));
    ui.sheet.append(frame);
  });

  ui.tally.textContent = `${leaked} / ${state.results.length} leakkel`;
  ui.resultPanel.hidden = state.results.length === 0;
  updateSaveButton();
}

function chunkSize() {
  return Number(ui.chunk.value);
}

function updateSaveButton() {
  const total = state.results.length;
  const done = state.shareCursor;

  if (!total) {
    ui.saveBtn.disabled = true;
    return;
  }

  if (done >= total) {
    ui.saveBtn.disabled = true;
    ui.saveBtn.textContent = 'Minden kép elküldve';
    ui.saveMeta.textContent =
      'Egy-egy kép újraküldéséhez koppints a kockájára a kontaktmásolaton.';
    return;
  }

  const from = done + 1;
  const to = Math.min(done + chunkSize(), total);

  ui.saveBtn.disabled = false;
  ui.saveBtn.textContent =
    total <= chunkSize()
      ? 'Mentés a Fotókba'
      : `Mentés a Fotókba · ${from}–${to} / ${total}`;
}

function paintSavedFlags() {
  Array.from(ui.sheet.children).forEach((frame, i) => {
    frame.classList.toggle('is-saved', Boolean(state.results[i] && state.results[i].saved));
  });
}

function toFiles(results) {
  return results.map((r) => new File([r.blob], r.name, { type: 'image/jpeg' }));
}

/** Igaz, ha elindult a megosztás-lap. Hamis, ha a felhasználó megszakította. */
async function shareFiles(files) {
  if (!navigator.canShare || !navigator.canShare({ files })) {
    ui.saveMeta.textContent =
      'Ez a böngésző nem tud képfájlt megosztani. Nyisd meg Safariban — ott a megosztás-lapról a „Képek mentése” a Fotókba teszi őket.';
    return false;
  }

  try {
    // Sem title, sem text: iOS különben szöveges megosztásnak veszi az egészet,
    // és eltűnik a „Képek mentése” a lapról.
    await navigator.share({ files });
    return true;
  } catch (error) {
    if (!(error && error.name === 'AbortError')) {
      ui.saveMeta.textContent = `A megosztás nem indult el: ${error.message}`;
    }
    return false;
  }
}

async function shareNext() {
  const total = state.results.length;
  if (state.shareCursor >= total) return;

  const slice = state.results.slice(state.shareCursor, state.shareCursor + chunkSize());
  const sent = await shareFiles(toFiles(slice));
  if (!sent) return;

  slice.forEach((r) => { r.saved = true; });
  state.shareCursor += slice.length;
  paintSavedFlags();
  updateSaveButton();

  if (state.shareCursor < total) {
    ui.saveMeta.textContent = 'Küldd a következő csomagot is.';
  }
}

async function shareOne(index) {
  const result = state.results[index];
  if (!result) return;

  const sent = await shareFiles(toFiles([result]));
  if (!sent) return;

  result.saved = true;
  paintSavedFlags();
}

/* ─────────── Kiválasztás ─────────── */

/** Formátumonként egy fájlt letesztel, és kiszűri, amit ez a böngésző nem tud. */
async function screenFormats(files) {
  const suspect = Array.from(
    new Set(files.map((f) => extensionOf(f.name)).filter((e) => !SAFE_FORMATS[e]))
  );

  const rejected = new Set();
  for (const ext of suspect) {
    const sample = files.find((f) => extensionOf(f.name) === ext);
    // eslint-disable-next-line no-await-in-loop
    if (!(await canDecode(sample))) rejected.add(ext);
  }

  const usable = [];
  const blocked = [];
  files.forEach((f) => (rejected.has(extensionOf(f.name)) ? blocked : usable).push(f));
  return { usable, blocked };
}

async function onPick(event) {
  const picked = Array.from(event.target.files || []).filter(looksLikeImage);

  clearResults();
  clearProblem();
  state.previewRoll = null;
  state.files = [];

  ui.progress.hidden = true;
  ui.previewPanel.hidden = true;
  ui.runBtn.disabled = true;
  ui.sourceWarn.hidden = true;
  ui.counterNum.textContent = String(picked.length).padStart(2, '0');

  if (!picked.length) {
    ui.sourceMeta.textContent = 'Még nincs kiválasztott kép.';
    return;
  }

  ui.sourceMeta.textContent = 'Fájlok ellenőrzése…';
  const { usable, blocked } = await screenFormats(picked);

  if (blocked.length) {
    const formats = Array.from(new Set(blocked.map(formatLabel))).join(', ');
    showProblem(
      `${blocked.length} fájlt nem tud megnyitni ez a böngésző (${formats}). ` +
      'A Chrome és az Edge Windowson nem kezeli a HEIC-et és a RAW formátumokat. ' +
      'iPhone-on Safariban a HEIC működik; egyébként mentsd JPEG-be a képeket.'
    );
  }

  state.files = usable;
  ui.counterNum.textContent = String(usable.length).padStart(2, '0');
  ui.runBtn.disabled = usable.length === 0;
  ui.previewPanel.hidden = usable.length === 0;

  if (!usable.length) {
    ui.sourceMeta.textContent = 'Egyetlen kiválasztott fájl sem használható.';
    return;
  }

  const mb = usable.reduce((sum, f) => sum + f.size, 0) / 1e6;
  const kinds = Array.from(new Set(usable.map(formatLabel))).join(', ');
  ui.sourceMeta.textContent = `${usable.length} kép · ${mb.toFixed(1)} MB · ${kinds}`;

  if (usable.length > MANY_FILES) {
    ui.sourceWarn.hidden = false;
    ui.sourceWarn.textContent = `${usable.length} kép egyszerre sok lehet a Safarinak. Ha közben újratölt az oldal, dolgozz ${MANY_FILES} képes adagokban.`;
  }

  renderPreview();
}

/* ─────────── Bekötés ─────────── */

function bind() {
  ui.picker.addEventListener('change', onPick);

  ui.frequency.addEventListener('input', () => {
    ui.frequencyOut.textContent = `${ui.frequency.value}%`;
  });

  ui.intensity.addEventListener('input', () => {
    ui.intensityOut.textContent = `${ui.intensity.value}%`;
    schedulePreview();
  });

  ui.orientation.addEventListener('change', () => {
    state.previewRoll = rollLeak();
    schedulePreview();
  });

  ui.maxSide.addEventListener('input', () => {
    ui.maxSideOut.textContent = `${ui.maxSide.value} px`;
  });

  ui.chunk.addEventListener('input', () => {
    ui.chunkOut.textContent = `${ui.chunk.value} kép`;
    updateSaveButton();
  });

  ui.rerollBtn.addEventListener('click', () => {
    state.previewRoll = rollLeak();
    renderPreview();
  });

  ui.runBtn.addEventListener('click', runBatch);
  ui.saveBtn.addEventListener('click', shareNext);

  window.addEventListener('beforeunload', (event) => {
    if (state.busy) event.preventDefault();
  });
}

async function init() {
  bind();

  try {
    state.leaks = await loadLeaks();
    ui.leakCount.textContent = String(state.leaks.length);
  } catch (error) {
    ui.sourceMeta.textContent = error.message;
    ui.runBtn.disabled = true;
    return;
  }

  // A file:// protokollon a feldolgozás elvileg sem tud működni: a beszennyezett
  // vásznat a böngésző nem engedi exportálni. Ezt rögtön mondjuk meg.
  if (location.protocol === 'file:') {
    showProblem('Így nem fog működni: ' + FILE_PROTOCOL_HELP);
  }

  // Indulási önellenőrzés: ha a leak képek nincsenek a szerveren, azt itt és
  // most mondjuk meg, ne a feldolgozás közepén derüljön ki.
  loadLeakImage(state.leaks[0].file).catch(() => {
    showProblem(
      'A light leak képek nem érhetők el (leaks/' + state.leaks[0].file + ').' +
      ' A feltöltésből valószínűleg kimaradt a leaks mappa — a ZIP-et előbb ki' +
      ' kell csomagolni, mert a Windows ZIP-nézetéből húzva az almappák nem' +
      ' kerülnek fel.'
    );
    ui.runBtn.disabled = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline mód nem elérhető, az app ettől még működik */
      });
    });
  }
}

init();
