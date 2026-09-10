/* ==========================================================================
   Prüfstand für den Rechenkern von Viertelmeile
   ==========================================================================
   Aufruf:  node pflege/pruefe-fahrt.js
            node pflege/pruefe-fahrt.js --tabelle     (nur die Zeiten zeigen)

   ⚠️ Geprüft wird der ECHTE Code: physik.js, autos.js und bot.js, dieselben
   Dateien, die der Browser lädt. Kein Nachbau.

   Was hier belegt werden muss:
     1. Eine perfekte Fahrt liegt je Auto im gewollten Zeitfenster.
     2. Können schlägt Glück: schwer > mittel > leicht, deutlich.
     3. Der Rechentakt ist bildratenunabhängig — 30 Bilder/s ergeben
        dieselbe Zeit wie 120.
     4. In der Fahrt steckt kein Zufall (beide Handys fahren dasselbe).
     6. Frühstart verliert, auch gegen eine langsamere Fahrt.
   ========================================================================== */

const physik = require('../physik.js');
const autos = require('../autos.js');
const bot = require('../bot.js');

let fehler = 0;
let geprueft = 0;

function pruefe(name, bedingung, info) {
  geprueft++;
  if (bedingung) {
    console.log('  OK   ' + name + (info ? '  (' + info + ')' : ''));
  } else {
    fehler++;
    console.log('  FEHL ' + name + (info ? '  (' + info + ')' : ''));
  }
}

function z3(x) { return x === null || x === undefined ? '—' : x.toFixed(3); }

/* --------------------------------------------------------------------------
   Bausteine fuer die Pruef-Fahrten
   --------------------------------------------------------------------------
   ⚠️ SCHALTEN LAEUFT UEBER DEN HEBEL, auch hier. Ein Pruefstand, der
   `physik.schalte()` direkt ruft, schaltet in null Sekunden und misst eine
   Fahrt, die kein Daumen fahren kann. `HEBEL_ZUG` ist die Zeit, die ein
   flinker Daumen fuer runter-und-wieder-hoch braucht.
   -------------------------------------------------------------------------- */

const HEBEL_ZUG = 0.12;

/** Schaltet, sobald die Nadel im oberen Teil des gruenen Fensters steht. */
function schalteWennOben(l, auto, plan) {
  if (l.gang >= auto.gaenge.length - 1 || l.t < l.leerlaufBis) return false;
  const f = physik.fenster(auto, l.gang);
  if (physik.drehzahl(l) < (f.perfektAb + 1.0) / 2) return false;
  if (plan) plan.push({ zeit: l.t, art: 'hebel', oben: false });
  physik.hebel(l, false);
  return true;
}

/**
 * Eine ganze Fahrt mit sauberem Hebel: schalten, `zug` Sekunden unten
 * bleiben, wieder hoch. `opt.plan` sammelt die Tipper mit Zeitstempel.
 */
function fahreMitHebel(auto, saat, opt) {
  const o = opt || {};
  const l = physik.neuerLauf(auto, saat, o.waerme === undefined ? 0.95 : o.waerme);
  physik.starte(l, o.reaktion === undefined ? 0.180 : o.reaktion);
  const zug = o.zug === undefined ? HEBEL_ZUG : o.zug;
  let untenBis = -1, wache = 0;
  while (!l.fertig && !l.aus && wache++ < 20000) {
    physik.schritt(l, physik.SCHRITT);
    if (l.fertig || l.aus) break;
    if (untenBis >= 0) {
      if (l.t >= untenBis) {
        physik.hebel(l, true);
        if (o.plan) o.plan.push({ zeit: l.t, art: 'hebel', oben: true });
        untenBis = -1;
      }
      continue;
    }
    if (l.gang >= auto.gaenge.length - 1 || l.t < l.leerlaufBis) continue;
    const f = physik.fenster(auto, l.gang);
    const ziel = o.schaltZiel === undefined ? (f.perfektAb + 1.0) / 2 : o.schaltZiel;
    if (physik.drehzahl(l) >= ziel) {
      physik.hebel(l, false);
      if (o.plan) o.plan.push({ zeit: l.t, art: 'hebel', oben: false });
      untenBis = l.t + zug;
    }
  }
  return l;
}

function perfekteFahrt(auto, saat) { return fahreMitHebel(auto, saat, {}); }

/* --------------------------------------------------------------------------
   1. Zeitfenster je Auto
   -------------------------------------------------------------------------- */

console.log('\n=== 1. Perfekte Fahrt je Auto (Schnitt aus 40 Saaten) ===\n');

/* Von-bis in Sekunden GESAMT (Reaktion + Fahrzeit). Ein echtes Drag Race
   über die Viertelmeile liegt bei 9 bis 12 s — darin soll die Flotte liegen,
   sonst wird das Rennen entweder hektisch oder zäh. */
const SOLL = {
  flitzer: [11.0, 13.0],
  muscle: [9.8, 11.4],
  dragster: [8.8, 10.4],
};

const zeiten = {};
for (const auto of autos.LISTE) {
  let summe = 0, n = 0, min = 99, max = 0;
  const noten = { perfekt: 0, gut: 0, zufrueh: 0, ueberdreht: 0 };
  for (let saat = 1; saat <= 40; saat++) {
    const l = perfekteFahrt(auto, saat * 7919);
    const g = physik.gesamtzeit(l);
    if (g === null) { max = 99; continue; }
    summe += g; n++;
    if (g < min) min = g;
    if (g > max) max = g;
    for (const k in noten) noten[k] += l.noten[k];
  }
  const schnitt = n ? summe / n : null;
  zeiten[auto.id] = schnitt;
  const s = SOLL[auto.id];
  console.log('  ' + auto.name.padEnd(16) + ' Schnitt ' + z3(schnitt) + ' s   von ' + z3(min) + ' bis ' + z3(max) +
    '   Noten p/g/f/ü: ' + noten.perfekt + '/' + noten.gut + '/' + noten.zufrueh + '/' + noten.ueberdreht);
  pruefe(auto.name + ' liegt im Zeitfenster ' + s[0] + '–' + s[1] + ' s', n === 40 && schnitt >= s[0] && schnitt <= s[1], z3(schnitt) + ' s');
  pruefe(auto.name + ': perfekter Fahrer trifft fast immer perfekt', noten.zufrueh + noten.ueberdreht <= noten.perfekt * 0.12,
    noten.perfekt + ' perfekt gegen ' + (noten.zufrueh + noten.ueberdreht) + ' daneben');
}

pruefe('Dragster ist schneller als Muscle-Car', zeiten.dragster < zeiten.muscle);
pruefe('Muscle-Car ist schneller als Flitzer', zeiten.muscle < zeiten.flitzer);

/* --------------------------------------------------------------------------
   2. Können schlägt Glück
   -------------------------------------------------------------------------- */

console.log('\n=== 2. Bot-Stufen gegeneinander (200 Rennen je Paarung) ===\n');

function botSchnitt(auto, stufe, anzahl) {
  let summe = 0, n = 0, raus = 0;
  for (let i = 1; i <= anzahl; i++) {
    const l = bot.fahre(auto, i * 104729, stufe, i * 31337);
    const g = physik.gesamtzeit(l);
    if (g === null) { raus++; continue; }
    summe += g; n++;
  }
  return { schnitt: n ? summe / n : null, raus: raus, n: n };
}

function duell(auto, stufeA, stufeB, anzahl) {
  let a = 0, b = 0, un = 0;
  for (let i = 1; i <= anzahl; i++) {
    const saat = i * 104729;
    const la = bot.fahre(auto, saat, stufeA, i * 31337);
    const lb = bot.fahre(auto, saat, stufeB, i * 65599);
    const w = physik.vergleiche(la, lb);
    if (w === 'a') a++; else if (w === 'b') b++; else un++;
  }
  return { a: a, b: b, un: un };
}

const auto = autos.nachId('muscle');
for (const st of ['leicht', 'mittel', 'schwer']) {
  const r = botSchnitt(auto, st, 200);
  console.log('  ' + bot.stufe(st).name.padEnd(8) + ' Schnitt ' + z3(r.schnitt) + ' s, ' + r.raus + ' von 200 ausgeschieden');
}

const d1 = duell(auto, 'schwer', 'leicht', 200);
const d2 = duell(auto, 'schwer', 'mittel', 200);
const d3 = duell(auto, 'mittel', 'leicht', 200);
console.log('  schwer gegen leicht: ' + d1.a + ':' + d1.b + ' (' + d1.un + ' unentschieden)');
console.log('  schwer gegen mittel: ' + d2.a + ':' + d2.b + ' (' + d2.un + ' unentschieden)');
console.log('  mittel gegen leicht: ' + d3.a + ':' + d3.b + ' (' + d3.un + ' unentschieden)');
pruefe('schwer gewinnt klar gegen leicht', d1.a > d1.b * 6, d1.a + ':' + d1.b);
pruefe('schwer gewinnt gegen mittel', d2.a > d2.b * 1.6, d2.a + ':' + d2.b);
pruefe('mittel gewinnt gegen leicht', d3.a > d3.b * 3, d3.a + ':' + d3.b);
/* ⚠️ Kein „leicht schlägt schwer manchmal" mehr. Das stand hier zuerst, ging
   aber an der Sache vorbei: Der Gastgeber stellt EINE Bot-Stärke ein, leicht
   gegen schwer kommt im Spiel nie vor. Und über eine Viertelmeile schlägt ein
   Anfänger einen Könner auch in echt nicht — das wäre kein Beleg für Glück,
   sondern für kaputte Stufen. Was wirklich zählt: Innerhalb EINER Stufe muss
   es spannend bleiben. */
const gleichStark = duell(auto, 'mittel', 'mittel', 300);
console.log('  mittel gegen mittel: ' + gleichStark.a + ':' + gleichStark.b + ' (' + gleichStark.un + ' unentschieden)');
const anteil = gleichStark.a / (gleichStark.a + gleichStark.b);
pruefe('zwei gleich starke Fahrer teilen sich die Siege', anteil > 0.40 && anteil < 0.60, (anteil * 100).toFixed(0) + '% zu ' + (100 - anteil * 100).toFixed(0) + '%');
pruefe('der Abstand zwischen den Stufen ist größer als der Zufall darin',
  Math.abs(botSchnitt(auto, 'mittel', 200).schnitt - botSchnitt(auto, 'schwer', 200).schnitt) > 0.15);

/* --------------------------------------------------------------------------
   3. Bildrate darf nichts ändern
   -------------------------------------------------------------------------- */

console.log('\n=== 3. Fester Rechentakt ===\n');

/* Dieselben Tipper, einmal auf einem Handy mit 120 Bildern/s und einmal auf
   einem mit 30 — und einmal mit ganz krummen Bildabständen, wie sie
   entstehen, wenn das Gerät nebenher zu tun hat. Es muss dieselbe Zeit
   herauskommen, sonst gewinnt das bessere Handy statt des besseren Fahrers. */

function fahrplanAufnehmen(a, saat) {
  const l = physik.neuerLauf(a, saat, 0.95);
  physik.starte(l, 0.180);
  const plan = [];
  let wache = 0;
  while (!l.fertig && !l.aus && wache++ < 20000) {
    physik.schritt(l, physik.SCHRITT);
    if (l.fertig || l.aus) break;
    schalteWennOben(l, a, plan);
  }
  return plan;
}

function abspielen(a, saat, plan, bilder) {
  const l = physik.neuerLauf(a, saat, 0.95);
  physik.starte(l, 0.180);
  const q = plan.map(function (x) { return { zeit: x.zeit, art: x.art, oben: x.oben }; });
  let uhr = 0, wache = 0;
  while (!l.fertig && !l.aus && wache++ < 5000) {
    uhr += typeof bilder === 'function' ? bilder() : 1 / bilder;
    physik.laufeBis(l, uhr, q);
  }
  return l;
}

let groessteAbweichung = 0;
let holpernAbweichung = 0;
for (const a of autos.LISTE) {
  for (let saat = 1; saat <= 10; saat++) {
    const s = saat * 7919;
    const plan = fahrplanAufnehmen(a, s);
    const schnell = abspielen(a, s, plan, 120);
    const langsam = abspielen(a, s, plan, 30);
    /* Krumme Bildabstände zwischen 8 und 60 ms, aus der Saat gewürfelt. */
    const w = physik.saatZufall(s ^ 0x5bf03635);
    const holprig = abspielen(a, s, plan, function () { return 0.008 + w() * 0.052; });
    const va = physik.gesamtzeit(schnell), vb = physik.gesamtzeit(langsam), vc = physik.gesamtzeit(holprig);
    if (va === null || vb === null || vc === null) { groessteAbweichung = 99; break; }
    groessteAbweichung = Math.max(groessteAbweichung, Math.abs(va - vb));
    holpernAbweichung = Math.max(holpernAbweichung, Math.abs(va - vc));
  }
}
pruefe('30 und 120 Bilder/s ergeben dieselbe Zeit', groessteAbweichung < 0.0005, 'größte Abweichung ' + groessteAbweichung.toFixed(6) + ' s');
pruefe('ruckelnde Bildrate ergibt dieselbe Zeit', holpernAbweichung < 0.0005, 'größte Abweichung ' + holpernAbweichung.toFixed(6) + ' s');

/* --------------------------------------------------------------------------
   4. Beide Fahrer fahren dieselbe Fahrt
   --------------------------------------------------------------------------
   ⚠️ Seit die Lenkung raus ist, gibt es in einem Lauf ueberhaupt keinen
   Zufall mehr: dasselbe Auto plus dieselben Tipper ergeben immer dieselbe
   Zeit, egal welche Saat. Die Saat wandert nur noch als Kennzeichen des
   Rennens mit. Genau DAS wird hier festgehalten - wer spaeter wieder etwas
   Gewuerfeltes einbaut, muss hier vorbeikommen.
   -------------------------------------------------------------------------- */

console.log('');
console.log('=== 4. Beide Fahrer fahren dieselbe Fahrt ===');
console.log('');

{
  const auto = autos.nachId('muscle');
  let gleich = true, groesster = 0;
  const erste = perfekteFahrt(auto, 1).zielZeit;
  for (let saat = 1; saat <= 200; saat++) {
    const z = perfekteFahrt(auto, saat * 7919).zielZeit;
    if (z === null) { gleich = false; break; }
    groesster = Math.max(groesster, Math.abs(z - erste));
  }
  pruefe('die Saat aendert an der Fahrt nichts mehr', gleich && groesster < 0.0005,
    'groesste Abweichung ' + groesster.toFixed(6) + ' s');

  /* Gegenprobe: die Tipper aendern sehr wohl etwas. */
  const frueh = fahreMitHebel(auto, 1, { schaltZiel: 0.80 });
  const spaet = fahreMitHebel(auto, 1, { schaltZiel: 1.06 });
  pruefe('andere Tipper ergeben andere Zeiten',
    physik.gesamtzeit(frueh) !== physik.gesamtzeit(erste ? spaet : spaet)
    && Math.abs(physik.gesamtzeit(frueh) - physik.gesamtzeit(spaet)) > 0.05,
    z3(physik.gesamtzeit(frueh)) + ' gegen ' + z3(physik.gesamtzeit(spaet)) + ' s');
}

/* --------------------------------------------------------------------------
   6. Frühstart
   -------------------------------------------------------------------------- */

console.log('\n=== 5. Frühstart ===\n');

const schnellAberFrueh = { gesamt: null, fehlstart: true, aus: false, reaktion: -0.05 };
const langsamAberSauber = { gesamt: 14.9, fehlstart: false, aus: false, reaktion: 0.9 };
pruefe('Frühstart verliert gegen jede saubere Fahrt', physik.vergleiche(schnellAberFrueh, langsamAberSauber) === 'b');

const frueherFuss = { gesamt: null, fehlstart: true, aus: false, reaktion: -0.20 };
const spaetererFuss = { gesamt: null, fehlstart: true, aus: false, reaktion: -0.02 };
pruefe('bei zwei Frühstarts verliert der Frühere', physik.vergleiche(frueherFuss, spaetererFuss) === 'b');

const linieBeruehrt = { gesamt: null, fehlstart: false, aus: true, reaktion: 0.2 };
pruefe('Linie berührt verliert gegen Frühstart nicht automatisch', physik.vergleiche(linieBeruehrt, frueherFuss) === 'a');
pruefe('zwei Ausgeschiedene sind unentschieden', physik.vergleiche(linieBeruehrt, { gesamt: null, fehlstart: false, aus: true, reaktion: 0.3 }) === null);

const gleichA = { gesamt: 10.123, fehlstart: false, aus: false, reaktion: 0.2 };
const gleichB = { gesamt: 10.123, fehlstart: false, aus: false, reaktion: 0.3 };
pruefe('exakt gleiche Zeit ist unentschieden', physik.vergleiche(gleichA, gleichB) === null);

/* --------------------------------------------------------------------------
   7. Burnout
   -------------------------------------------------------------------------- */

console.log('\n=== 6. Burnout ===\n');

pruefe('Punktlandung gibt vollen Griff', physik.griffAusBurnout(0.90) === 1.0);
pruefe('kalte Reifen greifen schlechter', physik.griffAusBurnout(0.20) < 0.8, z3(physik.griffAusBurnout(0.20)));
pruefe('verbrannte Reifen greifen schlechter', physik.griffAusBurnout(1.35) < 0.8, z3(physik.griffAusBurnout(1.35)));
pruefe('ohne Burnout liegt der Griff dazwischen', physik.griffAusBurnout(null) > 0.8 && physik.griffAusBurnout(null) < 1.0, z3(physik.griffAusBurnout(null)));

const mitBurnout = perfekteFahrt(autos.nachId('muscle'), 12345);
const l2 = fahreMitHebel(autos.nachId('muscle'), 12345, { waerme: 0.10 });
const abstand = physik.gesamtzeit(l2) - physik.gesamtzeit(mitBurnout);
console.log('  kalte Reifen kosten ' + abstand.toFixed(3) + ' s');
pruefe('kalter Burnout kostet spürbar Zeit', abstand > 0.05 && abstand < 1.2, abstand.toFixed(3) + ' s');

/* --------------------------------------------------------------------------
   8. Jeder Fehler kostet Zeit — und zwar spürbar
   -------------------------------------------------------------------------- */

console.log('\n=== 7. Was ein Fehler kostet ===\n');

/* Immer dasselbe Auto und dieselbe Saat, nur EIN Fehler unterscheidet die
   Läufe. So ist der Zeitunterschied wirklich diesem Fehler zuzuschreiben. */
function fahrtMit(opt) {
  const a = autos.nachId('muscle');
  const l = physik.neuerLauf(a, 4242, opt.waerme === undefined ? 0.95 : opt.waerme);
  physik.starte(l, opt.reaktion === undefined ? 0.180 : opt.reaktion);
  let wache = 0;
  while (!l.fertig && !l.aus && wache++ < 20000) {
    physik.schritt(l, physik.SCHRITT);
    if (l.fertig || l.aus) break;
    if (l.gang < a.gaenge.length - 1 && l.t >= l.leerlaufBis) {
      const f = physik.fenster(a, l.gang);
      const ziel = opt.schaltZiel === undefined ? (f.perfektAb + 1.0) / 2 : opt.schaltZiel;
      if (physik.drehzahl(l) >= ziel) physik.schalte(l);
    }
  }
  return l;
}

const makellos = fahrtMit({});
const zuFrueh = fahrtMit({ schaltZiel: 0.80 });
const ueberdreht = fahrtMit({ schaltZiel: 1.06 });
const traegerFuss = fahrtMit({ reaktion: 0.500 });

const basis = physik.gesamtzeit(makellos);
function kosten(l) { const g = physik.gesamtzeit(l); return g === null ? null : g - basis; }

console.log('  makellose Fahrt          ' + z3(basis) + ' s');
console.log('  zu früh geschaltet       + ' + z3(kosten(zuFrueh)) + ' s   (' + zuFrueh.noten.zufrueh + " mal 'zu früh')");
console.log('  überdreht                + ' + z3(kosten(ueberdreht)) + ' s   (' + ueberdreht.noten.ueberdreht + ' mal im Begrenzer)');
console.log('  träge am Grün (0,500 s)  + ' + z3(kosten(traegerFuss)) + ' s');

pruefe('zu früh schalten kostet Zeit', kosten(zuFrueh) > 0.15, z3(kosten(zuFrueh)) + ' s');
pruefe('überdrehen kostet Zeit', kosten(ueberdreht) > 0.10, z3(kosten(ueberdreht)) + ' s');
pruefe('die Reaktion geht 1:1 in die Gesamtzeit', Math.abs(kosten(traegerFuss) - 0.320) < 0.02, z3(kosten(traegerFuss)) + ' s statt 0.320');
pruefe('perfekt schalten ist besser als nur gut', makellos.noten.perfekt > 0 && kosten(zuFrueh) > 0);

/* --------------------------------------------------------------------------
   8. Der Schalthebel
   --------------------------------------------------------------------------
   Michel: "gas geben sollte nach oben sein, schalten einmal nach unten ziehen
   und wieder nach oben gehen." Damit ist Schalten keine Zeitpunkt-Frage mehr,
   sondern eine Bewegung mit Dauer - und solange der Hebel unten ist, gibt es
   keinen Vortrieb.

   ⚠️ DER BOT MUSS DIESELBE ZEIT ZAHLEN. Ruft er `schalte()` direkt, schaltet
   er in null Sekunden und ist unschlagbar schnell, ohne dass irgendetwas nach
   einem Fehler aussieht.
   -------------------------------------------------------------------------- */

console.log('');
console.log('=== 8. Der Schalthebel ===');
console.log('');

{
  const auto = autos.nachId('muscle');

  const l = physik.neuerLauf(auto, 4242, undefined);
  physik.starte(l, 0);
  physik.laufeBis(l, 2.0, []);
  const gangVor = l.gang;

  physik.hebel(l, false);
  pruefe('herunterziehen legt EINEN Gang ein', l.gang === gangVor + 1,
    'Gang ' + (gangVor + 1) + ' -> ' + (l.gang + 1));
  pruefe('unten nimmt den Vortrieb weg', l.gasAn === false);

  const gangJetzt = l.gang;
  physik.hebel(l, false);
  physik.hebel(l, false);
  pruefe('unten bleiben schaltet nicht weiter', l.gang === gangJetzt,
    'Gang ' + (l.gang + 1));

  const vorTempo = l.v;
  physik.laufeBis(l, 2.4, []);
  pruefe('unten wird das Auto nicht schneller', l.v <= vorTempo,
    z3(vorTempo) + ' -> ' + z3(l.v) + ' m/s');

  physik.hebel(l, true);
  pruefe('oben liegt wieder Gas an', l.gasAn === true);
  pruefe('der Weg nach oben schaltet nicht noch einmal', l.gang === gangJetzt,
    'Gang ' + (l.gang + 1));
}

/* --- Wer den Hebel langsam zieht, verliert Zeit. Das ist der Sinn. -------- */
{
  const auto = autos.nachId('muscle');
  function mitHebelzeit(dauer) {
    return fahreMitHebel(auto, 12345, { reaktion: 0, waerme: undefined, zug: dauer });
  }

  const flink = mitHebelzeit(0.10);
  const traege = mitHebelzeit(0.30);
  console.log('  flink am Hebel (0,10 s)  ' + z3(flink.zielZeit) + ' s');
  console.log('  traege am Hebel (0,30 s) ' + z3(traege.zielZeit) + ' s');
  pruefe('eine saubere Fahrt liegt bei rund zehn Sekunden',
    flink.zielZeit > 9.5 && flink.zielZeit < 11.5, z3(flink.zielZeit) + ' s');
  pruefe('wer am Hebel troedelt, verliert Zeit',
    traege.zielZeit - flink.zielZeit > 0.10,
    '+ ' + z3(traege.zielZeit - flink.zielZeit) + ' s');

  /* --- Und der Bot zahlt sie auch ----------------------------------------
     Gemessen wird der Bot GEGEN SICH SELBST: einmal mit seiner Hebelzeit,
     einmal mit Hebelzeit null. Ein Vergleich mit einer Menschenfahrt taugt
     dafuer nicht - dort unterscheiden sich auch Burnout und Reaktion, und
     man misst am Ende alles ausser dem Hebel. */
  function botZeiten(zug) {
    const merk = bot.STUFEN.schwer.hebelZug, merkStreu = bot.STUFEN.schwer.hebelStreu;
    bot.STUFEN.schwer.hebelZug = zug;
    bot.STUFEN.schwer.hebelStreu = 0;
    const liste = [];
    for (let i = 0; i < 120; i++) {
      const b = bot.fahre(auto, 3000 + i, 'schwer', 8000 + i);
      liste.push(!b.aus && b.zielZeit !== null ? b.zielZeit : null);
    }
    bot.STUFEN.schwer.hebelZug = merk;
    bot.STUFEN.schwer.hebelStreu = merkStreu;
    return liste;
  }
  /* ⚠️ PAARWEISE vergleichen, nicht zwei Mittelwerte. Wer nur mittelt,
     vergleicht auch noch, WELCHE Rennen zu Ende gefahren wurden - und ein
     Lauf, in dem drei langsame Fahrten ausscheiden, sieht dann schneller
     aus. Genau daran hat diese Pruefung zuerst falsch angeschlagen. */
  const mitL = botZeiten(0.12), ohneL = botZeiten(0);
  let dSumme = 0, paare = 0;
  for (let i = 0; i < mitL.length; i++) {
    if (mitL[i] === null || ohneL[i] === null) continue;
    dSumme += mitL[i] - ohneL[i]; paare++;
  }
  const kosten = dSumme / paare;
  console.log('  Hebelzeit 0,12 s kostet den Bot + ' + z3(kosten) + ' s (' + paare + ' Paare)');
  pruefe('der Bot schaltet nicht in null Sekunden', kosten > 0.05,
    '+ ' + z3(kosten) + ' s');
}

console.log('\n' + (fehler === 0 ? 'ALLES GRÜN' : fehler + ' FEHLER') + ' — ' + geprueft + ' Prüfungen\n');
process.exit(fehler === 0 ? 0 : 1);
