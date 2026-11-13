# TicketALarm – jegyelérhetőségi próba

Történeti felderítési jegyzet, 2026. október 31-i megfigyelésekkel; nem aktuális jegyelérhetőségi jelentés. Az ekkor még hiányzó figyelő, ütemezés és értesítés azóta elkészült. A projekt jelenlegi állapotát és telepítését a [README.md](README.md) ismerteti.

## Futtatás

Node.js 24 szükséges, nincs telepítendő függőség:

```powershell
node probe.ts
node probe.ts --control
```

Az első parancs a budapesti Bödőcs-előadásokat vizsgálja, a második egy külön, elérhető Kiss Ádám-előadással ellenőrzi az ülőhelyadatok feldolgozását. Kimenet: `probe-results.json`, illetve `probe-control-results.json`. Windows TLS-probléma esetére választható a `--curl` kapcsoló. Ez ugyanazokat a GET-kéréseket végzi curl.exe használatával.

## Azonosítók és adatforrások

- Kiindulópont: https://dumaszinhaz.hu/eloadasok?actor=6
- Az oldal JavaScriptjében talált lista-végpont: `https://api.dumaszinhaz.hu/api/events?filters%5Bactor_ids%5D%5B0%5D=6&perPage=100&page=1`. Lapozás a válasz `links.next` jelzése alapján.
- A lista `actors[].id === 6` és `city.name === "Budapest"` mezőkkel ellenőrizhető. A helyszín neve önmagában nem elegendő.
- Részletes adatok: `https://api.dumaszinhaz.hu/api/events/{slug}`.
- A `ticket_url` a teltházas előadásoknál is rendelkezésre áll az API-ban, miközben a megjelenített oldalon a jegyvásárlási gomb letiltott.
- Jegylink: `/program/{cím}-{programId}/{eventId}`. A Dumaszínház saját `program.id` és `audit.id` mezői más azonosítórendszerhez tartoznak, nem helyettesítik a Jegy.hu azonosítóit.
- Működő Jegy.hu nézőtéroldalon a `netaudit_id`, `netevent_id`, `netprogram_id`, `noSectors` változók olvashatók ki. A próbában az URL-beli és oldalbeli előadásazonosítók egyezését is ellenőrizzük.

## Bödőcs Tibor budapesti időpontjai

Az időpontok a közzétett oldalon látható budapesti időpontok. Az API `date_from` értékei ugyanezt az órát `Z` utótaggal adják vissza: automatikus időzóna-konverzió eltérést okozna. A próba ezért a nyers értéket őrzi meg.

| Dátum | Helyszín | Jegy.hu program / előadás |
| --- | --- | --- |
| 2026-11-08 18:00 | RAM-Art Színház | 189020 / 1407352 |
| 2026-11-08 20:30 | RAM-Art Színház | 189020 / 1407355 |
| 2026-11-10 18:00 | Erzsébetligeti Színház | 190032 / 1415640 |
| 2026-11-10 20:30 | Erzsébetligeti Színház | 190032 / 1415641 |
| 2026-11-22 18:00 | RAM-Art Színház | 189020 / 1407357 |
| 2026-11-22 20:30 | RAM-Art Színház | 189020 / 1407358 |
| 2026-12-07 18:00 | Honvéd Kulturális Központ | 193593 / 1458200 |
| 2026-12-07 20:30 | Honvéd Kulturális Központ | 193593 / 1458201 |
| 2026-12-14 18:00 | Kőrösi Csoma Sándor Kőbányai Kult.Közp. | 193616 / 1458384 |
| 2026-12-14 20:30 | Kőrösi Csoma Sándor Kőbányai Kult.Közp. | 193616 / 1458385 |
| 2026-12-21 19:30 | Corvin Dumaszínház | 183958 / 1501273 |

Az egyenként kiolvasott teljes jegylinkek a `probe-results.json` fájlban vannak.

Mind a 11 esetben `available_tickets: 0` volt a Dumaszínház adata. A Jegy.hu mindegyik oldala ezt írta: „A jegyvásárlás pillanatnyilag nem elérhető”. Nem kaptunk nézőtér-azonosítót. Ebből nem következik lekért, igazolt nulla szabad ülőhely: a próba `availability: "unknown"`, `freeSeats: null` eredményt ad. Nem próbál helyszínből nézőtér-azonosítót találgatni.

## Státuszkódok és kontrollpróba

Elsődleges forrás: https://dumaszinhaz.jegy.hu/resources/js/auditview/HTML5Audit.js

A `Consts.statusIds` szerint:

| Kód | Forrásbeli név | Jelentés |
| --- | --- | --- |
| 0 | empty | Szabad hely |
| 1 | selected | A munkamenetben kiválasztott hely; nem számít szabadnak |
| 2 | occupied | Nem elérhető/foglalt hely; ebből nem különíthető el az eladott és ideiglenesen foglalt jegy |
| más vagy hiányzik | nincs igazolva | Nem tekinthető szabadnak |

A kód külön ellenőrzi a 0 állapotot a kiválasztás előtt. A szkript ebből a kódból semmit nem futtat, csak a GET-végpontokat használja:

- nézőtér: `/auditview/audit/{netaudit_id}`;
- készlet: `/auditview/update?audit_id=...&event_id=...&program_id=...&no_sectors=...&initial_data=1`.

A készlet `ticketInitialInfos` mezője helyazonosítónként tartalmazza a `status`, `ticket_id`, `price` adatokat. A próba csak ismert nézőtéri helyet, szigorúan numerikus 0 státuszt, pozitív jegyazonosítót és árat számol. Hibát vagy hiányzó adatot nem alakít nullás készletté.

Kontroll: https://dumaszinhaz.jegy.hu/program/mit-nem-mondok-kiss-adam-onallo-estje-musorvezeto-toth-edu-197449/1470029

- Nézőtér: 13270; program: 197449; előadás: 1470029.
- 255 ülőhelyhez kaptunk állapotot: 45 szabad, 210 nem elérhető, ismeretlen kód nélkül.
- Minden készletbeli hely szerepelt a nézőtérben.
- A 45 szabad hely egyezett a Dumaszínház 45-ös adatával.
- Hat asztalhoz tartozott legalább két szabad hely. Például a 49. asztal 3-as és 4-es helye: 47329 és 47328.

## Helypárok és korlátok

A nézőtér `snapshot.s` szektorokat, bennük `r` sorokat és `s` székeket tartalmaz, helyazonosítókkal, feliratokkal és koordinátákkal. A Corvinban az asztal a feliratozott szektor (például „49. asztal”), így az azonos asztal két szabad helye felismerhető. A belső sorazonosító itt akár székenként eltérhet, tehát nem használható általános asztalazonosítóként.

Sorosan ültetett nézőtérben a Jegy.hu saját kódja szektor, sor és `seatOrderList` szerinti szomszédokat vizsgál. A nézőtér geometriai adatai segíthetnek a folyosók ellenőrzésében. A Bödőcs-előadások ilyen nézőtereit most nem kaptuk meg, ezért a közvetlen szomszédosság nincs igazolva. A szkript `adjacentSeats: "unknown"` értéket ad; az egymást követő székszám nem automatikusan pozitív találat.

A szabad státusz pillanatfelvétel. Speciális helyek, kedvezményfeltételek, biztonsági szabályok vagy a magányos szék tiltása még befolyásolhatja a megvásárolható helypárt. Foglalással nem ellenőriztük, és nem is ellenőrizzük. A belső API nem dokumentált stabil szolgáltatás.

## Következő lépés

A HTTP-alapú figyelő alapjának fejlesztése elkezdhető. Az asztalos feldolgozás kontrollal igazolt; a tényleges Bödőcs-készlet és a soros szomszédosság csak akkor igazolható, ha egy célzott előadás nézőtere ismét elérhető. Addig nincs pozitív jegyértesítési feltétel. Nem használtunk böngészőautomatizálást, foglalást, vásárlást vagy hozzáférésvédelem-megkerülést.
