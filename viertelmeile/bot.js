/* ==========================================================================
   Viertelmeile — der Bot
   ==========================================================================
   Fährt eine komplette Runde durch, ohne zu zeichnen. Gebraucht wird er an
   zwei Stellen:

     1. ungerade Spielerzahl in der Liga — dann fehlt genau einem Menschen
        ein Gegner,
     2. „Allein üben" ohne Raum.

   ⚠️ DER BOT HAT KEIN EIGENES FIREBASE-KONTO. Seine Kennung ist nur ein
   String (`bot-…`), gerechnet wird er auf dem Gerät des Menschen, gegen den
   er antritt. Deshalb schreibt dieses Gerät ZWEI Ergebnisse.

   ⚠️ Der Bot benutzt denselben Rechenkern wie ein Mensch (physik.js). Es
   gibt keinen zweiten, vereinfachten Fahrweg — sonst prüft der Prüfstand
   Code, den nie jemand fährt.
   ========================================================================== */

const bot = (function () {
  'use strict';

  /* Im Browser liegt `physik` als globale Konstante bereit (Reihenfolge der
     script-Tags in index.html); in Node wird die Datei nachgeladen. */
  const p = typeof physik !== 'undefined' ? physik : require('./physik.js');

  const STUFEN = {
    leicht: {
      name: 'Leicht',
      reaktion: 0.48, reaktionStreu: 0.11,
      waerme: 0.58, waermeStreu: 0.26,
      schaltZiel: 0.900, schaltStreu: 0.060,
      hebelZug: 0.30, hebelStreu: 0.10,
    },
    mittel: {
      name: 'Mittel',
      reaktion: 0.33, reaktionStreu: 0.075,
      waerme: 0.86, waermeStreu: 0.15,
      schaltZiel: 0.955, schaltStreu: 0.032,
      hebelZug: 0.20, hebelStreu: 0.06,
    },
    schwer: {
      name: 'Schwer',
      reaktion: 0.235, reaktionStreu: 0.045,
      waerme: 0.93, waermeStreu: 0.075,
      schaltZiel: 0.985, schaltStreu: 0.018,
      hebelZug: 0.12, hebelStreu: 0.035,
    },
  };

  function stufe(id) { return STUFEN[id] || STUFEN.mittel; }

  /* Zwei Gleichverteilte ergeben zusammen eine glockige Streuung — das reicht
     hier und braucht keine Wurzel-Logarithmus-Rechnerei. */
  function streu(w, breite) { return (w() + w() - 1) * breite; }

  /**
   * Fährt einen kompletten Lauf. `saat` ist die Saat des Rennens (gleiche
   * Kennzeichen des Rennens), `botSaat` würfelt die Fahrfehler.
   */
  const SPUR_TAKT = 1 / 30;      // so oft wird die Position für die Anzeige notiert

  function fahre(auto, saat, stufenId, botSaat, spur) {
    const s = stufe(stufenId);
    const w = p.saatZufall((botSaat >>> 0) ^ 0x9e3779b9);

    const waerme = Math.max(0, Math.min(1.4, s.waerme + streu(w, s.waermeStreu)));
    const l = p.neuerLauf(auto, saat, waerme);

    const reaktion = Math.max(0.06, s.reaktion + streu(w, s.reaktionStreu));
    p.starte(l, reaktion);

    let hebelUntenBis = -1;
    let schaltZiel = null;
    let naechsteSpur = 0;
    let wache = 0;

    while (!l.fertig && !l.aus && wache++ < 20000) {
      p.schritt(l, p.SCHRITT);
      if (spur && l.t >= naechsteSpur) {
        naechsteSpur += SPUR_TAKT;
        spur.push({ t: l.t, s: l.s, v: l.v });
      }
      if (l.fertig || l.aus) break;

      /* Schalten laeuft ueber den HEBEL, genau wie beim Menschen: runter,
         kurz halten, wieder hoch.
         ⚠️ Ohne das waere der Bot unfair schnell. Solange der Hebel unten
         ist, gibt es keinen Vortrieb - ein Mensch zahlt diese Zehntel jedes
         Mal, ein Bot, der `schalte()` direkt ruft, zahlt sie nie. Wie flink
         der Bot am Hebel ist, gehoert deshalb zur Stufe. */
      if (hebelUntenBis >= 0) {
        if (l.t >= hebelUntenBis) { p.hebel(l, true); hebelUntenBis = -1; }
      } else if (l.gang < auto.gaenge.length - 1 && l.t >= l.leerlaufBis) {
        /* ⚠️ DAS ZIEL WIRD EINMAL JE GANG GEWUERFELT, nicht in jedem
           Rechenschritt. Vorher fiel bei 120 Wuerfen je Sekunde irgendwann
           ein niedriger Wert, und der Bot schaltete faktisch beim KLEINSTEN
           gezogenen Ziel statt beim gewuerfelten — `schaltStreu` war damit
           keine Streuung, sondern ein stiller Vorzieher. Aufgefallen ist es
           daran, dass ein TRAEGERER Hebel den Bot schneller machte: er
           uebersprang Rechenschritte, zog dadurch andere Zufallszahlen und
           landete auf besseren Schaltpunkten. */
        if (schaltZiel === null) schaltZiel = Math.max(0.55, s.schaltZiel + streu(w, s.schaltStreu));
        if (p.drehzahl(l) >= schaltZiel) {
          p.hebel(l, false);
          schaltZiel = null;
          /* ⚠️ KEIN `||`-RUECKFALL BEI ZAHLEN. `s.hebelZug || 0.2` macht aus
             einer echten 0 die 0,2 — und genau daran hat der Prueflauf
             gemessen, ein traegerer Hebel mache den Bot schneller. */
          const zug = s.hebelZug === undefined ? 0.2 : s.hebelZug;
          const streuung = s.hebelStreu === undefined ? 0.05 : s.hebelStreu;
          hebelUntenBis = l.t + Math.max(0.04, zug + streu(w, streuung));
        }
      }

    }
    return l;
  }

  /**
   * Wie `fahre`, gibt aber zusätzlich die abgefahrene Spur zurück — damit
   * das Menschen-Gerät den Bot NEBEN sich zeichnen kann, ohne ihn Bild für
   * Bild mitrechnen zu müssen. Der ganze Lauf ist am Start schon bekannt.
   */
  function mitSpur(auto, saat, stufenId, botSaat) {
    const spur = [];
    const lauf = fahre(auto, saat, stufenId, botSaat, spur);
    /* Der letzte Punkt: das Ziel bzw. die Stelle, an der es vorbei war. */
    spur.push({ t: lauf.t, s: lauf.s, v: lauf.v });
    return { lauf: lauf, spur: spur };
  }

  /** Position des Bots zu einem Zeitpunkt (Sekunden ab Grün), interpoliert. */
  function ausSpur(spur, t) {
    if (!spur || !spur.length) return null;
    if (t <= spur[0].t) return spur[0];
    const letzter = spur[spur.length - 1];
    if (t >= letzter.t) return letzter;
    /* Gleichmäßiger Takt: der Index lässt sich direkt ausrechnen. */
    let i = Math.min(spur.length - 2, Math.max(0, Math.floor(t / SPUR_TAKT)));
    while (i > 0 && spur[i].t > t) i--;
    while (i < spur.length - 2 && spur[i + 1].t < t) i++;
    const a = spur[i], b = spur[i + 1];
    const spanne = b.t - a.t;
    const k = spanne > 0 ? (t - a.t) / spanne : 0;
    return { t: t, s: a.s + (b.s - a.s) * k, v: a.v + (b.v - a.v) * k };
  }

  const api = { STUFEN: STUFEN, SPUR_TAKT: SPUR_TAKT, stufe: stufe, fahre: fahre, mitSpur: mitSpur, ausSpur: ausSpur };
  if (typeof module === 'object' && module.exports) module.exports = api;
  return api;
})();
