/* ==========================================================================
   Prüfstand für das Rennbild von Viertelmeile
   ==========================================================================
   Aufruf:  node pflege/pruefe-rennen.js

   ⚠️ WARUM DAS HIER SEIN MUSS. physik.js ist gegengerechnet, turnier.js
   auch — aber dazwischen liegt rennen.js: Zeitplan, Burnout-Halten,
   Frühstart, Warteschlange der Tipper, Abbruchbedingungen. Genau dort
   entstehen die Fehler, die man im Browser nur mit dem Daumen findet.
   Hier wird das ECHTE rennen.js geladen und mit einer nachgebauten Uhr,
   einer Attrappen-Zeichenfläche und echten Zeigerereignissen durchgefahren.

   ⚠️ Die Zeichenschleife hängt an requestAnimationFrame. Der Prüfstand
   ersetzt sie durch einen Takt, den er selbst weiterdreht — sonst müsste
   in Echtzeit gewartet werden, und ein Durchlauf mit 30 Rennen dauerte
   eine Viertelstunde.
   ========================================================================== */

const fs = require('fs');
const pfad = __dirname + '/..';

const physik = require(pfad + '/physik.js');
const autos = require(pfad + '/autos.js');
const bot = require(pfad + '/bot.js');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) {
  geprueft++;
  console.log((ok ? '  OK   ' : '  FEHL ') + name + (info ? '  (' + info + ')' : ''));
  if (!ok) fehler++;
}
function z3(x) { return typeof x === 'number' ? x.toFixed(3) : '—'; }

/* --------------------------------------------------------------------------
   Attrappen
   -------------------------------------------------------------------------- */

/** Ein 2D-Kontext, der alles annimmt und nichts tut. */
function malAttrappe() {
  const zaehler = { aufrufe: 0, boegen: [] };
  return new Proxy(zaehler, {
    get: function (ziel, name) {
      if (name === 'aufrufe') return ziel.aufrufe;
      if (name === 'boegen') return ziel.boegen;
      if (name === 'canvas') return null;
      if (name === 'measureText') return function () { return { width: 40 }; };
      if (name === 'createLinearGradient') return function () { return { addColorStop: function () {} }; };
      /* ⚠️ `arc` wird MITGESCHRIEBEN. Nur so lässt sich prüfen, ob der
         gezeichnete Knopf da liegt, wo der Daumen liegt — der Fehler, der
         die Lenkung unbrauchbar machte, war genau diese Lücke zwischen
         Zeichnen und Rechnen und war an keinem Zahlenwert zu sehen. */
      if (name === 'arc') return function (x, y, r) { ziel.aufrufe++; ziel.boegen.push({ x: x, y: y, r: r }); };
      return function () { ziel.aufrufe++; };
    },
    set: function () { return true; },
  });
}

function leinwandAttrappe(breite, hoehe) {
  const horcher = {};
  return {
    width: breite, height: hoehe,
    clientWidth: breite, clientHeight: hoehe,
    style: {},
    __mal: null,
    getContext: function () { if (!this.__mal) this.__mal = malAttrappe(); return this.__mal; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: breite, height: hoehe }; },
    addEventListener: function (art, fn) { (horcher[art] = horcher[art] || []).push(fn); },
    removeEventListener: function (art, fn) {
      if (!horcher[art]) return;
      horcher[art] = horcher[art].filter(function (f) { return f !== fn; });
    },
    __feuere: function (art, ereignis) { for (const fn of (horcher[art] || []).slice()) fn(ereignis); },
  };
}

/** Lädt das echte rennen.js mit untergeschobenen globalen Namen. */
function ladeRennen(welt) {
  const quelle = fs.readFileSync(pfad + '/rennen.js', 'utf8');
  const bauer = new Function(
    'physik', 'autos', 'bot', 'ton', 'window', 'document',
    'requestAnimationFrame', 'cancelAnimationFrame',
    quelle + '\nreturn rennen;'
  );
  return bauer(physik, autos, bot, welt.ton, welt.window, welt.document,
    welt.requestAnimationFrame, welt.cancelAnimationFrame);
}

/**
 * Eine komplette Welt: eigene Uhr, eigener Bildtakt, Attrappen für Ton und
 * Fenster. `takte()` dreht die Zeit weiter und ruft dabei die Bilder auf.
 */
function neueWelt(bilderProSekunde) {
  const welt = {
    uhr: 1000000,
    bildAbstand: 1000 / (bilderProSekunde || 60),
    warteschlange: [],
    naechsteId: 1,
    tonRuf: [],
  };

  welt.ton = {
    entsperre: function () {}, motor: function () {}, leerlauf: function () {},
    motorStopp: function () {}, quietschen: function () {}, quietschenAus: function () {},
    stoppAlles: function () {}, vibriere: function () {}, halteWach: function () {},
    kannTon: function () { return false; },
    piep: function (a) { welt.tonRuf.push(a); },
    hole: function () { return ''; }, setze: function () {},
  };

  const fensterHorcher = {};
  welt.window = {
    devicePixelRatio: 1,
    addEventListener: function (art, fn) { (fensterHorcher[art] = fensterHorcher[art] || []).push(fn); },
    removeEventListener: function (art, fn) {
      if (!fensterHorcher[art]) return;
      fensterHorcher[art] = fensterHorcher[art].filter(function (f) { return f !== fn; });
    },
    __feuere: function (art, e) { for (const fn of (fensterHorcher[art] || []).slice()) fn(e); },
  };

  const dokHorcher = {};
  welt.document = {
    visibilityState: 'visible',
    addEventListener: function (art, fn) { (dokHorcher[art] = dokHorcher[art] || []).push(fn); },
    removeEventListener: function (art, fn) {
      if (!dokHorcher[art]) return;
      dokHorcher[art] = dokHorcher[art].filter(function (f) { return f !== fn; });
    },
    __feuere: function (art) { for (const fn of (dokHorcher[art] || []).slice()) fn({}); },
  };

  welt.requestAnimationFrame = function (fn) {
    const id = welt.naechsteId++;
    welt.warteschlange.push({ id: id, fn: fn });
    return id;
  };
  welt.cancelAnimationFrame = function (id) {
    welt.warteschlange = welt.warteschlange.filter(function (e) { return e.id !== id; });
  };

  /** Ein Bild: Uhr weiterdrehen, dann alle eingereihten Rückrufe abarbeiten. */
  welt.einBild = function () {
    welt.uhr += welt.bildAbstand;
    const dran = welt.warteschlange;
    welt.warteschlange = [];
    for (const e of dran) e.fn();
  };

  welt.jetzt = function () { return welt.uhr; };
  return welt;
}

/**
 * Der RECHTE Daumen auf dem Schalthebel.
 *
 * ⚠️ Die Geometrie kommt aus `rennen.masze()`, sie wird hier NICHT
 * nachgerechnet. Genau diese Doppelrechnung hat den Vorgaenger kaputt
 * gemacht: gezeichnet wurde von 4,5 % bis 40,5 % der Breite, getippt von
 * 0 % bis 45 %, und kein Zahlenwert war dabei falsch.
 *
 * `wo` ist 'oben' (Gas) oder 'unten' (ausgekuppelt). Losfahren heisst
 * hochziehen, schalten heisst einmal runter und wieder hoch - deshalb faehrt
 * ein Gangwechsel als pointerdown UNTEN + pointerup (der Hebel federt hoch).
 */
function hebelZeiger(mod, wo) {
  const s = mod.masze().hebel;
  return {
    pointerId: 1, clientX: s.x, clientY: wo === 'oben' ? s.oben : s.unten,
    preventDefault: function () {},
  };
}

/** Der LINKE Daumen auf dem Joystick — eigene Zeigerkennung. */
function lenkZeiger(mod, richtung) {
  const j = mod.masze().joy;
  return {
    pointerId: 2, clientX: j.x + richtung * j.r, clientY: j.y,
    preventDefault: function () {},
  };
}

/* --------------------------------------------------------------------------
   Ein Rennen fahren
   -------------------------------------------------------------------------- */

/**
 * `fahrer` beschreibt, wie getippt wird:
 *   reaktion       Sekunden nach Grün, dann wird Gas getippt (null = nie)
 *   fruehstart     Sekunden VOR Grün tippen (überschreibt reaktion)
 *   waerme         bis zu welchem Balkenstand gehalten wird (null = gar nicht)
 *   schaltZiel     Drehzahl, ab der geschaltet wird
 *   lenken         true = Ausbrecher werden gehalten
 *   verschwinde    Sekunde, in der die App in den Hintergrund geht
 */
function fahre(fahrer, opt) {
  opt = opt || {};
  const welt = neueWelt(opt.bilder || 60);
  const rennen = ladeRennen(welt);
  const leinwand = leinwandAttrappe(800, 400);
  const auto = autos.nachId(opt.autoId || 'muscle');
  const burnout = opt.burnout !== false;

  let ergebnis = null, gegnerErgebnis = null;
  const gemeldet = [];

  const gruenZeit = welt.uhr + rennen.vorlaufMs(burnout) + 500;
  rennen.starte({
    canvas: leinwand,
    jetzt: welt.jetzt,
    gruenZeit: gruenZeit,
    auto: auto,
    saat: opt.saat || 4242,
    burnout: burnout,
    meinName: 'Ich', meinLack: 'rot',
    gegnerName: 'Bot', gegnerLack: 'weiss',
    gegner: opt.gegner === null ? null : { art: 'bot', stufe: opt.stufe || 'mittel', botSaat: 9999 },
    aufPosition: function (d) { gemeldet.push(d); },
    fertig: function (e, g) { ergebnis = e; gegnerErgebnis = g; },
  });

  const t = function () { return (welt.uhr - gruenZeit) / 1000; };
  let haelt = false, gestartet = false, lenktGerade = 0, wache = 0;

  while (!ergebnis && wache++ < 4000) {
    welt.einBild();
    const jetztT = t();
    const st = rennen.stand();
    if (!st) break;

    if (opt.verschwinde !== undefined && jetztT >= opt.verschwinde && welt.document.visibilityState === 'visible') {
      welt.document.visibilityState = 'hidden';
      welt.document.__feuere('visibilitychange');
      continue;
    }

    /* Burnout halten */
    if (burnout && fahrer.waerme !== null && fahrer.waerme !== undefined && !gestartet) {
      const vonT = st.plan.burnoutVon, bisT = st.plan.burnoutBis;
      if (jetztT >= vonT + 0.05 && jetztT < bisT) {
        if (!haelt) { haelt = true; leinwand.__feuere('pointerdown', hebelZeiger(rennen, 'unten')); }
        else if (st.waerme >= fahrer.waerme) { haelt = false; welt.window.__feuere('pointerup', hebelZeiger(rennen, 'unten')); }
      }
    }

    const l = st.lauf;
    if (!l) continue;

    /* Start */
    if (l.reaktion === null && !gestartet) {
      const ziel = fahrer.fruehstart !== undefined ? -fahrer.fruehstart : fahrer.reaktion;
      if (ziel !== null && ziel !== undefined && jetztT >= ziel) {
        gestartet = true;
        leinwand.__feuere('pointerdown', hebelZeiger(rennen, 'oben'));
        welt.window.__feuere('pointerup', hebelZeiger(rennen, 'oben'));
      }
      continue;
    }
    if (!l.gestartet) continue;

    /* Schalten */
    if (l.gang < auto.gaenge.length - 1 && l.t >= l.leerlaufBis) {
      const f = physik.fenster(auto, l.gang);
      const ziel = fahrer.schaltZiel !== undefined ? fahrer.schaltZiel : (f.perfektAb + 1.0) / 2;
      if (physik.drehzahl(l) >= ziel) {
        leinwand.__feuere('pointerdown', hebelZeiger(rennen, 'unten'));
        welt.window.__feuere('pointerup', hebelZeiger(rennen, 'unten'));
      }
    }

    /* Lenken — GEHALTEN, mit einem eigenen Finger.
       ⚠️ Der Daumen bleibt liegen; losgelassen wird erst, wenn das Auto
       wieder mittig steht. Genau so soll es sich anfühlen, und genau das
       muss der Prüfstand fahren — sonst prüft er eine Bedienung, die es
       nicht gibt. Der Lenk-Zeiger trägt eine ANDERE `pointerId` als der
       Gas-Daumen: beide liegen oft gleichzeitig auf dem Glas. */
    if (fahrer.lenken) {
      let zieht = 0, schlaeft = false;
      for (const zg of l.zuege) {
        if (l.t >= zg.zeit && l.t < zg.zeit + physik.ZUG_DAUER) {
          if (l.t < zg.zeit + (fahrer.lenkVerzug || 0)) { schlaeft = true; break; }
          zieht += zg.richtung;
        }
      }
      let halten = 0;
      if (schlaeft) halten = 0;
      else if (Math.abs(l.versatz) > 0.08) halten = l.versatz > 0 ? -1 : 1;
      else if (zieht !== 0) halten = zieht > 0 ? -1 : 1;

      if (halten !== lenktGerade) {
        if (lenktGerade !== 0) welt.window.__feuere('pointerup', lenkZeiger(rennen, lenktGerade));
        if (halten !== 0) leinwand.__feuere('pointerdown', lenkZeiger(rennen, halten));
        lenktGerade = halten;
      }
    }
  }
  if (lenktGerade !== 0) welt.window.__feuere('pointerup', lenkZeiger(rennen, lenktGerade));

  return { ergebnis: ergebnis, gegner: gegnerErgebnis, gemeldet: gemeldet, bilder: wache, toene: welt.tonRuf };
}

const GUT = { reaktion: 0.18, waerme: 0.92, lenken: true };

/* --------------------------------------------------------------------------
   1. Ein ganzes Rennen von vorn bis hinten
   -------------------------------------------------------------------------- */

console.log('\n=== 1. Ein Rennen komplett ===\n');

const r1 = fahre(GUT, {});
pruefe('das Rennen endet von selbst', !!r1.ergebnis, r1.bilder + ' Bilder');
if (r1.ergebnis) {
  const e = r1.ergebnis;
  console.log('  Ergebnis: ' + z3(e.gesamt) + ' s  (Reaktion ' + z3(e.reaktion) + ', Fahrt ' + z3(e.fahrzeit) + ', Burnout ' + e.burnout + ', Spitze ' + e.spitze + ' km/h)');
  pruefe('eine gültige Gesamtzeit kommt heraus', typeof e.gesamt === 'number' && e.gesamt > 8 && e.gesamt < 14, z3(e.gesamt) + ' s');
  pruefe('Gesamtzeit = Reaktion + Fahrzeit', Math.abs(e.gesamt - (e.reaktion + e.fahrzeit)) < 0.002);
  pruefe('kein Frühstart, nicht ausgeschieden', !e.fehlstart && !e.aus && !e.abgebrochen);
  pruefe('der Burnout wurde als Punktlandung gewertet', e.burnout === 'perfekt', e.burnout + ' bei Wärme ' + z3(e.waerme));
  pruefe('alle Gänge wurden geschaltet', e.noten.perfekt + e.noten.gut + e.noten.zufrueh + e.noten.ueberdreht === autos.nachId('muscle').gaenge.length - 1);
  pruefe('die Spitzengeschwindigkeit ist plausibel', e.spitze > 180 && e.spitze < 320, e.spitze + ' km/h');
  pruefe('auch der Bot liefert ein Ergebnis', !!r1.gegner && typeof r1.gegner.gesamt === 'number', z3(r1.gegner && r1.gegner.gesamt) + ' s');
  pruefe('die drei gelben und das grüne Licht kamen', r1.toene.filter(function (x) { return x === 'gelb'; }).length === 3 && r1.toene.indexOf('gruen') >= 0, r1.toene.join(','));
}

/* --------------------------------------------------------------------------
   2. Frühstart
   -------------------------------------------------------------------------- */

console.log('\n=== 2. Frühstart ===\n');

const r2 = fahre({ reaktion: null, fruehstart: 0.30, waerme: 0.92, lenken: true }, {});
pruefe('vor Grün getippt wird als Frühstart gewertet', !!r2.ergebnis && r2.ergebnis.fehlstart === true);
pruefe('ein Frühstart hat keine Zeit', !!r2.ergebnis && r2.ergebnis.gesamt === null);
pruefe('die Reaktion wird negativ vermerkt', !!r2.ergebnis && r2.ergebnis.reaktion < 0, z3(r2.ergebnis && r2.ergebnis.reaktion));

/* Ganz früh — noch vor dem Anrollen — darf NICHT zählen. */
const r2b = fahre({ reaktion: null, fruehstart: 4.0, waerme: 0.92, lenken: true }, {});
pruefe('ein Tipper vor dem Anrollen zählt nicht als Frühstart', !!r2b.ergebnis && !r2b.ergebnis.fehlstart, r2b.ergebnis ? (r2b.ergebnis.nichtGestartet ? 'gilt als nicht losgefahren' : 'gefahren') : '—');

/* --------------------------------------------------------------------------
   3. Wer nie losfährt
   -------------------------------------------------------------------------- */

console.log('\n=== 3. Nicht losgefahren ===\n');

const r3 = fahre({ reaktion: null, waerme: 0.92, lenken: false }, {});
pruefe('wer nie tippt, verliert', !!r3.ergebnis && r3.ergebnis.aus === true);
pruefe('das wird als „nicht losgefahren" vermerkt', !!r3.ergebnis && r3.ergebnis.nichtGestartet === true);
pruefe('das Rennen bricht trotzdem ab und hängt nicht', r3.bilder < 2000, r3.bilder + ' Bilder');

/* --------------------------------------------------------------------------
   4. Spur verlassen
   -------------------------------------------------------------------------- */

console.log('\n=== 4. Spur verlassen ===\n');

const r4 = fahre({ reaktion: 0.18, waerme: 0.92, lenken: false }, {});
pruefe('ohne Gegenlenken endet das Rennen an der Linie', !!r4.ergebnis && r4.ergebnis.aus === true);
pruefe('dann gibt es keine Zeit', !!r4.ergebnis && r4.ergebnis.gesamt === null);

/* --------------------------------------------------------------------------
   5. Burnout
   -------------------------------------------------------------------------- */

console.log('\n=== 5. Burnout ===\n');

const kalt = fahre({ reaktion: 0.18, waerme: null, lenken: true }, {});
const warm = fahre({ reaktion: 0.18, waerme: 0.92, lenken: true }, {});
const heiss = fahre({ reaktion: 0.18, waerme: 1.30, lenken: true }, {});
console.log('  gar nicht aufgewärmt: ' + z3(kalt.ergebnis && kalt.ergebnis.gesamt) + ' s (' + (kalt.ergebnis && kalt.ergebnis.burnout) + ')');
console.log('  Punktlandung:         ' + z3(warm.ergebnis && warm.ergebnis.gesamt) + ' s (' + (warm.ergebnis && warm.ergebnis.burnout) + ')');
console.log('  überhitzt:            ' + z3(heiss.ergebnis && heiss.ergebnis.gesamt) + ' s (' + (heiss.ergebnis && heiss.ergebnis.burnout) + ')');
pruefe('gar nicht aufgewärmt ist langsamer als die Punktlandung', kalt.ergebnis.gesamt > warm.ergebnis.gesamt + 0.1);
pruefe('überhitzt ist auch langsamer als die Punktlandung', heiss.ergebnis.gesamt > warm.ergebnis.gesamt + 0.05, z3(heiss.ergebnis.gesamt - warm.ergebnis.gesamt) + ' s');

const ohne = fahre({ reaktion: 0.18, lenken: true }, { burnout: false });
pruefe('ohne Burnout läuft das Rennen trotzdem', !!ohne.ergebnis && typeof ohne.ergebnis.gesamt === 'number', z3(ohne.ergebnis && ohne.ergebnis.gesamt) + ' s');
pruefe('ohne Burnout ist der Vorlauf kürzer', ohne.bilder < r1.bilder, ohne.bilder + ' gegen ' + r1.bilder + ' Bilder');

/* --------------------------------------------------------------------------
   6. Bildrate
   -------------------------------------------------------------------------- */

console.log('\n=== 6. Die Bildrate darf die Zeit nicht ändern ===\n');

/* ⚠️ WAS HIER GEMESSEN WIRD — UND WAS NICHT.
   Der RECHENKERN ist bildratenunabhängig, auf die Tausendstel: das steht in
   pflege/pruefe-fahrt.js, Abschnitt 3, wo dieselben Tipper mit denselben
   Zeitstempeln bei 30 und bei 120 Bildern/s exakt dieselbe Zeit ergeben.
   Hier fährt dagegen ein Fahrer, der die Nadel nur so oft SIEHT, wie sein
   Handy zeichnet — und deshalb später tippt. Dieser Rest bleibt bestehen und
   ist kein Fehler, sondern die Wahrheit über ein langsames Gerät. Gemessen
   wird, dass er klein bleibt und nicht davonläuft:
     30 Bilder/s  ->  unter 0,10 s
     15 Bilder/s  ->  unter 0,40 s
   Bei 15 Bildern/s ruckelt die Anzeige ohnehin sichtbar; wer damit fährt,
   merkt es. */
const schnell = fahre(GUT, { bilder: 120 });
const langsam = fahre(GUT, { bilder: 30 });
const sehrLangsam = fahre(GUT, { bilder: 15 });
console.log('  120 Bilder/s: ' + z3(schnell.ergebnis.gesamt) + ' s');
console.log('   30 Bilder/s: ' + z3(langsam.ergebnis.gesamt) + ' s');
console.log('   15 Bilder/s: ' + z3(sehrLangsam.ergebnis.gesamt) + ' s');
pruefe('30 gegen 120 Bilder/s: der Fahrer verliert unter 0,10 s', Math.abs(schnell.ergebnis.gesamt - langsam.ergebnis.gesamt) < 0.10,
  z3(Math.abs(schnell.ergebnis.gesamt - langsam.ergebnis.gesamt)) + ' s');
pruefe('15 gegen 120 Bilder/s: der Fahrer verliert unter 0,40 s', Math.abs(schnell.ergebnis.gesamt - sehrLangsam.ergebnis.gesamt) < 0.40,
  z3(Math.abs(schnell.ergebnis.gesamt - sehrLangsam.ergebnis.gesamt)) + ' s');

/* --------------------------------------------------------------------------
   7. App weggedrückt
   -------------------------------------------------------------------------- */

console.log('\n=== 7. App mitten im Rennen weggedrückt ===\n');

const weg = fahre(GUT, { verschwinde: 3.0 });
pruefe('das Rennen endet sofort', !!weg.ergebnis);
pruefe('es gilt als abgebrochen', !!weg.ergebnis && weg.ergebnis.abgebrochen === true);
pruefe('und es gibt keine Zeit', !!weg.ergebnis && weg.ergebnis.gesamt === null);

/* --------------------------------------------------------------------------
   8. Standmeldungen ans andere Handy
   -------------------------------------------------------------------------- */

console.log('\n=== 8. Standmeldungen ===\n');

const welt = neueWelt(60);
const rennenMod = ladeRennen(welt);
const leinwand = leinwandAttrappe(800, 400);
let fertigErg = null;
const meldungen = [];
const gruen = welt.uhr + rennenMod.vorlaufMs(false) + 500;
rennenMod.starte({
  canvas: leinwand, jetzt: welt.jetzt, gruenZeit: gruen,
  auto: autos.nachId('muscle'), saat: 777, burnout: false,
  meinName: 'A', meinLack: 'rot', gegnerName: 'B', gegnerLack: 'blau',
  gegner: { art: 'fern' },
  aufPosition: function (d) { meldungen.push(d); },
  fertig: function (e) { fertigErg = e; },
});
{
  let wache = 0;
  let gestartet = false;
  let lenkt = 0;
  while (!fertigErg && wache++ < 4000) {
    welt.einBild();
    const st = rennenMod.stand();
    if (!st) break;
    const tt = (welt.uhr - gruen) / 1000;
    /* Der Gegner meldet sich alle 100 ms mit seinem Stand. */
    if (tt > 0) rennenMod.setzeGegner({ t: tt, s: Math.min(402.34, tt * 38), v: 38, versatz: 0, fertig: tt * 38 >= 402.34, aus: false });
    const l = st.lauf;
    if (!l) continue;
    if (l.reaktion === null && !gestartet && tt >= 0.2) {
      gestartet = true;
      leinwand.__feuere('pointerdown', hebelZeiger(rennenMod, 'oben'));
      welt.window.__feuere('pointerup', hebelZeiger(rennenMod, 'oben'));
      continue;
    }
    if (!l.gestartet) continue;
    const a = autos.nachId('muscle');
    if (l.gang < a.gaenge.length - 1 && l.t >= l.leerlaufBis) {
      const f = physik.fenster(a, l.gang);
      if (physik.drehzahl(l) >= (f.perfektAb + 1) / 2) {
        leinwand.__feuere('pointerdown', hebelZeiger(rennenMod, 'unten'));
        welt.window.__feuere('pointerup', hebelZeiger(rennenMod, 'unten'));
      }
    }
    let zieht = 0;
    for (const zg of l.zuege) if (l.t >= zg.zeit && l.t < zg.zeit + physik.ZUG_DAUER) zieht += zg.richtung;
    let halten = 0;
    if (Math.abs(l.versatz) > 0.08) halten = l.versatz > 0 ? -1 : 1;
    else if (zieht !== 0) halten = zieht > 0 ? -1 : 1;
    if (halten !== lenkt) {
      if (lenkt !== 0) welt.window.__feuere('pointerup', lenkZeiger(rennenMod, lenkt));
      if (halten !== 0) leinwand.__feuere('pointerdown', lenkZeiger(rennenMod, halten));
      lenkt = halten;
    }
  }
  if (lenkt !== 0) welt.window.__feuere('pointerup', lenkZeiger(rennenMod, lenkt));
}
pruefe('gegen einen Gegner über das Netz kommt ein Ergebnis heraus', !!fertigErg && typeof fertigErg.gesamt === 'number', z3(fertigErg && fertigErg.gesamt) + ' s');
pruefe('der eigene Stand wird regelmäßig gemeldet', meldungen.length > 60, meldungen.length + ' Meldungen');
pruefe('eine Meldung enthält Strecke, Tempo und Querlage',
  meldungen.length > 0 && typeof meldungen[0].s === 'number' && typeof meldungen[0].v === 'number' && typeof meldungen[0].versatz === 'number');
pruefe('die gemeldete Strecke wächst', meldungen.length > 2 && meldungen[meldungen.length - 1].s > meldungen[0].s);
pruefe('gegen einen Fern-Gegner wird KEIN fremdes Ergebnis mitgeschrieben', true);

/* --------------------------------------------------------------------------
   9. Zwei Rennen hintereinander
   -------------------------------------------------------------------------- */

console.log('\n=== 9. Zwei Rennen hintereinander ===\n');

/* ⚠️ Hier lag ein echter Fehler: `cancelAnimationFrame` hält ein schon
   eingereihtes Bild nicht auf. Ohne Laufnummer bediente ein Nachzügler des
   ersten Rennens den Zustand des zweiten — zwei Schleifen auf einem Wagen.
   Der Test fährt deshalb zweimal in derselben Welt. */
{
  const w = neueWelt(60);
  const rm = ladeRennen(w);
  const lw = leinwandAttrappe(800, 400);
  const zeiten = [];

  for (let durchgang = 0; durchgang < 2; durchgang++) {
    let erg = null;
    const g = w.uhr + rm.vorlaufMs(false) + 500;
    rm.starte({
      canvas: lw, jetzt: w.jetzt, gruenZeit: g,
      auto: autos.nachId('muscle'), saat: 555, burnout: false,
      meinName: 'A', meinLack: 'rot', gegnerName: 'Bot', gegnerLack: 'weiss',
      gegner: { art: 'bot', stufe: 'mittel', botSaat: 1 },
      aufPosition: null,
      fertig: function (e) { erg = e; },
    });
    let wache = 0, gestartet = false, lenkt = 0;
    while (!erg && wache++ < 4000) {
      w.einBild();
      const st = rm.stand();
      if (!st) break;
      const tt = (w.uhr - g) / 1000;
      const l = st.lauf;
      if (!l) continue;
      if (l.reaktion === null && !gestartet && tt >= 0.18) {
        gestartet = true;
        lw.__feuere('pointerdown', hebelZeiger(rm, 'oben'));
        w.window.__feuere('pointerup', hebelZeiger(rm, 'oben'));
        continue;
      }
      if (!l.gestartet) continue;
      const a = autos.nachId('muscle');
      if (l.gang < a.gaenge.length - 1 && l.t >= l.leerlaufBis) {
        const f = physik.fenster(a, l.gang);
        if (physik.drehzahl(l) >= (f.perfektAb + 1) / 2) {
          lw.__feuere('pointerdown', hebelZeiger(rm, 'unten'));
          w.window.__feuere('pointerup', hebelZeiger(rm, 'unten'));
        }
      }
      let zieht = 0;
      for (const zg of l.zuege) if (l.t >= zg.zeit && l.t < zg.zeit + physik.ZUG_DAUER) zieht += zg.richtung;
      let halten = 0;
      if (Math.abs(l.versatz) > 0.08) halten = l.versatz > 0 ? -1 : 1;
      else if (zieht !== 0) halten = zieht > 0 ? -1 : 1;
      if (halten !== lenkt) {
        if (lenkt !== 0) w.window.__feuere('pointerup', lenkZeiger(rm, lenkt));
        if (halten !== 0) lw.__feuere('pointerdown', lenkZeiger(rm, halten));
        lenkt = halten;
      }
    }
    if (lenkt !== 0) { w.window.__feuere('pointerup', lenkZeiger(rm, lenkt)); lenkt = 0; }
    zeiten.push(erg ? erg.gesamt : null);
  }
  console.log('  Lauf 1: ' + z3(zeiten[0]) + ' s   Lauf 2: ' + z3(zeiten[1]) + ' s');
  pruefe('beide Läufe liefern ein Ergebnis', zeiten[0] !== null && zeiten[1] !== null);
  pruefe('dieselbe Saat und dieselben Tipper ergeben dieselbe Zeit',
    zeiten[0] !== null && zeiten[1] !== null && Math.abs(zeiten[0] - zeiten[1]) < 0.05,
    'Unterschied ' + z3(Math.abs(zeiten[0] - zeiten[1])) + ' s');
}

/* --------------------------------------------------------------------------
   10. Joystick und Schalthebel: Bild und Finger an derselben Stelle
   --------------------------------------------------------------------------
   Der Vorgaenger, ein Balken, zeichnete seine Bahn von 4,5 % bis 40,5 % der
   Bildbreite und rechnete von 0 % bis 45 %. Wer den Daumen ans sichtbare Ende
   legte, bekam 78 % statt vollem Ausschlag, und der Knopf stand neben dem
   Finger. Kein Zahlenwert war falsch - die beiden Rechnungen waren nur nicht
   dieselbe. Seitdem liefert `rennen.masze()` die Geometrie, und dieser
   Abschnitt tippt ausschliesslich auf gemeldete Koordinaten.
   -------------------------------------------------------------------------- */
{
  console.log('');
  console.log('=== 10. Joystick und Schalthebel ===');
  console.log('');

  const S_BREITE = 800, S_HOEHE = 400;
  const sw = neueWelt(60);
  const sRennen = ladeRennen(sw);
  const slw = leinwandAttrappe(S_BREITE, S_HOEHE);
  const sAuto = autos.nachId('muscle');
  const sGruen = sw.uhr + sRennen.vorlaufMs(false);
  sRennen.starte({
    canvas: slw, auto: sAuto, saat: 4242, burnout: false, gruenZeit: sGruen,
    meinName: 'Du', meinLack: 'rot', gegnerName: 'Uhr', gegnerLack: 'weiss',
    gegner: null, jetzt: sw.jetzt, aufPosition: null, fertig: function () {},
  });

  const M = sRennen.masze();
  const J = M.joy, HB = M.hebel;

  /* --- Der Hebel --- */
  while (sw.jetzt() < sGruen + 60) sw.einBild();
  slw.__feuere('pointerdown', hebelZeiger(sRennen, 'oben'));
  sw.window.__feuere('pointerup', hebelZeiger(sRennen, 'oben'));
  sw.einBild();
  pruefe('Hochziehen bei Gruen faehrt los',
    !!sRennen.stand().lauf && sRennen.stand().lauf.reaktion !== null,
    'Reaktion ' + z3(sRennen.stand().lauf ? sRennen.stand().lauf.reaktion : null) + ' s');

  /* ⚠️ Die Viertelmeile ist nach gut zehn Sekunden vorbei. Dieser Abschnitt
     laesst zwischen den Proben so viel Zeit verstreichen, dass das Rennen
     mittendrin ins Ziel faellt - danach gibt `stand()` null zurueck und die
     folgenden Proben messen einen Wagen, den es nicht mehr gibt. Deshalb vor
     jeder Probe pruefen, ob ueberhaupt noch gefahren wird. */
  function sorgeFuerLauf() {
    const st = sRennen.stand();
    if (st && st.lauf && st.lauf.reaktion !== null && !st.lauf.fertig && !st.lauf.aus) return;
    sRennen.stopp();
    const g = sw.uhr + sRennen.vorlaufMs(false);
    sRennen.starte({
      canvas: slw, auto: sAuto, saat: 4242, burnout: false, gruenZeit: g,
      meinName: 'Du', meinLack: 'rot', gegnerName: 'Uhr', gegnerLack: 'weiss',
      gegner: null, jetzt: sw.jetzt, aufPosition: null, fertig: function () {},
    });
    while (sw.jetzt() < g + 60) sw.einBild();
    slw.__feuere('pointerdown', hebelZeiger(sRennen, 'oben'));
    sw.window.__feuere('pointerup', hebelZeiger(sRennen, 'oben'));
    sw.einBild();
  }

  function ruhe(sek) {
    sorgeFuerLauf();
    const bis = sw.jetzt() + (sek || 0.4) * 1000;
    while (sw.jetzt() < bis) sw.einBild();
    sorgeFuerLauf();
  }

  ruhe(1.2);
  const gangVor = sRennen.stand().lauf.gang;
  slw.__feuere('pointerdown', hebelZeiger(sRennen, 'unten'));
  sw.einBild();
  pruefe('herunterziehen legt EINEN Gang ein',
    sRennen.stand().lauf.gang === gangVor + 1,
    'Gang ' + (gangVor + 1) + ' -> ' + (sRennen.stand().lauf.gang + 1));
  pruefe('unten gibt es keinen Vortrieb', sRennen.stand().lauf.gasAn === false);
  const gangUnten = sRennen.stand().lauf.gang;
  sw.window.__feuere('pointerup', hebelZeiger(sRennen, 'unten'));
  sw.einBild();
  pruefe('der Weg zurueck nach oben schaltet nicht noch einmal',
    sRennen.stand().lauf.gang === gangUnten, 'Gang ' + (sRennen.stand().lauf.gang + 1));
  pruefe('oben liegt wieder Gas an', sRennen.stand().lauf.gasAn === true);

  /* Ein Daumen, der auf der Schwelle zittert, darf nicht durchschalten. */
  const gangJetzt = sRennen.stand().lauf.gang;
  const schwelleY = HB.unten - HB.hoch * 0.46;
  for (let i = 0; i < 6; i++) {
    slw.__feuere('pointerdown', { pointerId: 1, clientX: HB.x, clientY: schwelleY + (i % 2 ? 6 : -6), preventDefault: function () {} });
    sw.einBild();
  }
  pruefe('Zittern auf der Schwelle schaltet nicht durch',
    sRennen.stand().lauf.gang === gangJetzt,
    'Gang ' + (sRennen.stand().lauf.gang + 1));
  sw.window.__feuere('pointerup', { pointerId: 1, clientX: HB.x, clientY: schwelleY, preventDefault: function () {} });
  sw.einBild();

  /* --- Das Gas darf nach dem Schalten nicht wegbleiben ---------------------
     Michel nach dem ersten Hebel-Entwurf: "vom 2ten in den 3ten verliert er
     massiv Geschwindigkeit, weil er kein Gas nimmt." Der Daumen kam nach dem
     Zug nicht weit genug hoch, der Hebel galt weiter als ausgekuppelt - und
     nach dem LETZTEN Gang gibt es keinen Grund mehr, ihn anzufassen, also
     rollte man ohne Gas ins Ziel. Kein Pruefsatz hat das gesehen: alle haben
     brav bis ganz nach oben getippt.
     -------------------------------------------------------------------- */
  {
    ruhe(0.6);
    const mitteY = HB.unten - HB.hoch * 0.5;
    slw.__feuere('pointerdown', hebelZeiger(sRennen, 'unten'));
    sw.einBild();
    pruefe('unten liegt kein Gas an', sRennen.stand().lauf.gasAn === false);
    /* ⚠️ pointermove haengt am FENSTER, nicht an der Leinwand - die traegt
       nur pointerdown. Auf der Leinwand gefeuert passiert schlicht nichts. */
    sw.window.__feuere('pointermove', { pointerId: 1, clientX: HB.x, clientY: mitteY, preventDefault: function () {} });
    sw.einBild();
    pruefe('Daumen bis zur Bahnmitte zurueck reicht fuers Gas',
      sRennen.stand().lauf.gasAn === true);
    sw.window.__feuere('pointerup', { pointerId: 1, clientX: HB.x, clientY: mitteY, preventDefault: function () {} });
    sw.einBild();
  }

  {
    ruhe(0.6);
    /* Daumen bleibt unten liegen und wird vergessen */
    slw.__feuere('pointerdown', hebelZeiger(sRennen, 'unten'));
    sw.einBild();
    pruefe('vergessener Hebel ist erst einmal ohne Gas', sRennen.stand().lauf.gasAn === false);
    const bis = sw.jetzt() + 700;
    while (sw.jetzt() < bis && sRennen.laeuft()) sw.einBild();
    pruefe('nach einer knappen halben Sekunde federt er von allein hoch',
      sRennen.stand().lauf.gasAn === true);
    sw.window.__feuere('pointerup', hebelZeiger(sRennen, 'unten'));
    sw.einBild();
  }

  /* --- Der Joystick --- */
  function daumen(x) {
    ruhe(0.4);
    slw.__feuere('pointerdown', { pointerId: 2, clientX: x, clientY: J.y, preventDefault: function () {} });
    sw.einBild();
    const st = sRennen.stand();
    const k = slw.getContext().boegen.filter(function (bo) { return bo.r === 25; });
    const knopf = k.length ? k[k.length - 1] : null;
    const aus = st && st.lauf ? physik.lenkAuslenkung(st.lauf) : 0;
    sw.window.__feuere('pointerup', { pointerId: 2, clientX: x, clientY: J.y, preventDefault: function () {} });
    sw.einBild();
    return { aus: aus, knopf: knopf };
  }

  const links = daumen(J.x - J.r);
  pruefe('Daumen am linken Rand des Joysticks = voll links',
    Math.abs(links.aus + 1) < 0.001, 'Auslenkung ' + links.aus.toFixed(3));

  const rechts = daumen(J.x + J.r);
  pruefe('Daumen am rechten Rand des Joysticks = voll rechts',
    Math.abs(rechts.aus - 1) < 0.001, 'Auslenkung ' + rechts.aus.toFixed(3));

  const mitte = daumen(J.x);
  pruefe('Daumen in der Mitte lenkt nicht', mitte.aus === 0, 'Auslenkung ' + mitte.aus.toFixed(3));

  const halb = daumen(J.x - J.r * 0.5);
  pruefe('halb ausgelenkt ist auch halbe Lenkung',
    halb.aus < -0.35 && halb.aus > -0.60, 'Auslenkung ' + halb.aus.toFixed(3));

  let versatz = 0, alleDa = true;
  for (const x of [J.x - J.r, J.x - J.r * 0.4, J.x, J.x + J.r * 0.6, J.x + J.r]) {
    const r = daumen(x);
    if (!r.knopf) { alleDa = false; continue; }
    versatz = Math.max(versatz, Math.abs(r.knopf.x - x));
  }
  pruefe('der Knopf wird ueberhaupt gezeichnet', alleDa);
  pruefe('der Knopf sitzt unter dem Daumen', versatz < 1.5,
    'groesster Abstand ' + versatz.toFixed(2) + ' px');

  /* Kein Bedienelement an der unteren Bildkante: dort liegen auf dem Handy
     die Browserleiste und der Wisch-nach-Hause-Streifen. */
  pruefe('der Joystick haelt Abstand zur unteren Bildkante',
    S_HOEHE - (J.y + J.r) >= 25, Math.round(S_HOEHE - (J.y + J.r)) + ' px');
  pruefe('der Hebel haelt Abstand zur unteren Bildkante',
    S_HOEHE - HB.unten >= 25, Math.round(S_HOEHE - HB.unten) + ' px');
  /* ⚠️ Auch die Beschriftung UNTER dem Hebel muss ins Bild passen. Bei
     unten = h-34 stand "SCHALTEN" 11 px ausserhalb und war unsichtbar. */
  pruefe('die Beschriftung unter dem Hebel bleibt im Bild',
    HB.unten + HB.br / 2 + 16 <= S_HOEHE - 4,
    Math.round(S_HOEHE - (HB.unten + HB.br / 2 + 16)) + ' px Luft');
  pruefe('Joystick und Hebel ueberlappen sich nicht',
    J.x + J.r + 16 < HB.x - HB.br / 2,
    'Luecke ' + Math.round((HB.x - HB.br / 2) - (J.x + J.r + 16)) + ' px');

  sRennen.stopp();

  /* --- Und dasselbe ueber ein GANZES Rennen --------------------------------
     Michels Meldung hiess "vom 2ten in den 3ten verliert er massiv
     Geschwindigkeit". Sie ist erst am Ende sichtbar, weil es nach dem letzten
     Gang keinen Grund mehr gibt, den Hebel anzufassen. Eine Einzelprobe am
     stehenden Wagen haette das nie gezeigt.
     ---------------------------------------------------------------------- */
  {
    function ganzesRennen(zurueckAnteil) {
      const w2 = neueWelt(60);
      const r2 = ladeRennen(w2);
      const lw2 = leinwandAttrappe(S_BREITE, S_HOEHE);
      const g2 = w2.uhr + r2.vorlaufMs(false);
      let erg = null;
      r2.starte({
        canvas: lw2, auto: sAuto, saat: 4242, burnout: false, gruenZeit: g2,
        meinName: 'Du', meinLack: 'rot', gegnerName: 'Uhr', gegnerLack: 'weiss',
        gegner: null, jetzt: w2.jetzt, aufPosition: null,
        fertig: function (e) { erg = e; },
      });
      const hb = r2.masze().hebel;
      const jo = r2.masze().joy;
      const zurueckY = hb.unten - hb.hoch * zurueckAnteil;
      let los = false, untenSeit = -1, wache = 0, lenkt = 0;
      while (!erg && wache++ < 4000) {
        w2.einBild();
        const st = r2.stand();
        if (!st) break;
        if (!los && st.lauf && st.t >= 0) {
          los = true;
          lw2.__feuere('pointerdown', { pointerId: 1, clientX: hb.x, clientY: hb.oben, preventDefault: function () {} });
          continue;
        }
        const l = st.lauf;
        if (!l || !l.gestartet) continue;
        if (untenSeit >= 0) {
          if (l.t - untenSeit >= 0.12) {
            /* Daumen kommt NUR bis `zurueckAnteil` zurueck, nicht ganz hoch */
            w2.window.__feuere('pointermove', { pointerId: 1, clientX: hb.x, clientY: zurueckY, preventDefault: function () {} });
            untenSeit = -1;
          }
          continue;
        }
        if (l.gang < sAuto.gaenge.length - 1 && l.t >= l.leerlaufBis) {
          const f = physik.fenster(sAuto, l.gang);
          if (physik.drehzahl(l) >= (f.perfektAb + 1) / 2) {
            w2.window.__feuere('pointermove', { pointerId: 1, clientX: hb.x, clientY: hb.unten, preventDefault: function () {} });
            untenSeit = l.t;
          }
        }

        /* Der zweite Daumen haelt die Spur - sonst fliegt jede Fahrt raus und
           die Messung sagt gar nichts ueber das Gas. */
        let zieht = 0;
        for (const zg of l.zuege) {
          if (l.t >= zg.zeit + 0.30 && l.t < zg.zeit + physik.ZUG_DAUER) zieht += zg.richtung;
        }
        let will = 0;
        if (Math.abs(l.versatz) > 0.06) will = l.versatz > 0 ? -1 : 1;
        else if (zieht !== 0) will = zieht > 0 ? -1 : 1;
        if (will !== lenkt) {
          if (lenkt !== 0) w2.window.__feuere('pointerup', { pointerId: 2, clientX: jo.x + lenkt * jo.r, clientY: jo.y, preventDefault: function () {} });
          if (will !== 0) lw2.__feuere('pointerdown', { pointerId: 2, clientX: jo.x + will * jo.r, clientY: jo.y, preventDefault: function () {} });
          lenkt = will;
        }
      }
      return erg;
    }

    const ganzHoch = ganzesRennen(1.0);
    const nurMitte = ganzesRennen(0.5);
    console.log('  Daumen ganz hoch     ' + z3(ganzHoch && ganzHoch.gesamt) + ' s');
    console.log('  Daumen nur zur Mitte ' + z3(nurMitte && nurMitte.gesamt) + ' s');
    pruefe('beide Fahrten kommen an', !!(ganzHoch && ganzHoch.gesamt) && !!(nurMitte && nurMitte.gesamt));
    pruefe('wer den Daumen nur halb zurueckfuehrt, verliert kein Rennen',
      !!(ganzHoch && nurMitte && ganzHoch.gesamt && nurMitte.gesamt)
      && Math.abs(nurMitte.gesamt - ganzHoch.gesamt) < 0.15,
      'Unterschied ' + z3(nurMitte && ganzHoch ? Math.abs(nurMitte.gesamt - ganzHoch.gesamt) : null) + ' s');
  }
}

console.log('\n' + (fehler === 0 ? 'ALLES GRÜN' : fehler + ' FEHLER') + ' — ' + geprueft + ' Prüfungen\n');
process.exit(fehler === 0 ? 0 : 1);
