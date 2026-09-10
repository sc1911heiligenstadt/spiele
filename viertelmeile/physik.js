/* ==========================================================================
   Viertelmeile — Rechenkern
   ==========================================================================
   Die reine Fahrphysik. Kein Canvas, kein Firebase, kein DOM — damit sie
   in Node gegengerechnet werden kann (siehe pflege/pruefe-fahrt.js).

   ⚠️ FESTER RECHENTAKT. Gerechnet wird immer in Schritten von 1/120 s,
   egal wie oft das Gerät zeichnet. Ein langsames Handy zeichnet seltener,
   rechnet aber dieselbe Fahrt — sonst hätte das schnellere Gerät einen
   Vorteil, und genau das darf ein Turnier nicht haben.

   ⚠️ ALLES AUS DER SAAT. Wo das Auto zieht und wie stark, kommt aus einer
   Zahl, die der Gastgeber für das Rennen würfelt und beiden Fahrern
   schickt. Beide bekommen also dieselben Ausbrecher zur selben Zeit.
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
     Seitliches Ausbrechen
     ----------------------------------------------------------------------
     ⚠️ HIER WIRD TEMPO GESETZT, NICHT KRAFT. Der erste Entwurf beschleunigte
     die Seitwärtsbewegung (Kraft, Dämpfung, Rückstellung — ein Feder-Masse-
     System). Das fühlt sich beim Fahren wie ein Fehler an: hält man dagegen,
     dauert es, bis überhaupt etwas passiert, und dann schießt das Auto über
     die Mitte hinaus und man muss auf die andere Seite. Gemessen kam ein
     Fahrer, der nach einer halben Sekunde gegenhält, in vier von zehn Fällen
     trotzdem über die Linie — und zwar UNABHÄNGIG davon, wie stark man das
     Lenken machte: mehr Kraft hieß nur mehr Übersteuern.

     Jetzt bestimmen Zug und Lenken direkt, wie schnell das Auto zur Seite
     wandert. Halten bringt es sofort zurück, Loslassen stoppt es sofort. Kein
     Nachschwingen, kein Gegenpendeln — und man kann sich ausrechnen, was
     passiert, während man es tut. `ANSPRECH` glättet nur die Optik.
     ---------------------------------------------------------------------- */
  const ZUG_TEMPO = 0.70;       // Bahnbreiten je Sekunde, wenn es zieht
  /* Bei knapp halbem Schieber (0,46) hält man den Zug genau auf — das ist der
     Punkt, den der Daumen suchen soll. Voller Ausschlag holt das Auto mit
     0,86 je Sekunde zurück. */
  const LENK_TEMPO = 1.60;      // Bahnbreiten je Sekunde bei vollem Ausschlag
  const RUECK_TEMPO = 0.10;     // sanftes Zurückwandern zur Mitte

  /* ⚠️ ÜBERSTEUERN DARF DAS RENNEN NIE KOSTEN. Ohne diese Grenze warf ein
     voll gehaltener Schieber das Auto über die GEGENÜBERLIEGENDE Linie: 157
     von 180 Prüffahrten verloren, obwohl der Fahrer die ganze Zeit korrekt
     gegengehalten hat. Genau das ist die Frustration, um die es hier geht —
     man tut das Richtige und wird dafür bestraft.
     Jetzt bremst die EIGENE Lenkung sanft ab, sobald sie über `LENK_GRENZE`
     hinausschieben würde. Der ZUG kennt diese Grenze nicht: wer gar nicht
     gegenhält, landet weiterhin an der Linie, und wer in die falsche Richtung
     lenkt, wird vom Zug trotzdem hinausgeschoben.
     Kurz: verlieren kann man nur durchs Nichtstun oder durch die falsche
     Richtung — nie durch zu viel des Richtigen. */
  const LENK_GRENZE = 0.66;     // so weit schiebt die eigene Lenkung höchstens
  const LENK_BREMSWEG = 0.25;   // auf dieser Strecke davor wird sie weich
  const ANSPRECH = 0.04;        // Sekunden, bis das Auto der Vorgabe folgt (fast unmittelbar)
  const SCHLEIFEN = 30;         // Tempoverlust beim Schleifen (quadratisch)
  const SCHLEIF_AB = 0.10;      // darunter kostet ein Wackeln nichts
  const MIN_LENK = 0.06;        // so lange wirkt auch der kürzeste Tipper
  /* ⚠️ LANG UND SANFT, NICHT KURZ UND BRUTAL. Erst dauerte ein Ausbrecher
     1,25 s und war so stark, dass er in dieser Zeit bis über die Linie reichte.
     Damit war jede Zehntelsekunde Verzug tödlich: wer erst nach einer halben
     Sekunde griff, stand schon bei 0,6 und kippte beim kleinsten Nachfassen
     hinaus. Jetzt zieht es fast doppelt so lang, dafür halb so schnell — wer
     gar nichts tut, landet genauso an der Linie, aber man hat Zeit, in Ruhe
     dagegenzuhalten. Genau das ist der Unterschied zwischen "zackig" und
     "unmöglich". */
  const ZUG_DAUER = 1.80;       // wie lange ein Ausbrecher dauert
  const WARNUNG = 0.90;         // so früh blinkt der Pfeil

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

  /**
   * Die Ausbrecher einer Fahrt. Zeitpunkte in Sekunden nach Grün.
   * Gleiche Saat = gleiche Liste, auf beiden Handys.
   */
  function ausbrecher(saat, auto) {
    const w = saatZufall(saat);
    /* ⚠️ WIE OFT es zieht, hängt am Auto — WIE STARK nicht.
       Erster Entwurf hatte es andersherum: das Muscle-Car zog stärker, der
       Flitzer schwächer. Damit war das Versprechen „wer gar nicht gegenhält,
       fliegt raus" beim Flitzer schlicht falsch — ein schwacher Zug lief aus,
       ohne die Linie zu erreichen. Jetzt reicht JEDER ignorierte Zug bis über
       die Linie, und die Autos unterscheiden sich in der Anzahl. */
    const vonBis = (auto && auto.zuege) || [2, 4];
    const anzahl = vonBis[0] + Math.floor(w() * (vonBis[1] - vonBis[0] + 1));
    const liste = [];

    /* Ein Fach je Ausbrecher, gewürfelt wird nur innerhalb des Fachs.
       ⚠️ Der Spielraum ist um ZUG_DAUER gekürzt: ohne das konnten zwei
       Ausbrecher überlappen, und zwei gleichzeitige Züge in dieselbe
       Richtung sind nicht mehr zu halten — dann verliert man ohne Fehler. */
    const fach = (9.4 - 1.6) / anzahl;
    const spielraum = Math.max(0, fach - ZUG_DAUER - 0.2);
    for (let i = 0; i < anzahl; i++) {
      const t = 1.6 + i * fach + w() * spielraum;
      liste.push({
        zeit: Math.round(t * 100) / 100,
        richtung: w() < 0.5 ? -1 : 1,
        staerke: 0.95 + w() * 0.15,
      });
    }
    return liste;
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
      zuege: ausbrecher(saat, auto),
      griff: griffAusBurnout(waerme),
      waerme: waerme === undefined ? null : waerme,

      t: 0,                 // Sekunden seit Grün
      s: 0,                 // gefahrene Strecke in Metern
      v: 0,                 // Tempo in m/s
      gang: 0,
      leerlaufBis: -1,      // solange kein Vortrieb (Kupplung)
      gasAn: true,          // der Hebel steht oben
      hebelUnten: false,    // der Daumen hat ihn heruntergezogen
      versatz: 0,           // seitlich, -1 bis 1
      seitTempo: 0,
      lenkStellung: 0,          // -1 ganz links … +1 ganz rechts, 0 geradeaus
      lenkNachlauf: 0,          // Stellung, die ein kurzer Tipper nachwirken lässt
      lenkBis: -1,              // bis wann der Nachlauf gilt
      lenkAnZeit: -1,

      gestartet: false,
      reaktion: null,       // Sekunden nach Grün (negativ = Frühstart)
      fehlstart: false,
      aus: false,           // Linie berührt
      fertig: false,
      fahrzeit: null,
      zielZeit: null,       // Sekunden ab Grün bis zur Ziellinie

      noten: { perfekt: 0, gut: 0, zufrueh: 0, ueberdreht: 0 },
      spurVerlust: 0,       // wie viel Tempo das Schlingern gekostet hat (m/s)
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
   * DIE LENKUNG IST EIN SCHIEBER, KEIN KNOPF.
   *
   * `stellung` liegt zwischen -1 (voll links) und +1 (voll rechts) und kommt
   * unmittelbar daher, wo der Daumen im Lenkfeld liegt. 0 heißt geradeaus.
   *
   * ⚠️ ZWEI ANLÄUFE SIND HIER SCHON GESCHEITERT, BEIDE AN DERSELBEN SACHE:
   * die Lenkung war ein Schalter mit zwei Stellungen, und man konnte nur
   * „ganz" oder „gar nicht" gegenhalten.
   *   1. Erst musste man TIPPEN — ein Tipper wirkte 0,3 s, ein Ausbrecher
   *      dauerte 1,25 s, also fünfmal hämmern.
   *   2. Dann durfte man HALTEN — besser, aber immer noch entweder volle
   *      Kraft oder nichts, und die richtige von zwei Hälften musste man
   *      erst suchen.
   * Michel nach beiden Anläufen: unlenkbar. Jetzt entscheidet die STRECKE,
   * die der Daumen zurücklegt, wie stark gelenkt wird — halbe Auslenkung
   * hebt den Zug ungefähr auf, volle holt das Auto zurück. Man kann damit
   * dosieren statt zu schalten, und es gibt keine zwei Felder mehr, sondern
   * eine Achse.
   */
  function lenkeStellung(l, stellung) {
    if (!l || l.fertig || l.aus || !l.gestartet) return;
    let a = Number(stellung) || 0;
    if (a > 1) a = 1;
    if (a < -1) a = -1;
    if (a !== 0) {
      l.lenkStellung = a;
      l.lenkNachlauf = a;
      l.lenkAnZeit = l.t;
      l.lenkBis = -1;
      return;
    }
    /* Losgelassen. ⚠️ Der Mindest-Nachlauf zählt ab dem AUFSETZEN, nicht ab
       dem Loslassen — sonst lenkt ein langer Halt beim Loslassen noch zwei
       Zehntel weiter und schießt über die Mitte. */
    if (l.lenkStellung === 0) return;
    l.lenkStellung = 0;
    l.lenkBis = l.lenkAnZeit + MIN_LENK;
  }

  /** Die wirksame Auslenkung: Schieberstellung, sonst der Nachlauf. */
  function lenkAuslenkung(l) {
    if (l.lenkStellung !== 0) return l.lenkStellung;
    if (l.t < l.lenkBis) return l.lenkNachlauf;
    return 0;
  }

  /* Bequemlichkeiten für alles, was nur „ganz links / ganz rechts / los"
     kennt — der Bot, die Prüfstände und ein kurzer Tipper. */
  function lenkeAn(l, richtung) { lenkeStellung(l, richtung < 0 ? -1 : 1); }
  function lenkeAus(l) { lenkeStellung(l, 0); }
  function lenke(l, richtung) { lenkeAn(l, richtung); lenkeAus(l); }

  /**
   * Der Fuß geht vom Bremspedal. `versatzZuGruen` ist die Reaktionszeit in
   * Sekunden: negativ = vor Grün getippt (Frühstart), positiv = danach.
   *
   * ⚠️ `l.t` ZÄHLT AB GRÜN, NICHT AB DEM EIGENEN LOSFAHREN. Das Auto steht
   * die ersten `reaktion` Sekunden noch. Der erste Entwurf ließ es sofort
   * losrollen und schlug die Reaktion nur am Ende auf die Zeit — rechnerisch
   * dasselbe, aber die Ausbrecher kamen dann bei jedem Fahrer zu einem
   * anderen Zeitpunkt der Ampel. Zugesagt war: beide bekommen denselben Zug
   * im selben Moment. Also läuft die Uhr für beide ab Grün.
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

    /* --- Seitenrichtung --- */
    let zug = 0;
    for (const z of l.zuege) {
      if (l.t >= z.zeit && l.t < z.zeit + ZUG_DAUER) zug += z.richtung * z.staerke;
    }
    const lenk = lenkAuslenkung(l);

    /* Wunsch-Seitentempo aus Zug, Lenken und Selbstzentrierung … */
    let lenkTeil = lenk * LENK_TEMPO;
    if (lenkTeil !== 0) {
      /* Lenkhilfe: wie viel Platz bleibt in der Richtung, in die gelenkt wird? */
      const hin = lenkTeil > 0 ? 1 : -1;
      const rest = LENK_GRENZE - hin * l.versatz;
      if (rest <= 0) lenkTeil = 0;
      else if (rest < LENK_BREMSWEG) lenkTeil *= rest / LENK_BREMSWEG;
    }
    const ziel = zug * ZUG_TEMPO + lenkTeil - l.versatz * RUECK_TEMPO;
    /* … dem das Auto in `ANSPRECH` Sekunden folgt. */
    l.seitTempo += (ziel - l.seitTempo) * Math.min(1, dt / ANSPRECH);
    l.versatz += l.seitTempo * dt;

    /* Schräg stehende Reifen schleifen — das kostet direkt Tempo, nicht Kraft.
       ⚠️ Quadratisch, nicht linear. Linear war der erste Entwurf, und damit
       kostete ein spät gehaltener Ausbrecher GAR NICHTS: das bisschen Verlust
       holte die Beschleunigung sofort wieder auf, und wer früh gegenhielt,
       zahlte durch sein eigenes Pendeln sogar mehr. Quadratisch ist ein
       kleines Wackeln fast gratis und ein großer Ausschlag richtig teuer —
       genau so herum soll es sich anfühlen. */
    const schraeg = Math.abs(l.versatz);
    if (schraeg > SCHLEIF_AB) {
      const ueber = schraeg - SCHLEIF_AB;
      const verlust = SCHLEIFEN * ueber * ueber * dt;
      l.v -= verlust;
      l.spurVerlust += verlust;
    }
    if (schraeg >= 1) { l.aus = true; l.fertig = true; l.fahrzeit = null; return; }

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
   *   { zeit: Sekunden nach Grün, art: 'schalt' | 'lenk', richtung: -1|1 }
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
        if (e.art === 'lenkStellung') lenkeStellung(l, e.wert);
        else if (e.art === 'lenkAn') lenkeAn(l, e.richtung);
        else if (e.art === 'lenkAus') lenkeAus(l);
        else if (e.art === 'lenk') lenke(l, e.richtung);
        else if (e.art === 'hebel') hebel(l, e.oben);
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
    ZUG_DAUER: ZUG_DAUER,
    MIN_LENK: MIN_LENK,
    WARNUNG: WARNUNG,
    saatZufall: saatZufall,
    ausbrecher: ausbrecher,
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
    lenke: lenke,
    lenkeAn: lenkeAn,
    lenkeAus: lenkeAus,
    lenkeStellung: lenkeStellung,
    lenkAuslenkung: lenkAuslenkung,
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
