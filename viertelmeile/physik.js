/* ==========================================================================
   Viertelmeile — Rechenkern
   ==========================================================================
   Die reine Fahrphysik. Kein Canvas, kein Firebase, kein DOM — damit sie
   in Node gegengerechnet werden kann (siehe pflege/pruefe-fahrt.js).

   ⚠️ FESTER RECHENTAKT. Gerechnet wird immer in Schritten von 1/120 s,
   egal wie oft das Gerät zeichnet. Ein langsames Handy zeichnet seltener,
   rechnet aber dieselbe Fahrt — sonst hätte das schnellere Gerät einen
   Vorteil, und genau das darf ein Turnier nicht haben.

   ⚠️ GEFAHREN WIRD NUR NOCH LÄNGS. Das seitliche Ausbrechen und die Lenkung
   sind am 2026-09-10 komplett entfernt worden (Michel: „nehmen wir das
   Lenken raus, das funktioniert nicht so gut"). Übrig bleiben die drei
   Dinge, die ein Drag Race ausmachen: Burnout, Reaktion an der Ampel und
   Schalten. `saat` wandert nur noch als Kennzeichen des Rennens mit.
   ========================================================================== */

const physik = (function () {
  'use strict';

  const STRECKE = 402.34;       // Viertelmeile in Metern
  const SCHRITT = 1 / 120;      // fester Rechentakt in Sekunden
  const LUFT = 0.00055;         // Luftwiderstand (a = LUFT * v^2 * auto.luft)
  const SCHALT_LEER = 0.07;     // Sekunden ohne Vortrieb beim Gangwechsel
  /* ⚠️ KLEIN, WEIL DER HEBEL DIE PAUSE MACHT. Solange der Daumen den Hebel
     unten haelt, gibt es ohnehin keinen Vortrieb. Stand SCHALT_LEER auf 0,16,
     verschwand die ganze Handbewegung darin: ein flinker Zug (0,12 s) kostete
     messbar NULL, und der Hebel war reine Deko. Jetzt bestimmt die Hand die
     Pause, und die Kupplung legt nur noch etwas drauf. */
  const SCHUB = 0.8;            // m/s Extra für einen perfekten Treffer

  /* ----------------------------------------------------------------------
     Zufall mit Saat — beide Geräte müssen dasselbe würfeln
     ---------------------------------------------------------------------- */

  function saatZufall(saat) {
    let z = (saat >>> 0) || 2463534242;
    return function () {
      z ^= z << 13; z >>>= 0;
      z ^= z >>> 17;
      z ^= z << 5; z >>>= 0;
      return z / 4294967296;
    };
  }

  /* ----------------------------------------------------------------------
     Drehmomentkurve
     ---------------------------------------------------------------------- */

  /* Schwach im Keller, Maximum bei mittlerer Drehzahl, fällt oben wieder ab.
     Auf Spitzenwert 1.0 normiert, damit `kraft` im Auto direkt in m/s^2 steht. */
  function drehmoment(r) {
    if (r > 1) return 0.30;                        // Begrenzer: es geht kaum noch was
    const roh = 0.55 + 0.90 * r - 0.75 * r * r;
    return roh / 0.82;
  }

  /**
   * Das grüne Fenster liegt direkt unter dem roten Bereich und wird mit
   * jedem Gang schmaler.
   */
  function fenster(auto, gang) {
    const breite = Math.max(auto.fensterEng, auto.fensterBreit - gang * auto.fensterSchritt);
    return { von: 1 - breite, bis: 1.0, perfektAb: 1 - breite * 0.30 };
  }

  function schaltNote(auto, gang, r) {
    const f = fenster(auto, gang);
    if (r > 1.0) return 'ueberdreht';
    if (r >= f.perfektAb) return 'perfekt';
    if (r >= f.von) return 'gut';
    return 'zufrueh';
  }

  /* ----------------------------------------------------------------------
     Griff aus dem Burnout
     ---------------------------------------------------------------------- */

  /** `waerme` ist der Balkenstand beim Loslassen (0 bis 1.4). */
  function griffAusBurnout(waerme) {
    if (waerme === null || waerme === undefined) return 0.86;   // Burnout abgeschaltet
    if (waerme < 0.75) return 0.62 + 0.38 * (waerme / 0.75);    // kalt
    if (waerme <= 1.00) return 1.0;                             // Punktlandung
    return Math.max(0.60, 1.0 - 0.95 * (waerme - 1.0));         // überhitzt
  }

  function burnoutNote(waerme) {
    if (waerme === null || waerme === undefined) return 'aus';
    if (waerme < 0.55) return 'kalt';
    if (waerme < 0.75) return 'lau';
    if (waerme <= 1.00) return 'perfekt';
    if (waerme <= 1.15) return 'heiss';
    return 'verbrannt';
  }

  /* ----------------------------------------------------------------------
     Ein Wagen in Fahrt
     ---------------------------------------------------------------------- */

  function neuerLauf(auto, saat, waerme) {
    return {
      auto: auto,
      saat: saat,
      griff: griffAusBurnout(waerme),
      waerme: waerme === undefined ? null : waerme,

      t: 0,                 // Sekunden seit Grün
      s: 0,                 // gefahrene Strecke in Metern
      v: 0,                 // Tempo in m/s
      gang: 0,
      leerlaufBis: -1,      // solange kein Vortrieb (Kupplung)
      gasAn: true,          // der Hebel steht oben
      hebelUnten: false,    // der Daumen hat ihn heruntergezogen

      gestartet: false,
      reaktion: null,       // Sekunden nach Grün (negativ = Frühstart)
      fehlstart: false,
      aus: false,           // Linie berührt
      fertig: false,
      fahrzeit: null,
      zielZeit: null,       // Sekunden ab Grün bis zur Ziellinie

      noten: { perfekt: 0, gut: 0, zufrueh: 0, ueberdreht: 0 },
    };
  }

  function drehzahl(l) {
    const g = l.auto.gaenge[l.gang];
    return l.v / g.vMax;
  }

  /**
   * DER SCHALTHEBEL. Oben ist Gas, unten ist ausgekuppelt.
   *
   * Gerufen wird das mit der Stellung des rechten Daumens: `oben` true heißt,
   * der Hebel steht oben. Ein voller Zug nach unten UND zurück nach oben ist
   * ein Gangwechsel — genau die Bewegung, die man am echten Hebel macht.
   *
   * ⚠️ DER GANG WECHSELT BEIM HERUNTERZIEHEN, nicht auf dem Weg zurück.
   * Damit ist der Zeitpunkt, den der Daumen anvisiert, auch der Zeitpunkt,
   * an dem die Nadel abgelesen wird — ein Ziel, kein Ratespiel. Der erste
   * Entwurf wertete auf dem Weg nach oben aus: dann fiel die Nadel während
   * des Ziehens noch, und wer LANGSAMER zog, traf das grüne Fenster besser.
   * Gemessen war der Bot mit trägem Hebel schneller als mit flinkem — genau
   * verkehrt herum.
   *
   * Solange der Hebel unten steht, gibt es keinen Vortrieb. Trödeln unten
   * kostet also Tempo, und zwar sauber steigend.
   */
  function hebel(l, oben) {
    if (!l || l.fertig || l.aus) return null;
    if (oben) {
      l.gasAn = true;
      l.hebelUnten = false;
      return null;
    }
    l.gasAn = false;
    if (l.hebelUnten) return null;       // er war schon unten
    l.hebelUnten = true;
    return schalte(l);
  }

  /** Nur Gas an/aus, ohne Schaltlogik — für Prüfstände und den Bot. */
  function gas(l, an) { if (l) l.gasAn = !!an; }

  /** Der Fahrer tippt aufs Schaltfeld. */
  function schalte(l) {
    if (l.fertig || l.aus || !l.gestartet) return null;
    if (l.gang >= l.auto.gaenge.length - 1) return null;
    if (l.t < l.leerlaufBis) return null;              // Kupplung noch offen

    const r = drehzahl(l);
    const note = schaltNote(l.auto, l.gang, r);
    l.noten[note]++;
    l.gang++;
    if (note === 'perfekt') {
      l.v += SCHUB;
      l.leerlaufBis = l.t + SCHALT_LEER * 0.55;
    } else if (note === 'gut') {
      l.leerlaufBis = l.t + SCHALT_LEER;
    } else {
      /* Zu früh oder überdreht: die Kupplung hängt länger. Den Rest der
         Strafe erledigt die Physik von allein — im falschen Gang steht die
         Nadel im Keller oder im Begrenzer. */
      l.leerlaufBis = l.t + SCHALT_LEER * 1.7;
    }
    return note;
  }

  /**
   * Der Fuß geht vom Bremspedal. `versatzZuGruen` ist die Reaktionszeit in
   * Sekunden: negativ = vor Grün getippt (Frühstart), positiv = danach.
   *
   * ⚠️ `l.t` ZÄHLT AB GRÜN, NICHT AB DEM EIGENEN LOSFAHREN. Das Auto steht
   * die ersten `reaktion` Sekunden noch. Der erste Entwurf ließ es sofort
   * losrollen und schlug die Reaktion nur am Ende auf die Zeit — rechnerisch
   * dasselbe, aber dann laufen auf zwei Handys zwei verschiedene Uhren, und
   * jede Auswertung muss sie erst wieder gleichziehen.
   */
  function starte(l, versatzZuGruen) {
    if (l.reaktion !== null || l.fertig) return;
    l.reaktion = versatzZuGruen;
    if (versatzZuGruen < 0) { l.fehlstart = true; l.fertig = true; l.fahrzeit = null; }
  }

  /* ----------------------------------------------------------------------
     Ein Rechenschritt
     ---------------------------------------------------------------------- */

  function schritt(l, dt) {
    if (l.fertig || l.aus) return;
    l.t += dt;
    /* Vor dem eigenen Losfahren steht das Auto — die Uhr läuft trotzdem. */
    if (l.reaktion === null || l.t < l.reaktion) return;
    l.gestartet = true;

    /* --- Längsrichtung --- */
    const g = l.auto.gaenge[l.gang];
    const r = l.v / g.vMax;
    let a = 0;
    if (l.t >= l.leerlaufBis && l.gasAn) a = g.kraft * drehmoment(r);

    /* Der Griff aus dem Burnout zählt nur beim Anfahren. Ab 40 m ist es egal. */
    if (l.s < 40) {
      const anteil = 1 - l.s / 40;
      a *= l.griff * anteil + (1 - anteil);
    }

    a -= LUFT * l.v * l.v * l.auto.luft;

    l.v += a * dt;
    if (l.v < 0) l.v = 0;
    l.s += l.v * dt;

    if (l.s >= STRECKE) {
      l.fertig = true;
      /* Auf den Zentimeter genau: den letzten Schritt anteilig zurückrechnen. */
      const zuViel = (l.s - STRECKE) / Math.max(l.v, 0.001);
      l.zielZeit = Math.max(0, l.t - zuViel);          // ab Grün
      l.fahrzeit = Math.max(0, l.zielZeit - l.reaktion); // reine Fahrt
      l.s = STRECKE;
    }
  }

  /**
   * Rechnet in festen Schritten bis zur Zielzeit weiter.
   *
   * `eingaben` ist eine nach Zeit sortierte Warteschlange von Tippern:
   *   { zeit: Sekunden nach Grün, art: 'hebel', oben: true|false }
   * Sie wird dabei geleert.
   *
   * ⚠️ WARUM DIE TIPPER EINE ZEIT MITBRINGEN. Ein Tipper kommt vom
   * Browser mit eigenem Zeitstempel, unabhängig davon, wann das Bild
   * gezeichnet wird. Würde er erst beim nächsten Bild angewandt, hätte ein
   * Handy mit 30 Bildern/s bis zu 33 ms Nachteil gegenüber einem mit 120 —
   * bei Reaktionszeiten, die auf Tausendstel verglichen werden, entscheidet
   * das Rennen. Deshalb wird jeder Tipper in genau dem Rechenschritt
   * eingesetzt, in dem er wirklich passiert ist.
   */
  function laufeBis(l, zielZeit, eingaben) {
    let wache = 0;
    while (!l.fertig && !l.aus && l.t + SCHRITT <= zielZeit && wache++ < 20000) {
      const bis = l.t + SCHRITT;
      while (eingaben && eingaben.length && eingaben[0].zeit <= bis) {
        const e = eingaben.shift();
        if (e.art === 'hebel') hebel(l, e.oben);
        else if (e.art === 'gas') gas(l, e.an);
        else schalte(l);
      }
      schritt(l, SCHRITT);
    }
    /* Tipper, die nach der Zielzeit liegen, bleiben für das nächste Bild
       liegen. Ist der Lauf vorbei, sind sie wertlos. */
    if ((l.fertig || l.aus) && eingaben) eingaben.length = 0;
  }

  /** Gesamtzeit = Reaktion + Fahrzeit. Das ist der Wert, der gewinnt. */
  function gesamtzeit(l) {
    if (!l || l.fehlstart || l.aus || l.fahrzeit === null) return null;
    return l.reaktion + l.fahrzeit;
  }

  /**
   * Wer hat gewonnen? `'a'`, `'b'` oder `null` für unentschieden.
   * Ein Ergebnis ist hier entweder ein Lauf oder ein gemeldeter Wert
   * { gesamt, fehlstart, aus, reaktion }.
   */
  function wertung(e) {
    if (!e) return null;
    if (typeof e.gesamt !== 'undefined') return e.fehlstart || e.aus ? null : e.gesamt;
    return gesamtzeit(e);
  }

  function vergleiche(a, b) {
    const za = wertung(a);
    const zb = wertung(b);
    if (za !== null && zb === null) return 'a';
    if (zb !== null && za === null) return 'b';
    if (za === null && zb === null) {
      /* Beide raus. Zwei Frühstarts entscheidet der spätere Fuß. */
      const fa = a && a.fehlstart, fb = b && b.fehlstart;
      if (fa && fb) return (a.reaktion || 0) > (b.reaktion || 0) ? 'a' : 'b';
      if (fa && !fb) return 'b';
      if (fb && !fa) return 'a';
      return null;
    }
    if (za === zb) return null;
    return za < zb ? 'a' : 'b';
  }

  const api = {
    STRECKE: STRECKE,
    SCHRITT: SCHRITT,
    saatZufall: saatZufall,
    drehmoment: drehmoment,
    fenster: fenster,
    schaltNote: schaltNote,
    griffAusBurnout: griffAusBurnout,
    burnoutNote: burnoutNote,
    neuerLauf: neuerLauf,
    drehzahl: drehzahl,
    schalte: schalte,
    hebel: hebel,
    gas: gas,
    starte: starte,
    schritt: schritt,
    laufeBis: laufeBis,
    gesamtzeit: gesamtzeit,
    wertung: wertung,
    vergleiche: vergleiche,
  };

  /* Damit pflege/pruefe-fahrt.js denselben Code prüft, der im Browser läuft. */
  if (typeof module === 'object' && module.exports) module.exports = api;
  return api;
})();
