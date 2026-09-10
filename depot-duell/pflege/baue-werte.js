/**
 * Erzeugt werte.js aus den Rohdaten der woechentlichen Pflegerunde.
 *
 * Aufruf:  node pflege/baue-werte.js
 * Ergebnis: depot-duell/werte.js
 *
 * WARUM EIN SKRIPT UND NICHT VON HAND:
 * Die auslaendischen Kurse stehen in Dollar, Franken, Yen, Pfund, Won und
 * Hongkong-Dollar, das Spiel rechnet in Euro. Ueber 200 Umrechnungen von Hand
 * sind die sicherste Art, unbemerkt einen Zahlendreher einzubauen. Das Skript
 * rechnet, prueft und meldet, wenn etwas fehlt.
 *
 * WOECHENTLICHE PFLEGE:
 * Die Zahlen holt `node pflege/hole-kurse.js --schreiben` selbst und traegt
 * sie unten ein - je Wert steht seine Quelle in der letzten Spalte. Danach
 * dieses Skript laufen lassen. Der Ablauf im Ganzen steht in
 * pflege/PFLEGE.md, samt dem Prompt der Routine, die ihn ausloest.
 *
 * Quellen (eine je Wertart, damit die Zahlen zueinander passen):
 *   Aktien   stockanalysis.com    Kurs, KGV, Dividendenrendite
 *   ETFs     stockanalysis.com    Kurs, Fondsvolumen, Positionen, TER
 *   Krypto   CoinGecko            Kurse direkt in Euro
 *   Devisen  frankfurter.dev/EZB  alle Wechselkurse in einem Abruf
 *
 * Von Hand gepflegt bleibt, was keine Quelle liefert und was das Spiel
 * ausmacht: welcher Wert ueberhaupt dabei ist, sein Sektor und sein Land.
 */

const fs = require('fs');
const path = require('path');

// Stand der Daten. Wird in werte.js mitgeschrieben und in der App unter
// "Die Werte sind echt" sowie in der Quellenangabe angezeigt.
const STAND = '2026-09-10';
const EUR_USD = 1.1652; // 1 EUR = 1.1652 USD (EZB via frankfurter.dev, 2026-09-09)

/**
 * Wechselkurse, 1 EUR = x Fremdwaehrung (EZB via frankfurter.dev).
 *
 * Seit dem Ausbau auf 250 Werte notieren nicht mehr nur Dollar-Werte im
 * Ausland: die duenn besetzten Laender wurden mit ihren HEIMATboersen
 * aufgefuellt, weil es fuer die meisten japanischen, schweizer und
 * koreanischen Unternehmen keine liquide US-Zweitnotiz gibt. Ein OTC-Schein
 * mit drei Umsaetzen am Tag waere ein schlechterer Startkurs als der echte.
 *
 * GBX ist kein Tippfehler: London notiert in Pence. Wer das uebersieht, hat
 * Shell mit dem Hundertfachen im Spiel - und es faellt nicht auf, weil 3277
 * eine voellig plausible Zahl ist.
 */
const WECHSELKURSE = {
  CAD: 1.6043,
  CHF: 0.9404,
  GBP: 0.85898,
  HKD: 9.1378,
  JPY: 178.59,
  KRW: 1556.94,
  USD: 1.1652,
};

/**
 * Aktien.
 * [name, kuerzel, kurs, waehrung, kgv, divRenditeProzent, sektor, land, quelle]
 * kgv === null bedeutet: kein sinnvolles KGV (Verlustjahr) -> die App zeigt einen Strich.
 * quelle ist der Pfad bei stockanalysis.com, den hole-kurse.js abruft.
 */
const AKTIEN = [








  // ---------- Deutschland (DAX), Kurse in Euro, Xetra 2026-08-07 11:34 ----------
  ['SAP'                         , 'SAP'   ,    178.34, 'EUR',  27.38, 1.38, 'Technologie' , 'Deutschland'    , 'quote/etr/SAP'],
  ['Siemens'                     , 'SIE'   ,    263.45, 'EUR',  26.43, 1.99, 'Industrie'   , 'Deutschland'    , 'quote/etr/SIE'],
  ['Allianz'                     , 'ALV'   ,     439.5, 'EUR',  14.33, 3.81, 'Versicherung', 'Deutschland'    , 'quote/etr/ALV'],
  ['Rheinmetall'                 , 'RHM'   ,      1015, 'EUR',   38.8, 1.06, 'Ruestung'    , 'Deutschland'    , 'quote/etr/RHM'],
  ['Mercedes-Benz Group'         , 'MBG'   ,     47.07, 'EUR',   8.84, 7.36, 'Automobil'   , 'Deutschland'    , 'quote/etr/MBG'],
  ['BMW'                         , 'BMW'   ,     62.94, 'EUR',   5.95, 6.91, 'Automobil'   , 'Deutschland'    , 'quote/etr/BMW'],
  ['Volkswagen Vorzuege'         , 'VOW3'  ,     81.92, 'EUR',   7.81, 7.14, 'Automobil'   , 'Deutschland'    , 'quote/etr/VOW3'],
  ['Deutsche Bank'               , 'DBK'   ,     35.18, 'EUR',  11.31, 2.87, 'Banken'      , 'Deutschland'    , 'quote/etr/DBK'],
  ['Commerzbank'                 , 'CBK'   ,     42.43, 'EUR',  16.17, 2.68, 'Banken'      , 'Deutschland'    , 'quote/etr/CBK'],
  ['adidas'                      , 'ADS'   ,    142.95, 'EUR',  18.81, 1.87, 'Konsum'      , 'Deutschland'    , 'quote/etr/ADS'],
  ['Zalando'                     , 'ZAL'   ,     22.67, 'EUR',  62.21,    0, 'Handel'      , 'Deutschland'    , 'quote/etr/ZAL'],
  ['Infineon'                    , 'IFX'   ,     56.82, 'EUR',  61.88, 0.62, 'Halbleiter'  , 'Deutschland'    , 'quote/etr/IFX'],
  ['BASF'                        , 'BAS'   ,     52.56, 'EUR',  22.27, 4.22, 'Chemie'      , 'Deutschland'    , 'quote/etr/BAS'],
  ['Bayer'                       , 'BAYN'  ,     49.08, 'EUR', null  , 0.22, 'Pharma'      , 'Deutschland'    , 'quote/etr/BAYN'],
  ['Merck'                       , 'MRK1'  ,     132.1, 'EUR',  24.35, 1.59, 'Pharma'      , 'Deutschland'    , 'quote/etr/MRK'],
  ['Deutsche Telekom'            , 'DTE'   ,     27.78, 'EUR',  15.55, 3.48, 'Telekom'     , 'Deutschland'    , 'quote/etr/DTE'],
  ['DHL Group'                   , 'DHL'   ,      54.8, 'EUR',  16.58, 3.46, 'Logistik'    , 'Deutschland'    , 'quote/etr/DHL'],
  ['E.ON'                        , 'EOAN'  ,     17.69, 'EUR',  13.64, 3.27, 'Versorger'   , 'Deutschland'    , 'quote/etr/EOAN'],
  ['RWE'                         , 'RWE'   ,     60.44, 'EUR',  13.34, 2.07, 'Versorger'   , 'Deutschland'    , 'quote/etr/RWE'],
  ['Siemens Energy'              , 'ENR'   ,     144.8, 'EUR',  47.21, 0.48, 'Versorger'   , 'Deutschland'    , 'quote/etr/ENR'],
  ['Muenchener Rueck'            , 'MUV2'  ,     502.2, 'EUR',   9.23, 4.59, 'Versicherung', 'Deutschland'    , 'quote/etr/MUV2'],
  ['Hannover Rueck'              , 'HNR1'  ,     248.6, 'EUR',  10.85, 4.79, 'Versicherung', 'Deutschland'    , 'quote/etr/HNR1'],
  ['Deutsche Boerse'             , 'DB1'   , 275.70001, 'EUR',   23.6, 1.48, 'Finanzen'    , 'Deutschland'    , 'quote/etr/DB1'],
  ['Beiersdorf'                  , 'BEI'   ,     73.84, 'EUR',  17.42, 1.31, 'Konsum'      , 'Deutschland'    , 'quote/etr/BEI'],
  ['Henkel Vorzuege'             , 'HEN3'  ,      73.7, 'EUR',  15.82, 2.74, 'Konsum'      , 'Deutschland'    , 'quote/etr/HEN3'],
  ['Continental'                 , 'CON'   ,     70.12, 'EUR', null  , 3.91, 'Automobil'   , 'Deutschland'    , 'quote/etr/CON'],
  ['Daimler Truck'               , 'DTG'   ,     43.76, 'EUR',  31.15, 4.21, 'Automobil'   , 'Deutschland'    , 'quote/etr/DTG'],
  ['MTU Aero Engines'            , 'MTX'   ,     344.8, 'EUR',  19.91, 1.05, 'Luftfahrt'   , 'Deutschland'    , 'quote/etr/MTX'],
  ['Heidelberg Materials'        , 'HEI'   ,    156.35, 'EUR',  13.66,  2.2, 'Bau'         , 'Deutschland'    , 'quote/etr/HEI'],
  ['Vonovia'                     , 'VNA'   ,     18.44, 'EUR',   4.34, 6.51, 'Immobilien'  , 'Deutschland'    , 'quote/etr/VNA'],

  // ---------- Europa ohne Deutschland, Kurse in Euro ----------
  ['ASML'                        , 'ASML'  ,    1475.4, 'EUR',  54.38, 0.52, 'Halbleiter'  , 'Niederlande'    , 'quote/ams/ASML'],
  ['LVMH'                        , 'MC'    ,    408.95, 'EUR',  18.75, 3.02, 'Luxus'       , 'Frankreich'     , 'quote/epa/MC'],
  ['Hermes'                      , 'RMS'   ,      1421, 'EUR',  32.77, 1.21, 'Luxus'       , 'Frankreich'     , 'quote/epa/RMS'],
  ['LOreal'                      , 'OR'    ,     377.8, 'EUR',   32.4, 1.87, 'Konsum'      , 'Frankreich'     , 'quote/epa/OR'],
  ['TotalEnergies'               , 'TTE'   ,      78.6, 'EUR',  11.13, 4.58, 'Energie'     , 'Frankreich'     , 'quote/epa/TTE'],
  ['Sanofi'                      , 'SAN'   ,     74.03, 'EUR',  22.86,  5.4, 'Pharma'      , 'Frankreich'     , 'quote/epa/SAN'],
  ['Air Liquide'                 , 'AI'    ,    168.58, 'EUR',  30.29, 1.94, 'Chemie'      , 'Frankreich'     , 'quote/epa/AI'],
  ['Schneider Electric'          , 'SU'    ,     291.3, 'EUR',  34.85, 1.46, 'Industrie'   , 'Frankreich'     , 'quote/epa/SU'],
  ['SAFRAN'                      , 'SAF'   ,     322.9, 'EUR',  34.67, 1.01, 'Luftfahrt'   , 'Frankreich'     , 'quote/epa/SAF'],
  ['AXA'                         , 'CS'    ,     43.21, 'EUR',  11.59, 5.26, 'Versicherung', 'Frankreich'     , 'quote/epa/CS'],
  ['BNP Paribas'                 , 'BNP'   ,    103.24, 'EUR',    8.9,    5, 'Banken'      , 'Frankreich'     , 'quote/epa/BNP'],
  ['VINCI'                       , 'DG'    ,     111.4, 'EUR',   12.4, 4.46, 'Bau'         , 'Frankreich'     , 'quote/epa/DG'],
  ['Danone'                      , 'BN'    ,      62.5, 'EUR',  20.85, 3.53, 'Nahrung'     , 'Frankreich'     , 'quote/epa/BN'],
  ['EssilorLuxottica'            , 'EL'    ,     147.6, 'EUR',  27.84, 2.52, 'Konsum'      , 'Frankreich'     , 'quote/epa/EL'],
  ['Airbus'                      , 'AIR'   ,    197.14, 'EUR',  26.15, 1.65, 'Luftfahrt'   , 'Niederlande'    , 'quote/epa/AIR'],
  ['Ferrari'                     , 'RACE'  , 352.54999, 'EUR',   37.5, 1.01, 'Automobil'   , 'Italien'        , 'quote/bit/RACE'],
  ['Adyen'                       , 'ADYEN' ,     934.1, 'EUR',  26.75,    0, 'Finanzen'    , 'Niederlande'    , 'quote/ams/ADYEN'],
  ['ING Group'                   , 'INGA'  ,     31.66, 'EUR',   10.6, 4.12, 'Banken'      , 'Niederlande'    , 'quote/ams/INGA'],
  ['AB InBev'                    , 'ABI'   ,      67.6, 'EUR',  16.59, 1.68, 'Nahrung'     , 'Belgien'        , 'quote/ebr/ABI'],
  ['Inditex'                     , 'ITX'   ,     54.92, 'EUR',   26.5, 3.08, 'Handel'      , 'Spanien'        , 'quote/bme/ITX'],
  ['Banco Santander'             , 'SAN2'  ,     12.65, 'EUR',  14.39, 1.96, 'Banken'      , 'Spanien'        , 'quote/bme/SAN'],
  ['Iberdrola'                   , 'IBE'   ,     20.07, 'EUR',  24.42, 3.44, 'Versorger'   , 'Spanien'        , 'quote/bme/IBE'],
  ['Enel'                        , 'ENEL'  ,     8.963, 'EUR',  21.32, 5.45, 'Versorger'   , 'Italien'        , 'quote/bit/ENEL'],
  ['Eni'                         , 'ENI'   ,     23.92, 'EUR',  12.57, 4.52, 'Energie'     , 'Italien'        , 'quote/bit/ENI'],
  ['UniCredit'                   , 'UCG'   ,     84.22, 'EUR',  11.96, 3.76, 'Banken'      , 'Italien'        , 'quote/bit/UCG'],
  ['Intesa Sanpaolo'             , 'ISP'   ,     6.668, 'EUR',  11.99, 5.64, 'Banken'      , 'Italien'        , 'quote/bit/ISP'],

  // ---------- USA, Kurse in Dollar ----------
  ['NVIDIA'                      , 'NVDA'  ,    223.67, 'USD',  28.28, 0.45, 'Halbleiter'  , 'USA'            , 'stocks/nvda'],
  ['Apple'                       , 'AAPL'  ,    315.34, 'USD',  36.17, 0.34, 'Technologie' , 'USA'            , 'stocks/aapl'],
  ['Alphabet'                    , 'GOOGL' ,    330.65, 'USD',  16.59, 0.27, 'Technologie' , 'USA'            , 'stocks/googl'],
  ['Microsoft'                   , 'MSFT'  ,    491.65, 'USD',  27.39, 0.74, 'Technologie' , 'USA'            , 'stocks/msft'],
  ['Amazon'                      , 'AMZN'  ,     252.4, 'USD',   20.3,    0, 'Handel'      , 'USA'            , 'stocks/amzn'],
  ['Broadcom'                    , 'AVGO'  ,    364.38, 'USD',  46.51, 0.71, 'Halbleiter'  , 'USA'            , 'stocks/avgo'],
  ['Meta Platforms'              , 'META'  ,    653.69, 'USD',  24.63, 0.32, 'Technologie' , 'USA'            , 'stocks/meta'],
  ['Tesla'                       , 'TSLA'  ,    367.81, 'USD', 381.68,    0, 'Automobil'   , 'USA'            , 'stocks/tsla'],
  ['Berkshire Hathaway'          , 'BRK.B' ,    506.72, 'USD',  12.64,    0, 'Finanzen'    , 'USA'            , 'stocks/brk.b'],
  ['Micron Technology'           , 'MU'    ,   1027.77, 'USD',  23.19, 0.06, 'Halbleiter'  , 'USA'            , 'stocks/mu'],
  ['JPMorgan Chase'              , 'JPM'   ,    354.71, 'USD',  15.22, 1.69, 'Banken'      , 'USA'            , 'stocks/jpm'],
  ['Walmart'                     , 'WMT'   ,    105.83, 'USD',  38.35, 0.94, 'Handel'      , 'USA'            , 'stocks/wmt'],
  ['AMD'                         , 'AMD'   ,   521.095, 'USD',    133,    0, 'Halbleiter'  , 'USA'            , 'stocks/amd'],
  ['Visa'                        , 'V'     ,    367.39, 'USD',  31.28, 0.73, 'Finanzen'    , 'USA'            , 'stocks/v'],
  ['Johnson & Johnson'           , 'JNJ'   ,    267.08, 'USD',  30.96, 2.01, 'Pharma'      , 'USA'            , 'stocks/jnj'],
  ['Cisco'                       , 'CSCO'  ,    109.43, 'USD',  32.86, 1.54, 'Technologie' , 'USA'            , 'stocks/csco'],
  ['Costco'                      , 'COST'  ,     902.6, 'USD',   45.4, 0.65, 'Handel'      , 'USA'            , 'stocks/cost'],
  ['Applied Materials'           , 'AMAT'  ,    468.85, 'USD',  40.44, 0.45, 'Halbleiter'  , 'USA'            , 'stocks/amat'],
  ['Caterpillar'                 , 'CAT'   ,    815.56, 'USD',  35.15,  0.8, 'Industrie'   , 'USA'            , 'stocks/cat'],
  ['Lam Research'                , 'LRCX'  ,    315.84, 'USD',  54.83, 0.33, 'Halbleiter'  , 'USA'            , 'stocks/lrcx'],
  ['Palantir'                    , 'PLTR'  ,    169.53, 'USD', 144.99,    0, 'Technologie' , 'USA'            , 'stocks/pltr'],
  ['Coca-Cola'                   , 'KO'    ,     87.55, 'USD',  26.31, 2.42, 'Nahrung'     , 'USA'            , 'stocks/ko'],
  ['Chevron'                     , 'CVX'   ,    213.81, 'USD',  20.53, 3.33, 'Energie'     , 'USA'            , 'stocks/cvx'],
  ['UnitedHealth'                , 'UNH'   ,    393.06, 'USD',   25.3, 2.36, 'Gesundheit'  , 'USA'            , 'stocks/unh'],
  ['Home Depot'                  , 'HD'    ,    310.45, 'USD',  21.72,    3, 'Handel'      , 'USA'            , 'stocks/hd'],
  ['Procter & Gamble'            , 'PG'    ,    142.64, 'USD',  21.53, 3.05, 'Konsum'      , 'USA'            , 'stocks/pg'],
  ['Merck & Co'                  , 'MRK'   ,    147.53, 'USD', 115.91, 2.31, 'Pharma'      , 'USA'            , 'stocks/mrk'],
  ['Goldman Sachs'               , 'GS'    ,   1028.78, 'USD',  15.92, 1.94, 'Banken'      , 'USA'            , 'stocks/gs'],
  ['Netflix'                     , 'NFLX'  ,     76.03, 'USD',  23.95,    0, 'Medien'      , 'USA'            , 'stocks/nflx'],
  ['Texas Instruments'           , 'TXN'   ,    261.59, 'USD',  39.74, 2.17, 'Halbleiter'  , 'USA'            , 'stocks/txn'],
  ['KLA'                         , 'KLAC'  ,    182.91, 'USD',  49.98,  0.5, 'Halbleiter'  , 'USA'            , 'stocks/klac'],
  ['American Express'            , 'AXP'   ,     321.8, 'USD',  19.54, 1.18, 'Finanzen'    , 'USA'            , 'stocks/axp'],
  ['Palo Alto Networks'          , 'PANW'  ,     335.1, 'USD',  889.6,    0, 'Technologie' , 'USA'            , 'stocks/panw'],
  ['Intel'                       , 'INTC'  ,    106.24, 'USD', null  ,    0, 'Halbleiter'  , 'USA'            , 'stocks/intc'],
  ['Mastercard'                  , 'MA'    ,     567.5, 'USD',  31.21, 0.61, 'Finanzen'    , 'USA'            , 'stocks/ma'],
  ['Eli Lilly'                   , 'LLY'   ,   1124.21, 'USD',  37.74, 0.62, 'Pharma'      , 'USA'            , 'stocks/lly'],
  ['ExxonMobil'                  , 'XOM'   ,    164.23, 'USD',  21.17, 2.51, 'Energie'     , 'USA'            , 'stocks/xom'],
  ['Oracle'                      , 'ORCL'  ,    161.63, 'USD',  27.72, 1.24, 'Technologie' , 'USA'            , 'stocks/orcl'],
  ['GE Aerospace'                , 'GE'    ,    325.42, 'USD',  38.36, 0.58, 'Luftfahrt'   , 'USA'            , 'stocks/ge'],
  ['Bank of America'             , 'BAC'   ,     62.67, 'USD',  14.48, 2.04, 'Banken'      , 'USA'            , 'stocks/bac'],

  // ---------- Asien und Sonstige, Kurse in Dollar (Zweitnotiz in New York) ----------
  ['TSMC'                        , 'TSM'   ,    435.36, 'USD',  29.12, 0.74, 'Halbleiter'  , 'Taiwan'         , 'stocks/tsm'],
  ['SK hynix'                    , 'SKHY'  ,   1859000, 'KRW',   8.14, 0.19, 'Halbleiter'  , 'Suedkorea'      , 'quote/krx/000660'],
  ['Alibaba'                     , 'BABA'  ,     109.4, 'USD',  24.97, 0.96, 'Handel'      , 'China'          , 'stocks/baba'],
  ['Mitsubishi UFJ'              , 'MUFG'  ,     23.14, 'USD',  21.89, 1.91, 'Banken'      , 'Japan'          , 'stocks/mufg'],
  ['Arm Holdings'                , 'ARM'   ,    264.23, 'USD', 269.71,    0, 'Halbleiter'  , 'Grossbritannien', 'stocks/arm'],
  ['Shell'                       , 'SHEL'  ,      95.6, 'USD',  10.51, 3.16, 'Energie'     , 'Grossbritannien', 'stocks/shel'],
  ['AstraZeneca'                 , 'AZN'   ,    156.94, 'USD',  23.43, 2.06, 'Pharma'      , 'Grossbritannien', 'stocks/azn'],
  ['HSBC'                        , 'HSBC'  ,    105.11, 'USD',  17.04, 3.55, 'Banken'      , 'Grossbritannien', 'stocks/hsbc'],
  ['Novartis'                    , 'NVS'   ,    137.48, 'USD',  20.53, 2.24, 'Pharma'      , 'Schweiz'        , 'stocks/nvs'],
  ['Royal Bank of Canada'        , 'RY'    ,    206.81, 'USD',  18.29, 2.38, 'Banken'      , 'Kanada'         , 'stocks/ry'],

  // ---------- Deutschland (MDAX/DAX-Nachzuegler) ----------
  ['Porsche AG'                  , 'P911'  ,     45.27, 'EUR',  48.49, 2.24, 'Automobil'   , 'Deutschland'    , 'quote/etr/P911'],
  ['Fresenius'                   , 'FRE'   ,      44.5, 'EUR',  15.98, 2.35, 'Gesundheit'  , 'Deutschland'    , 'quote/etr/FRE'],
  ['Fresenius Medical Care'      , 'FME'   ,      38.8, 'EUR',  11.52, 3.84, 'Gesundheit'  , 'Deutschland'    , 'quote/etr/FME'],
  ['Symrise'                     , 'SY1'   ,      88.2, 'EUR',  50.17, 1.37, 'Chemie'      , 'Deutschland'    , 'quote/etr/SY1'],
  ['Sartorius Vorzuege'          , 'SRT3'  ,     235.4, 'EUR',  74.92,  0.3, 'Gesundheit'  , 'Deutschland'    , 'quote/etr/SRT3'],
  ['Talanx'                      , 'TLX'   ,     120.3, 'EUR',  11.83, 2.83, 'Versicherung', 'Deutschland'    , 'quote/etr/TLX'],

  // ---------- Europa ohne Deutschland ----------
  ['Publicis Groupe'             , 'PUB'   ,     96.36, 'EUR',  14.96, 3.68, 'Medien'      , 'Frankreich'     , 'quote/epa/PUB'],
  ['Stellantis'                  , 'STLA'  ,    4.5685, 'EUR', null  ,    0, 'Automobil'   , 'Niederlande'    , 'quote/epa/STLAP'],
  ['Prosus'                      , 'PRX'   ,    35.635, 'EUR',   7.88, 0.76, 'Technologie' , 'Niederlande'    , 'quote/ams/PRX'],
  ['Generali'                    , 'G'     ,     44.53, 'EUR',   15.1, 3.72, 'Versicherung', 'Italien'        , 'quote/bit/G'],
  ['BBVA'                        , 'BBVA'  ,     24.93, 'EUR',  13.24, 3.62, 'Banken'      , 'Spanien'        , 'quote/bme/BBVA'],
  ['Telefonica'                  , 'TEF'   ,      3.61, 'EUR', null  , 8.19, 'Telekom'     , 'Spanien'        , 'quote/bme/TEF'],
  ['KBC Group'                   , 'KBC'   , 129.89999, 'EUR',  14.52, 3.82, 'Banken'      , 'Belgien'        , 'quote/ebr/KBC'],

  // ---------- Grossbritannien, Kurse in Pence (GBX) an der LSE ----------
  ['Unilever'                    , 'ULVR'  ,    4598.5, 'GBX',  21.05, 3.63, 'Konsum'      , 'Grossbritannien', 'quote/lon/ULVR'],
  ['BP'                          , 'BP1'   ,     562.2, 'GBX',  21.44, 4.57, 'Energie'     , 'Grossbritannien', 'quote/lon/BP'],
  ['GSK'                         , 'GSK'   ,      1790, 'GBX',   15.3, 3.87, 'Pharma'      , 'Grossbritannien', 'quote/lon/GSK'],
  ['Diageo'                      , 'DGE'   ,    1583.5, 'GBX',  27.22, 2.22, 'Nahrung'     , 'Grossbritannien', 'quote/lon/DGE'],
  ['Rio Tinto'                   , 'RIO'   ,      7540, 'GBX',  13.66, 3.91, 'Industrie'   , 'Grossbritannien', 'quote/lon/RIO'],
  ['Barclays'                    , 'BARC'  ,    486.35, 'GBX',  10.14, 1.74, 'Banken'      , 'Grossbritannien', 'quote/lon/BARC'],
  ['Lloyds Banking Group'        , 'LLOY'  ,     109.6, 'GBX',  13.74, 3.29, 'Banken'      , 'Grossbritannien', 'quote/lon/LLOY'],
  ['BAE Systems'                 , 'BA1'   ,      1904, 'GBX',   27.2, 0.02, 'Ruestung'    , 'Grossbritannien', 'quote/lon/BA'],
  ['Rolls-Royce'                 , 'RR'    ,      1431, 'GBX',  39.96, 0.81, 'Luftfahrt'   , 'Grossbritannien', 'quote/lon/RR'],

  // ---------- Schweiz, Kurse in Franken an der SIX ----------
  ['Nestle'                      , 'NESN'  ,     77.58, 'CHF',  26.88, 3.94, 'Nahrung'     , 'Schweiz'        , 'quote/swx/NESN'],
  ['Roche'                       , 'RO'    ,     352.2, 'CHF',  22.52, 3.06, 'Pharma'      , 'Schweiz'        , 'quote/swx/RO'],
  ['Zurich Insurance'            , 'ZURN'  , 586.20001, 'CHF',  14.68, 4.96, 'Versicherung', 'Schweiz'        , 'quote/swx/ZURN'],
  ['ABB'                         , 'ABBN'  ,     78.38, 'CHF',  35.63, 1.22, 'Industrie'   , 'Schweiz'        , 'quote/swx/ABBN'],
  ['UBS Group'                   , 'UBSG'  ,     44.57, 'CHF',   18.8, 1.99, 'Banken'      , 'Schweiz'        , 'quote/swx/UBSG'],
  ['Richemont'                   , 'CFR'   ,       173, 'CHF',  32.23,  1.8, 'Luxus'       , 'Schweiz'        , 'quote/swx/CFR'],
  ['Holcim'                      , 'HOLN'  ,     71.18, 'CHF', 101.65, 2.37, 'Bau'         , 'Schweiz'        , 'quote/swx/HOLN'],
  ['Sika'                        , 'SIKA'  ,    187.55, 'CHF',     29, 1.97, 'Chemie'      , 'Schweiz'        , 'quote/swx/SIKA'],
  ['Swiss Re'                    , 'SREN'  ,     135.9, 'CHF',  10.13, 4.58, 'Versicherung', 'Schweiz'        , 'quote/swx/SREN'],
  ['Lonza'                       , 'LONN'  , 542.79999, 'CHF',  34.78, 0.87, 'Pharma'      , 'Schweiz'        , 'quote/swx/LONN'],

  // ---------- Japan, Kurse in Yen an der Boerse Tokio ----------
  ['Toyota Motor'                , '7203'  ,      2994, 'JPY',    8.5, 3.25, 'Automobil'   , 'Japan'          , 'quote/tyo/7203'],
  ['Sony Group'                  , '6758'  ,      3640, 'JPY',  19.35, 0.96, 'Technologie' , 'Japan'          , 'quote/tyo/6758'],
  ['Nintendo'                    , '7974'  ,      7989, 'JPY',  20.51, 1.83, 'Medien'      , 'Japan'          , 'quote/tyo/7974'],
  ['Keyence'                     , '6861'  ,     76500, 'JPY',  37.59, 0.71, 'Industrie'   , 'Japan'          , 'quote/tyo/6861'],
  ['Tokyo Electron'              , '8035'  ,     52810, 'JPY',  38.99,  1.4, 'Halbleiter'  , 'Japan'          , 'quote/tyo/8035'],
  ['Advantest'                   , '6857'  ,     33920, 'JPY',  52.11, 0.18, 'Halbleiter'  , 'Japan'          , 'quote/tyo/6857'],
  ['SoftBank Group'              , '9984'  ,      6810, 'JPY',   7.92, 0.22, 'Technologie' , 'Japan'          , 'quote/tyo/9984'],
  ['Hitachi'                     , '6501'  ,      5182, 'JPY',  29.29, 1.05, 'Industrie'   , 'Japan'          , 'quote/tyo/6501'],
  ['Mitsubishi Corporation'      , '8058'  ,      4987, 'JPY',  21.07, 2.45, 'Handel'      , 'Japan'          , 'quote/tyo/8058'],
  ['Shin-Etsu Chemical'          , '4063'  ,      5762, 'JPY',  22.49, 2.01, 'Chemie'      , 'Japan'          , 'quote/tyo/4063'],
  ['Takeda Pharmaceutical'       , '4502'  ,      5657, 'JPY', null  , 3.45, 'Pharma'      , 'Japan'          , 'quote/tyo/4502'],
  ['Honda Motor'                 , '7267'  ,    1634.5, 'JPY', null  , 4.13, 'Automobil'   , 'Japan'          , 'quote/tyo/7267'],
  ['Sumitomo Mitsui Financial'   , '8316'  ,      6901, 'JPY',  20.63, 2.54, 'Banken'      , 'Japan'          , 'quote/tyo/8316'],
  ['Fast Retailing'              , '9983'  ,     66810, 'JPY',  39.51, 0.92, 'Handel'      , 'Japan'          , 'quote/tyo/9983'],
  ['Nippon Telegraph & Telephone', '9432'  ,     175.2, 'JPY',   13.6, 3.08, 'Telekom'     , 'Japan'          , 'quote/tyo/9432'],

  // ---------- Suedkorea, Kurse in Won an der KRX ----------
  ['Samsung Electronics'         , '005930',    269250, 'KRW',  12.02, 0.89, 'Technologie' , 'Suedkorea'      , 'quote/krx/005930'],
  ['Hyundai Motor'               , '005380',    389000, 'KRW',  12.45, 2.61, 'Automobil'   , 'Suedkorea'      , 'quote/krx/005380'],
  ['Kia'                         , '000270',    127000, 'KRW',   6.99, 5.34, 'Automobil'   , 'Suedkorea'      , 'quote/krx/000270'],
  ['NAVER'                       , '035420',    208000, 'KRW',  15.68, 1.27, 'Technologie' , 'Suedkorea'      , 'quote/krx/035420'],
  ['Samsung Biologics'           , '207940',   1423000, 'KRW',  33.52,    0, 'Pharma'      , 'Suedkorea'      , 'quote/krx/207940'],
  ['POSCO Holdings'              , '005490',    339000, 'KRW',  18.91, 2.38, 'Industrie'   , 'Suedkorea'      , 'quote/krx/005490'],
  ['LG Energy Solution'          , '373220',    365000, 'KRW', null  ,    0, 'Industrie'   , 'Suedkorea'      , 'quote/krx/373220'],

  // ---------- Hongkong, Kurse in Hongkong-Dollar ----------
  ['Tencent Holdings'            , '0700'  ,     425.6, 'HKD',  14.77, 1.22, 'Technologie' , 'Hongkong'       , 'quote/hkg/0700'],
  ['AIA Group'                   , '1299'  ,      75.3, 'HKD',  12.84,  2.5, 'Versicherung', 'Hongkong'       , 'quote/hkg/1299'],
  ['Hong Kong Exchanges'         , '0388'  ,       397, 'HKD',  25.62, 3.59, 'Finanzen'    , 'Hongkong'       , 'quote/hkg/0388'],

  // ---------- Kanada, Kurse in kanadischen Dollar an der TSX ----------
  ['Shopify'                     , 'SHOP'  ,    175.13, 'CAD',   82.3,    0, 'Technologie' , 'Kanada'         , 'quote/tsx/SHOP'],
  ['Toronto-Dominion Bank'       , 'TD'    ,     164.7, 'CAD',   17.7, 2.72, 'Banken'      , 'Kanada'         , 'quote/tsx/TD'],
  ['Bank of Nova Scotia'         , 'BNS'   ,    127.29, 'CAD',  16.63, 3.56, 'Banken'      , 'Kanada'         , 'quote/tsx/BNS'],
  ['Bank of Montreal'            , 'BMO'   ,    238.32, 'CAD',  19.42, 2.81, 'Banken'      , 'Kanada'         , 'quote/tsx/BMO'],
  ['Enbridge'                    , 'ENB'   ,     69.28, 'CAD',  26.75,  5.6, 'Energie'     , 'Kanada'         , 'quote/tsx/ENB'],
  ['Canadian Natural Resources'  , 'CNQ'   ,      70.9, 'CAD',  12.61, 3.53, 'Energie'     , 'Kanada'         , 'quote/tsx/CNQ'],
  ['Canadian National Railway'   , 'CNR'   ,    168.35, 'CAD',  21.61, 2.16, 'Logistik'    , 'Kanada'         , 'quote/tsx/CNR'],
  ['Canadian Pacific Kansas City', 'CP'    ,    124.46, 'CAD',  28.95, 0.85, 'Logistik'    , 'Kanada'         , 'quote/tsx/CP'],
  ['BCE'                         , 'BCE'   ,     32.25, 'CAD',    4.8, 5.33, 'Telekom'     , 'Kanada'         , 'quote/tsx/BCE'],
  ['Brookfield Corporation'      , 'BN1'   ,     53.25, 'CAD',  69.76, 0.69, 'Finanzen'    , 'Kanada'         , 'quote/tsx/BN'],

  // ---------- USA ----------
  ['Boeing'                      , 'BA'    ,    206.42, 'USD',  76.98,    0, 'Luftfahrt'   , 'USA'            , 'stocks/ba'],
  ['Walt Disney'                 , 'DIS'   ,    104.18, 'USD',  21.54, 1.44, 'Medien'      , 'USA'            , 'stocks/dis'],
  ['Verizon Communications'      , 'VZ'    ,     49.74, 'USD',  12.96, 5.69, 'Telekom'     , 'USA'            , 'stocks/vz'],
  ['Lockheed Martin'             , 'LMT'   ,    524.46, 'USD',  19.33, 2.63, 'Ruestung'    , 'USA'            , 'stocks/lmt'],
  ['American Tower'              , 'AMT'   ,    175.43, 'USD',  24.13, 4.08, 'Immobilien'  , 'USA'            , 'stocks/amt'],
  ['Salesforce'                  , 'CRM'   ,    244.16, 'USD',  22.63, 0.72, 'Technologie' , 'USA'            , 'stocks/crm'],
  ['Adobe'                       , 'ADBE'  ,    254.86, 'USD',  14.58,    0, 'Technologie' , 'USA'            , 'stocks/adbe'],
  ['Qualcomm'                    , 'QCOM'  ,     176.4, 'USD',  20.53, 2.09, 'Halbleiter'  , 'USA'            , 'stocks/qcom'],
  ['IBM'                         , 'IBM'   ,    239.94, 'USD',  21.33, 2.82, 'Technologie' , 'USA'            , 'stocks/ibm'],
  ['Pfizer'                      , 'PFE'   ,     27.78, 'USD',  36.52, 6.19, 'Pharma'      , 'USA'            , 'stocks/pfe'],
  ['AbbVie'                      , 'ABBV'  ,    250.91, 'USD',  70.88, 2.76, 'Pharma'      , 'USA'            , 'stocks/abbv'],
  ['McDonald\'s'                 , 'MCD'   ,    253.48, 'USD',  20.59, 2.94, 'Nahrung'     , 'USA'            , 'stocks/mcd'],
  ['Nike'                        , 'NKE'   ,     37.35, 'USD',  17.79, 4.39, 'Konsum'      , 'USA'            , 'stocks/nke'],
  ['PepsiCo'                     , 'PEP'   ,    136.69, 'USD',  17.91, 4.33, 'Nahrung'     , 'USA'            , 'stocks/pep'],
  ['Coinbase'                    , 'COIN'  ,    174.72, 'USD', null  ,    0, 'Finanzen'    , 'USA'            , 'stocks/coin'],







];

/**
 * ETFs. Kurse in Dollar von stockanalysis.com.
 * Die Namen sind die offiziellen Produktnamen derselben Quelle - keine
 * eingedeutschten Gattungsbegriffe. Ein ETF, der schlicht 'Immobilien' heisst,
 * ist von einer Meldung ueber 'Immobilienwerte' nicht zu unterscheiden; mit
 * 'Vanguard Real Estate ETF' sieht man, dass hier ein echtes Produkt liegt.
 *
 * [name, kuerzel, kurs, fondsvolumenMrdUsd, anzahlPositionen, ter,
 *  ausschuettend, bereich, anlageklasse, quelle]
 *
 * TER und Ausschuettungsart standen bis 2026-08-08 in einer eigenen Tabelle
 * daneben, weil sie aus einer zweiten Quelle kamen. Sie sind hier
 * eingewandert, seit hole-kurse.js die Produktseite je ETF abruft und alles
 * aus einem Abruf hat. Zwei getrennte Tabellen waren eine Falle: wer einen
 * ETF nur in der einen ergaenzt, bekommt still ein null statt einer TER.
 *
 * Ausschuettungsart: alle sind US-Produkte. Ein US-Investmentfonds muss den
 * Grossteil seiner Ertraege ausschuetten, um steuerlich als Regulated
 * Investment Company zu gelten - thesaurierende ETFs gibt es dort praktisch
 * nicht. Die Rohstoff- und Krypto-Trusts sind die Ausnahme, aber aus einem
 * anderen Grund: sie halten einen Sachwert und erwirtschaften ueberhaupt
 * keine Ertraege, die auszuschuetten waeren. hole-kurse.js liest das am
 * gemeldeten Zahlrhythmus ab, statt es zu setzen.
 */

const ETFS = [








  ['Vanguard S&P 500 ETF'                             , 'VOO' , 700.87,  1070,   518, 0.03, true, 'USA breit'       , 'Aktien'  , 'etf/voo'],
  ['Invesco QQQ Trust'                                , 'QQQ' , 716.31, 480.4,   105, 0.18, true, 'USA Technologie' , 'Aktien'  , 'etf/qqq'],
  ['Vanguard Total World Stock ETF'                   , 'VT'  , 159.89,  81.8, 10118, 0.06, true, 'Welt'            , 'Aktien'  , 'etf/vt'],
  ['Vanguard FTSE Developed Markets ETF'              , 'VEA' ,  72.82, 240.5,  3877, 0.03, true, 'Welt ohne USA'   , 'Aktien'  , 'etf/vea'],
  ['Vanguard FTSE Emerging Markets ETF'               , 'VWO' ,  60.87, 128.9,  5063, 0.06, true, 'Schwellenlaender', 'Aktien'  , 'etf/vwo'],
  ['iShares MSCI EAFE ETF'                            , 'EFA' , 106.56,  79.6,   699, 0.32, true, 'Europa/Asien'    , 'Aktien'  , 'etf/efa'],
  ['iShares Russell 2000 ETF'                         , 'IWM' , 290.64,  78.4,  1971, 0.19, true, 'USA klein'       , 'Aktien'  , 'etf/iwm'],
  ['iShares Core S&P Mid-Cap ETF'                     , 'IJH' ,  74.56, 123.8,   415, 0.05, true, 'USA mittel'      , 'Aktien'  , 'etf/ijh'],
  ['SPDR Dow Jones Industrial Average ETF'            , 'DIA' , 524.07,  45.6,    31, 0.16, true, 'USA Standard'    , 'Aktien'  , 'etf/dia'],
  ['Invesco S&P 500 Equal Weight ETF'                 , 'RSP' , 214.64,  99.5,   509,  0.2, true, 'USA breit'       , 'Aktien'  , 'etf/rsp'],
  ['Vanguard Growth ETF'                              , 'VUG' ,  87.68, 226.8,   151, 0.03, true, 'USA Wachstum'    , 'Aktien'  , 'etf/vug'],
  ['Vanguard Value ETF'                               , 'VTV' , 223.92, 193.8,   324, 0.03, true, 'USA Substanz'    , 'Aktien'  , 'etf/vtv'],
  ['Schwab US Dividend Equity ETF'                    , 'SCHD',  34.09, 112.6,   103, 0.06, true, 'Dividenden'      , 'Aktien'  , 'etf/schd'],
  ['Vanguard High Dividend Yield ETF'                 , 'VYM' , 162.69,  83.3,   615, 0.04, true, 'Dividenden'      , 'Aktien'  , 'etf/vym'],
  ['Technology Select Sector SPDR'                    , 'XLK' , 187.87,   122,    76, 0.08, true, 'Technologie'     , 'Aktien'  , 'etf/xlk'],
  ['iShares Semiconductor ETF'                        , 'SOXX',    532,  42.6,    34, 0.33, true, 'Halbleiter'      , 'Aktien'  , 'etf/soxx'],
  ['Health Care Select Sector SPDR'                   , 'XLV' , 166.58,  43.3,    63, 0.08, true, 'Gesundheit'      , 'Aktien'  , 'etf/xlv'],
  ['Financial Select Sector SPDR'                     , 'XLF' ,  57.06,  55.3,    80, 0.08, true, 'Finanzen'        , 'Aktien'  , 'etf/xlf'],
  ['Energy Select Sector SPDR'                        , 'XLE' ,  65.31,  42.5,    24, 0.08, true, 'Energie'         , 'Aktien'  , 'etf/xle'],
  ['Vanguard Real Estate ETF'                         , 'VNQ' ,  94.94,  37.5,   154, 0.13, true, 'Immobilien'      , 'Aktien'  , 'etf/vnq'],
  ['SPDR Gold Shares'                                 , 'GLD' , 403.35, 148.5,     2,  0.4, true, 'Rohstoffe'       , 'Rohstoff', 'etf/gld'],
  ['iShares Core US Aggregate Bond ETF'               , 'AGG' ,  96.68, 138.2, 13390, 0.03, true, 'Anleihen'        , 'Anleihen', 'etf/agg'],
  ['iShares 20+ Year Treasury Bond ETF'               , 'TLT' ,  81.73,  46.9,    48, 0.15, true, 'Anleihen'        , 'Anleihen', 'etf/tlt'],
  ['Vanguard Interm.-Term Corp. Bond ETF'             , 'VCIT',  80.31,  69.5,  2282, 0.03, true, 'Anleihen'        , 'Anleihen', 'etf/vcit'],
  ['iShares Bitcoin Trust'                            , 'IBIT',  44.29,  61.6,     2, 0.25, true, 'Krypto'          , 'Krypto'  , 'etf/ibit'],

  // ---------- Ausbau 2026-08-08 ----------
  ['SPDR S&P 500 ETF Trust'                           , 'SPY' ,  762.4, 806.1,   505, 0.09, true, 'USA breit'       , 'Aktien'  , 'etf/spy'],
  ['iShares Core S&P 500 ETF'                         , 'IVV' ,  766.1, 849.5,   508, 0.03, true, 'USA breit'       , 'Aktien'  , 'etf/ivv'],
  ['Vanguard Total Stock Market ETF'                  , 'VTI' , 375.56, 690.3,  3498, 0.03, true, 'USA breit'       , 'Aktien'  , 'etf/vti'],
  ['iShares Core MSCI EAFE ETF'                       , 'IEFA',  99.42, 194.4,  2641, 0.07, true, 'Europa/Asien'    , 'Aktien'  , 'etf/iefa'],
  ['iShares Core MSCI Emerging Markets ETF'           , 'IEMG',  83.25, 164.6,  2896, 0.09, true, 'Schwellenlaender', 'Aktien'  , 'etf/iemg'],
  ['iShares MSCI Japan ETF'                           , 'EWJ' ,     97,  23.5,   173, 0.49, true, 'Japan'           , 'Aktien'  , 'etf/ewj'],
  ['iShares MSCI Eurozone ETF'                        , 'EZU' ,  69.63,   9.9,   226,  0.5, true, 'Eurozone'        , 'Aktien'  , 'etf/ezu'],
  ['iShares China Large-Cap ETF'                      , 'FXI' ,  34.55,   4.3,    59, 0.74, true, 'China'           , 'Aktien'  , 'etf/fxi'],
  ['iShares MSCI India ETF'                           , 'INDA',  48.67,   6.7,   175, 0.61, true, 'Indien'          , 'Aktien'  , 'etf/inda'],
  ['Industrial Select Sector SPDR'                    , 'XLI' , 171.79,  31.7,    86, 0.08, true, 'Industrie'       , 'Aktien'  , 'etf/xli'],
  ['Consumer Discretionary Select Sector SPDR'        , 'XLY' , 112.46,    22,    50, 0.08, true, 'Konsum'          , 'Aktien'  , 'etf/xly'],
  ['Consumer Staples Select Sector SPDR'              , 'XLP' ,  83.05,  14.4,    38, 0.08, true, 'Nahrung'         , 'Aktien'  , 'etf/xlp'],
  ['Utilities Select Sector SPDR'                     , 'XLU' ,  42.94,  22.4,    34, 0.08, true, 'Versorger'       , 'Aktien'  , 'etf/xlu'],
  ['Communication Services Select Sector SPDR'        , 'XLC' , 110.83,  22.7,    27, 0.08, true, 'Medien'          , 'Aktien'  , 'etf/xlc'],
  ['iShares Silver Trust'                             , 'SLV' ,  60.72,  32.7,     1,  0.5, true, 'Rohstoffe'       , 'Rohstoff', 'etf/slv'],
  ['Invesco DB Commodity Index Tracking Fund'         , 'DBC' ,  32.85,   1.9,    38, 0.84, true, 'Rohstoffe'       , 'Rohstoff', 'etf/dbc'],
  ['iShares iBoxx Investment Grade Corporate Bond ETF', 'LQD' , 105.31,  29.8,  3143, 0.14, true, 'Anleihen'        , 'Anleihen', 'etf/lqd'],
  ['iShares iBoxx High Yield Corporate Bond ETF'      , 'HYG' ,  78.98,  15.4,  1333, 0.49, true, 'Anleihen'        , 'Anleihen', 'etf/hyg'],
  ['iShares Ethereum Trust'                           , 'ETHA',  18.58,   8.8,     2, 0.25, true, 'Krypto'          , 'Krypto'  , 'etf/etha'],







];

/**
 * Kryptowaehrungen. Kurse und Kennzahlen direkt in Euro von CoinGecko -
 * deshalb steht hier keine Waehrungsspalte und nichts wird umgerechnet.
 * [name, kuerzel, kurs, marktkapitalisierung, umlaufmenge, hoechstmenge,
 *  allzeithoch, quelle]
 * hoechstmenge === null heisst: unbegrenzt (Ethereum, Solana, Dogecoin).
 *
 * ⚠️ Coins unter etwa einem Cent gehoeren hier NICHT herein, so bekannt sie
 * sein moegen. `kursText()` in bildschirme.js zeigt Kurse unter einem Euro
 * mit vier Nachkommastellen - Shiba Inu (0,0000041 EUR) staende in der
 * gesamten App als "0,0000 €", im Marktueberblick wie im Kaufdialog. Beim
 * Ausbau am 2026-08-08 deshalb gegen Aave getauscht. Wer so einen Coin
 * aufnehmen will, muss vorher die Anzeige koennen, nicht danach.
 */
const KRYPTO = [








  ['Bitcoin'     , 'BTC' ,    67035, 1346207548574,     20082225,     21000000,   107662, 'coingecko/bitcoin'],
  ['Ethereum'    , 'ETH' ,  2122.86,  259064364170,    122035557, null        ,  4229.76, 'coingecko/ethereum'],
  ['XRP'         , 'XRP' ,     1.18,   74337115717,  62744504852, 100000000000,     3.28, 'coingecko/ripple'],
  ['Solana'      , 'SOL' ,    86.96,   50988019031,    586335864, null        ,    285.6, 'coingecko/solana'],
  ['Dogecoin'    , 'DOGE', 0.073024,   11381195222, 155856026384, null        , 0.601466, 'coingecko/dogecoin'],
  ['Cardano'     , 'ADA' , 0.183356,    6877774318,  37510482444,  45000000000,     2.61, 'coingecko/cardano'],
  ['Chainlink'   , 'LINK',    10.14,    7586988780,    748099970,   1000000000,    43.32, 'coingecko/chainlink'],
  ['Litecoin'    , 'LTC' ,    45.02,    3492849172,     77591379,     84000000,   337.56, 'coingecko/litecoin'],
  ['Avalanche'   , 'AVAX',     6.65,    2873318574,    431771961,    720000000,   128.43, 'coingecko/avalanche-2'],
  ['Polkadot'    , 'DOT' , 0.944258,    1607205465,   1702083270,   2100000000,     47.6, 'coingecko/polkadot'],

  // ---------- Ausbau 2026-08-08 ----------
  ['BNB'         , 'BNB' ,   616.49,   82092595467,    133161248,    200000000,  1182.86, 'coingecko/binancecoin'],
  ['Tron'        , 'TRX' , 0.292459,   27766656117,  94942001308, null        , 0.410308, 'coingecko/tron'],
  ['Toncoin'     , 'TON' ,     1.18,    3273813190,   2785702823, null        ,      7.7, 'coingecko/the-open-network'],
  ['Aave'        , 'AAVE',    106.5,    1643103716,     15427527,     16000000,   541.28, 'coingecko/aave'],
  ['Stellar'     , 'XLM' ,  0.15419,    5366894965,  34807090055, null        , 0.729104, 'coingecko/stellar'],
  ['Bitcoin Cash', 'BCH' ,   212.79,    4274305912,     20087166,     21000000,  3187.12, 'coingecko/bitcoin-cash'],
  ['Monero'      , 'XMR' ,   436.99,    8216687247,     18802767, null        ,   685.48, 'coingecko/monero'],
  ['Uniswap'     , 'UNI' ,     5.18,    3226846063,    623212424,   1000000000,    37.37, 'coingecko/uniswap'],







];

// ---------------------------------------------------------------------------

function nachEuro(kurs, waehrung) {
  if (waehrung === 'EUR') return kurs;
  // GBX sind Pence: erst durch hundert, dann wie Pfund.
  if (waehrung === 'GBX') return kurs / 100 / WECHSELKURSE.GBP;
  const kk = WECHSELKURSE[waehrung];
  // Kein Rueckfall auf 1: eine unbekannte Waehrung stillschweigend als Euro
  // zu behandeln, waere ein Kursfehler um den Faktor 180 (Yen) - und die
  // Zahl saehe im Spiel voellig normal aus.
  if (!(kk > 0)) throw new Error('Kein Wechselkurs hinterlegt fuer: ' + waehrung);
  return kurs / kk;
}

// Auf sinnvolle Stellen runden: teure Werte auf Cent, billige Coins feiner.
function runde(zahl) {
  if (zahl >= 100) return Math.round(zahl * 100) / 100;
  if (zahl >= 1) return Math.round(zahl * 10000) / 10000;
  /* Unter einem Euro auf sechs BEDEUTSAME Stellen, nicht auf sechs
     Nachkommastellen. Der Unterschied wird erst bei Kleinstkursen sichtbar:
     ein Coin bei 0,0000041 EUR haette auf sechs Nachkommastellen gerundet
     0,000004 - eine einzige bedeutsame Stelle und damit bis zu 12 % daneben,
     mitten im Startkurs, an dem die ganze Partie haengt. */
  if (!(zahl > 0)) return zahl;
  return Number(zahl.toPrecision(6));
}

const werte = [];
const fehler = [];
const kuerzelGesehen = new Set();

for (const [name, kuerzel, kurs, waehrung, kgv, divRendite, sektor, land] of AKTIEN) {
  if (kuerzelGesehen.has(kuerzel)) fehler.push('Kuerzel doppelt: ' + kuerzel);
  kuerzelGesehen.add(kuerzel);
  if (!(kurs > 0)) fehler.push('Kurs fehlt oder ist nicht positiv: ' + name);

  const kursEur = runde(nachEuro(kurs, waehrung));

  // Gewinn je Aktie aus Kurs und KGV. Das ist der Anker, an dem das KGV
  // waehrend der Partie mitwandert: KGV = Kurs / Gewinn je Aktie.
  const gewinnJeAktie = kgv && kgv > 0 ? runde(kursEur / kgv) : null;

  // Dividende je Aktie aus der Rendite. Wird im Spiel jaehrlich gebucht.
  const dividende = divRendite > 0 ? runde((kursEur * divRendite) / 100) : 0;

  werte.push({
    id: kuerzel.toLowerCase().replace(/[^a-z0-9]/g, ''),
    art: 'aktie',
    name,
    kuerzel,
    kurs: kursEur,
    kursOriginal: waehrung === 'EUR' ? null : kurs,
    waehrungOriginal: waehrung === 'EUR' ? null : waehrung,
    kgv,
    gewinnJeAktie,
    dividende,
    divRendite: divRendite || 0,
    sektor,
    land,
  });
}

for (const [name, kuerzel, kurs, volumenMrd, positionen, ter, ausschuettend, bereich, anlageklasse] of ETFS) {
  if (kuerzelGesehen.has(kuerzel)) fehler.push('Kuerzel doppelt: ' + kuerzel);
  kuerzelGesehen.add(kuerzel);
  if (!(kurs > 0)) fehler.push('Kurs fehlt: ' + name);

  werte.push({
    id: kuerzel.toLowerCase(),
    art: 'etf',
    name,
    kuerzel,
    kurs: runde(nachEuro(kurs, 'USD')),
    kursOriginal: kurs,
    waehrungOriginal: 'USD',
    fondsvolumenMrd: volumenMrd,
    anzahlPositionen: positionen,
    ter: ter === undefined ? null : ter,
    ausschuettend: ausschuettend === undefined ? null : ausschuettend,
    sektor: bereich,
    anlageklasse,
    land: null,
  });
}

for (const [name, kuerzel, kurs, marktkap, umlauf, hoechstmenge, allzeithoch] of KRYPTO) {
  if (kuerzelGesehen.has(kuerzel)) fehler.push('Kuerzel doppelt: ' + kuerzel);
  kuerzelGesehen.add(kuerzel);
  if (!(kurs > 0)) fehler.push('Kurs fehlt: ' + name);

  werte.push({
    id: kuerzel.toLowerCase(),
    art: 'krypto',
    name,
    kuerzel,
    kurs: runde(kurs),
    marktkapitalisierung: marktkap,
    umlaufmenge: umlauf,
    hoechstmenge: hoechstmenge,
    allzeithoch: allzeithoch,
    sektor: 'Krypto',
    land: null,
  });
}

// --- Pruefungen, die verhindern, dass eine halb gefuellte Datei rausgeht ---

/* Die Sollzahlen stehen hier als feste Erwartung, nicht als Untergrenze.
   Die Mischung ist Balance: die drei Arten haben in markt.js sehr
   verschiedene Schwankungsprofile, und wer aus Versehen zehn Kryptos
   nachlegt, verschiebt das ganze Spiel - ohne dass eine einzige Zahl nach
   einem Fehler aussieht. Wer die Mischung absichtlich aendert, aendert diese
   drei Zahlen mit und sieht dabei, was er tut. */
const SOLL_AKTIEN = 188;
const SOLL_ETF = 44;
const SOLL_KRYPTO = 18;

const anzahlAktien = werte.filter((w) => w.art === 'aktie').length;
const anzahlKrypto = werte.filter((w) => w.art === 'krypto').length;
const anzahlEtf = werte.filter((w) => w.art === 'etf').length;

if (anzahlKrypto !== SOLL_KRYPTO) fehler.push('Erwartet ' + SOLL_KRYPTO + ' Kryptos, gefunden ' + anzahlKrypto);
if (anzahlEtf !== SOLL_ETF) fehler.push('Erwartet ' + SOLL_ETF + ' ETFs, gefunden ' + anzahlEtf);
if (anzahlAktien !== SOLL_AKTIEN) fehler.push('Erwartet ' + SOLL_AKTIEN + ' Aktien, gefunden ' + anzahlAktien);

/* Jeder Wert braucht eine eindeutige Quelle - sonst ist er ab dem naechsten
   Pflegelauf ein Karteileichenkurs. Und dieselbe Quelle zweimal heisst:
   derselbe Konzern steht zweimal im Spiel. Das faellt ueber die Kuerzel NICHT
   auf, weil eine Heimatnotiz und ein US-Schein verschiedene Kuerzel tragen
   (Novartis als NVS in New York und als NOVN in Zuerich waeren zwei Zeilen,
   ein Unternehmen und zwei Positionen im selben Depot). */
const quellen = new Map();
const namen = new Map();
for (const [tabelle, zeilen, spalte] of [['Aktien', AKTIEN, 8], ['ETFs', ETFS, 9], ['Krypto', KRYPTO, 7]]) {
  for (const zeile of zeilen) {
    const quelle = zeile[spalte];
    if (!quelle) fehler.push(tabelle + ': keine Quelle bei ' + zeile[0]);
    else if (quellen.has(quelle)) fehler.push('Quelle doppelt: ' + quelle + ' (' + quellen.get(quelle) + ' und ' + zeile[0] + ')');
    else quellen.set(quelle, zeile[0]);
    if (namen.has(zeile[0])) fehler.push('Name doppelt: ' + zeile[0]);
    else namen.set(zeile[0], true);
  }
}

// Ein Kurs von 0 oder NaN wuerde im Kursmotor durch Division alles zerreissen.
for (const w of werte) {
  if (!Number.isFinite(w.kurs) || w.kurs <= 0) fehler.push('Unbrauchbarer Kurs bei ' + w.name);
  if (w.art === 'aktie' && w.kgv !== null && w.gewinnJeAktie === null) {
    fehler.push('KGV ohne Gewinn je Aktie bei ' + w.name);
  }
}

if (fehler.length) {
  console.error('ABBRUCH - werte.js wurde NICHT geschrieben:');
  for (const f of fehler) console.error('  - ' + f);
  process.exit(1);
}

const ausgabe = {
  stand: STAND,
  eurUsd: EUR_USD,
  hinweis:
    'Startkurse und Kennzahlen sind echte Marktdaten vom angegebenen Stand. ' +
    'Der Kursverlauf im Spiel ist simuliert und hat keinen Bezug zur Wirklichkeit.',
  quellen: [
    'stockanalysis.com (Kurse, KGV, Dividendenrendite, ETF-Kennzahlen)',
    'CoinGecko (Kryptokurse)',
    'frankfurter.dev / EZB (Wechselkurse)',
  ],
  werte,
};

// Als JS-Datei, nicht als JSON: die App braucht dann keinen zweiten Netzabruf.
// Im Bus mit halbem Balken ist jeder eingesparte Request einer weniger, der
// haengen bleibt - und ohne die Werte kann das Spiel gar nicht starten.
const ziel = path.join(__dirname, '..', 'werte.js');
fs.writeFileSync(
  ziel,
  '/* Erzeugt von pflege/baue-werte.js - NICHT von Hand aendern. */\n' +
    '/* Stand ' + STAND + '. Zum Aktualisieren die Zahlen im Pflegeskript ersetzen. */\n' +
    'const WERTE = ' + JSON.stringify(ausgabe, null, 1) + ';\n',
  'utf8'
);

console.log('werte.js geschrieben: ' + werte.length + ' Werte  (Stand ' + STAND + ')');
console.log('  Aktien: ' + anzahlAktien + '  ETFs: ' + anzahlEtf + '  Krypto: ' + anzahlKrypto);
const ohneKgv = werte.filter((w) => w.art === 'aktie' && w.kgv === null).length;
const ohneTer = werte.filter((w) => w.art === 'etf' && w.ter === null).length;
console.log('  ohne KGV (zeigt im Spiel einen Strich): ' + ohneKgv);
console.log('  ohne TER (zeigt im Spiel einen Strich): ' + ohneTer);

// Die Laenderverteilung entscheidet, ob eine Laendermeldung ueberhaupt ein
// Depot trifft. Steht sie im Lauf, faellt eine Schieflage beim Ausbau auf,
// statt erst in der Partie.
const jeLand = {};
for (const w of werte) if (w.land) jeLand[w.land] = (jeLand[w.land] || 0) + 1;
const laender = Object.keys(jeLand).sort((a, b) => jeLand[b] - jeLand[a]);
console.log('  Laender: ' + laender.map((l) => l + ' ' + jeLand[l]).join(', '));
