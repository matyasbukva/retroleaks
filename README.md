# RetroLeaks

Batch light leak feldolgozó iPhone-ra, telepíthető webappként (PWA). A képek
soha nem hagyják el a telefont: a feldolgozás teljes egészében a böngészőben,
`canvas`-on fut.

---

## 1. Közzététel GitHub Pages-en

A PWA-hoz HTTPS kell — enélkül nincs se offline mód, se megosztás a Fotókba.
A GitHub Pages ingyen ad HTTPS-t.

1. Hozz létre egy **publikus** repót, például `retroleaks` néven.
2. Töltsd fel **ennek a mappának a tartalmát** a repó gyökerébe. Fontos: az
   `index.html` közvetlenül a gyökérben legyen, ne egy almappában.
3. A repóban: **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main`, mappa: `/ (root)`
   - Save
4. Egy-két perc múlva él a cím:
   `https://<felhasználóneved>.github.io/retroleaks/`

Parancssorból:

```bash
git init
git add .
git commit -m "RetroLeaks PWA"
git branch -M main
git remote add origin https://github.com/<felhasználóneved>/retroleaks.git
git push -u origin main
```

## 1/b. Kipróbálás számítógépen

Az `index.html` duplakattintással is megnyílik, és a feldolgozás működik.
Két dolog viszont nem: a service worker (offline mód) és a Fotókba mentés,
mert ezekhez HTTPS kell.

Ha a teljes működést akarod látni a gépeden, indíts egy helyi szervert a
mappában:

```
python -m http.server 8000
```

majd nyisd meg: `http://localhost:8000`

## 2. Telepítés iPhone-ra

1. Nyisd meg a címet **Safariban** (Chrome-ból nem megy a Kezdőképernyőhöz adás).
2. Megosztás gomb → **Hozzáadás a Kezdőképernyőhöz**.
3. Innentől saját ikonnal, teljes képernyőn, böngészősáv nélkül indul, és
   offline is működik.

Az első megnyitáskor letölti a 46 light leaket (kb. 3,4 MB), utána már
gyorsítótárból dolgozik.

## 3. Használat

1. **Képek kiválasztása** — több kép is jelölhető a Fotókból.
2. **Előnézet** — az első képen azonnal látod a hatást. Az intenzitás csúszka
   élőben frissíti; a *Másik leak* gomb új leaket és új irányt sorsol.
3. **Beállítások**
   - *Gyakoriság* — hány kép kap leaket. 100%-nál mindegyik.
   - *Intenzitás* — a fénycsík ereje.
   - *Véletlen irány és tükrözés* — 8-féle állás (0/90/180/270°, tükrözve is).
   - *Hosszabbik oldal* — a kimenet felbontásának plafonja.
4. **Feldolgozás indítása** — a kész képek kontaktmásolatként jelennek meg.
5. **Mentés a Fotókba** — a megosztás-lapon válaszd a **Képek mentése**
   lehetőséget.

### A mentésről

iOS-en a webapp nem tud magától a Fotókba írni, ezért a megosztás-lapon megy
keresztül. Két dolgot érdemes tudni:

- A **Képek mentése** eltűnik a lapról, ha egyszerre túl sok fájlt küldünk.
  Ezért megy csomagokban, alapból ötösével. Ha nem látod a lehetőséget, vedd
  lejjebb a csomagméretet.
- Egyetlen képet úgy mentesz, hogy **rákoppintasz a kockájára** a
  kontaktmásolaton. A hosszú nyomás itt nem jó: az csak a kis bélyegképet
  mentené, nem a teljes felbontású változatot.

## 4. Hogyan működik

A light leak képek háttere fekete. A **screen** blendnél a fekete semleges
(nem sötétít), a világos részek pedig ráfutnak a fotóra — pontosan ez a
film-burn hatás:

```
eredmény = 255 − (255 − fotó) × (255 − leak) / 255
```

Az intenzitás nem átlátszóságot állít, hanem a leak RGB értékeit szorozza. Így
a fekete fekete marad, csak a fénycsík halványodik — ez jobban hasonlít arra,
mintha kevesebb fény szivárgott volna be.

A `leaks/params.json` az eredeti app paramétereit tartalmazza: melyik leak
`STRETCH` (pontosan kitölti a képet, torzulhat) és melyik `FILL` (arányosan
befedi, a széle levágódik), utóbbinál igazítással együtt. A 46-ból három
kivétel van: `L1` = FILL/MC, `L5` = FILL/BL, `L33` = FILL/TR.

## 5. Korlátok

- **Vászonméret.** A Safari kb. 16,7 megapixelnél elvágja a vásznat, és üres
  képet ad. Ezért van felső határ a hosszabbik oldalra; az alapértelmezett
  4096 px bőven elég egy 12 MP-es fotóhoz. 48 MP-es képeknél a program
  automatikusan lekicsinyít.
- **Memória.** Kb. 40 képnél többet egyszerre kockázatos betölteni, mert a
  Safari újratöltheti a lapot. Az app figyelmeztet, ha átléped.
- **Metaadatok.** A kimenet új JPEG, tehát nem viszi tovább az eredeti EXIF-et
  (dátum, GPS, objektívadatok). Az orientáció viszont helyesen belesül a képbe.

## 6. Fájlok

```
index.html              felület
styles.css              stílus
app.js                  feldolgozás, előnézet, batch, megosztás
sw.js                   service worker (offline gyorsítótár)
manifest.webmanifest    PWA-leíró
icons/                  ikonok
leaks/L0.jpg … L45.jpg  a light leak készlet (1280 px, JPEG q85)
leaks/params.json       leakenkénti resize + igazítás (az app.js-ben is
                        benne van beépítve, hogy fájlból megnyitva is menjen)
```

Ha új leaket teszel a `leaks/` mappába, vedd fel a `params.json`-be is, és
emeld a `sw.js` `VERSION` értékét meg a benne lévő darabszámot, hogy a
gyorsítótár frissüljön.
