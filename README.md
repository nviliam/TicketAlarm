# TicketALarm

Node.js 24 + TypeScript. Kézzel indítható jegyellenőrzés és Gmail-értesítés, valamint előkészített, körülbelül ötpercenként futó GitHub Actions workflow. A felhőbeli működés a lenti kézi feltöltés és beállítás után indul.

## Értesítési csatornák

Az e-mail az egyetlen bekötött csatorna. Viberhez 2026. október 31-én nem érhető el az igénynek megfelelő hivatalos, ingyenes új bot: az új botok kereskedelmi feltételűek, az önállóan kezdeményezett üzenetek fizetősek. Nem használunk fizetős szolgáltatást, nem hivatalos Viber-automatizálást vagy más üzenetküldő csatornát.

Források: [Viber API](https://developers.viber.com/docs/api/rest-bot-api/), [Viber kereskedelmi feltételek](https://help.viber.com/hc/en-us/articles/15247629658525-Bot-commercial-model).

## Gmail beállítása

1. Telepítsd a függőségeket: `npm.cmd install`.
2. Másold a `.env.example` fájlt `.env` néven.
3. Állítsd be a feladó Gmail-címét (`GMAIL_USER`), a Google alkalmazásjelszót (`GMAIL_APP_PASSWORD`) és a címzetteket (`NOTIFY_EMAIL`). Egy cím és vesszővel elválasztott több cím is használható: `NOTIFY_EMAIL=elso@gmail.com,masodik@gmail.com`. A címek körüli szóközöket eltávolítjuk, az azonos címeket egyszer szerepeltetjük. A feladó és címzett lehet ugyanaz. Minden címzett ugyanazt a levelet kapja, és a Címzett mezőben látják egymás címét. Hibás vagy üres listaelem esetén a küldés leáll.

Az értesítést csak akkor mentjük sikeresen elküldöttként, ha az SMTP-kiszolgáló minden címzettet elfogadott. Részleges elutasítás után az újrapróbálás a korábban elfogadott címzetteknél ismétlést okozhat.

Az alkalmazásjelszóhoz kétlépcsős azonosítás kell; egyes fiókokban nem érhető el. [Google útmutató](https://support.google.com/accounts/answer/185833). Ne a rendes Google-jelszavadat használd. A jelszót helyben írd be, ne küldd el chatben. A `.env` Git által kizárt fájl.

## Ellenőrzés és küldés

### Külön Gmail SMTP-teszt

A `.env` kitöltése után kézzel indítható, jegyadatok nélkül:

```powershell
npm.cmd run smtp:test
```

Ez valódi „TicketAlarm – Teszt értesítés” tárgyú e-mailt küld a `NOTIFY_EMAIL` összes címzettjének. A konzol jelzi a sikeres SMTP-elfogadást vagy a hiba jellegét; alkalmazásjelszót és nyers SMTP-hibát nem naplóz. A teszt nem olvassa vagy módosítja a jegyfigyelő állapotát. A sikeres SMTP-elfogadás után a postaládában (és a Spam mappában) ellenőrizd a kézbesítést.

A levél táblázatos, inline CSS-t használó HTML-sablonnal és egyszerű szöveges alternatívával készül. A tesztlevélben jól látható **TESZT ÉRTESÍTÉS · MINTAADATOK** felirat van: nem állít tényleges jegyelérhetőséget. Az éles értesítés címe a `probe.ts` által lekért `program.name` adatból származik; a helyszín, dátum, időpont és Jegy.hu-link szintén az aktuális adatokból kerül be. Régi, címet még nem tartalmazó pillanatképnél kifejezetten jelezzük a cím hiányát, nem helyettesítjük mintacímmel. A dinamikus HTML-szöveg escape-elt, a gomb csak ellenőrzött HTTPS-es Dumaszínház/Jegy.hu előadáslinket fogad el. A sablonfrissítés önmagában nem változtatja meg az értesítés lenyomatát, ezért nem okoz újraküldést.

```powershell
node probe.ts
node notify.ts
```

A második parancs csak előnézetet ad. Tényleges küldés:

```powershell
node --env-file=.env notify.ts --send
```

Mindig az új `probe.ts` futás után indítsd. A rendszer 10 percnél régebbi, jövőbeli vagy ismeretlen állapotú ülőhelyadatból nem küld értesítést. A `--control` próba kimenetét nem használja levélküldésre. Egyik parancs sem foglal vagy vásárol jegyet.

Legalább két, ülőhelyadatokból igazolt szabad hely szükséges. Előnyben részesítjük az azonos asztalhoz tartozó helyeket. Ha csak két különálló hely igazolt, az eredeti „lehetőleg egymás mellett” feltételnek megfelelően erről is küldhet levelet, de egyértelműen jelzi, hogy a szomszédosság nem igazolt. A puszta Dumaszínház-összesítés nem elegendő: asztalcsoport vagy egyenként azonosított szabad helyek kellenek. A levél tartalmazza a közzétett budapesti dátumot és időpontot, helyszínt, a legalább két szabad hely megerősítését és a közvetlen jegylinket. Az elérhetőség pillanatfelvétel, a vásárlási siker nem garantált.

## Ismétlődések kiszűrése

A `.ticketalarm/notifications.json` előadásonként megőrzi az utoljára sikeresen elküldött megfelelő helycsoport lenyomatát. A sorrend és az ellenőrzés időpontja nem okoz új levelet; a megfelelő szabad helyek megváltozása igen. Ismeretlen adat nem törli az előzményt. Ugyanaz a legutóbb jelzett helycsoport egy átmeneti eltűnés után sem küld új levelet. Sikertelen SMTP-küldést következő alkalommal újrapróbál.

Párhuzamos küldést egy zárolás akadályoz. A zárolt vagy sérült állapot leállítja a küldést. Ha a folyamat erőszakosan megszakad, a `.ticketalarm/notifications.lock` megmaradhat: csak akkor töröld kézzel, ha biztosan nincs futó küldés. SMTP-elfogadás és az állapot mentése közötti összeomlásnál ritkán előfordulhat ismétlés; SMTP-vel nincs teljes, tranzakciós egyszeri kézbesítési garancia.

Helyi futtatáskor a `.ticketalarm` könyvtárat két futás között meg kell őrizni. GitHub Actions alatt a tartós állapot külön `ticketalarm-state` Git-ágon van, csak egy `notifications.json` fájlban. Nincs adatbázis, lejáró cache vagy artifact. Az ág kizárólag előadásazonosítókat és értesítési lenyomatokat tartalmaz; e-mail-címeket, jelszavakat és teljes leveleket nem.

## Ingyenes GitHub Actions telepítés

### 1. Nyilvános repozitórium létrehozása

Jelentkezz be egy ingyenes GitHub-fiókkal, majd a **+ → New repository** menüben:

- Repository name: `TicketAlarm`.
- Visibility: **Public**. A nyilvános kód bárki számára olvasható, a Secrets értékek nem nyilvánosak.
- Ne jelöld be az automatikus README-, .gitignore- és licenclétrehozást: üres repozitórium kell.
- Kattints a **Create repository** gombra.

A workflow standard `ubuntu-latest` futtatót használ, amely nyilvános repóknál ingyenes. Privát repót ehhez a folyamatos ötperces futáshoz ne válassz, annak kerete korlátos. Nem használunk fizetős nagy futtatót vagy további szolgáltatást. [GitHub díjazás](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

### 2. A helyi projekt feltöltése

A projektmappában PowerShellből futtasd az alábbiakat. A `SAJAT_FELHASZNALONEV` helyére a GitHub-felhasználóneved kerüljön. Ezeket a parancsokat az előkészítés során nem futtattuk.

```powershell
git init -b main
git add .gitignore .env.example .github README.md RESEARCH.md package.json package-lock.json tsconfig.json
git add probe.ts notify.ts notifications.ts email.ts email-template.ts smtp-test.ts notifications.test.ts remote-state.ts remote-state.test.ts
git check-ignore .env
git diff --cached --name-only
```

A `git check-ignore .env` kimenete `.env` legyen. A feltöltendő fájlok listájában nem szerepelhet `.env`, `.env.*` (a sablon `.env.example` kivételével), `.ticketalarm`, jelszó vagy privát kulcs. A tesztek ideiglenes Git-repóval is ellenőrzik a kizárást. A `.gitignore` nem véd a szándékos `git add -f` ellen, és korábban már követett titkos fájlt sem távolít el az előzményekből.

Ha a lista megfelelő:

```powershell
git commit -m "Prepare TicketAlarm GitHub Actions monitor"
git remote add origin https://github.com/SAJAT_FELHASZNALONEV/TicketAlarm.git
git push -u origin main
```

A GitHub a belépésedet kérheti a feltöltéshez. A Gmail alkalmazásjelszavát ehhez ne használd.

### 3. Secrets beállítása

A GitHub repozitóriumban: **Settings → Secrets and variables → Actions → New repository secret**. Hozd létre külön-külön:

| Secret neve | Értéke |
| --- | --- |
| `GMAIL_USER` | A küldő Gmail-fiók címe |
| `GMAIL_APP_PASSWORD` | A már tesztelt Google alkalmazásjelszó |
| `NOTIFY_EMAIL` | Egy cím vagy vesszővel elválasztott címek, például `elso@gmail.com,masodik@gmail.com` |

Csak az értéket másold be, ne a `VÁLTOZÓ=` előtagot. Ezek **Secrets**, nem sima Variables bejegyzések. A workflow csak az értesítési lépéshez adja át őket környezeti változóként. Nem olvas vagy készít `.env` fájlt. Saját GitHub-token nem szükséges: az állapotág írásához a GitHub által adott `GITHUB_TOKEN` szolgál.

### 4. A figyelő aktiválása

1. **Settings → Actions → General** alatt engedélyezd az Actions futtatását és a GitHub saját `actions/checkout`, `actions/setup-node` actionjeit, ha még tiltva lennének.
2. Az állapotág mentéséhez írás kell. A workflow `permissions: contents: write` beállítást tartalmaz. Ha a beállításaid külön korlátozzák, a **Workflow permissions → Read and write permissions** opciót válaszd és mentsd. Olyan rulesetet ne állíts be a `ticketalarm-state` ágra, amely tiltja a bot közvetlen írását. A `main` ág lehet védett.
3. Nyisd meg az **Actions → TicketAlarm → Run workflow** menüt, válaszd a **main** ágat, és indítsd el egyszer. Ez már küldhet valódi levelet, ha van megfelelő találat; nem küld SMTP-tesztüzenetet.
4. Nézd meg a futás lépéseit. Az első sikeres állapotbetöltés létrehozza a `ticketalarm-state` ágat. A `Notify by Gmail` lépés találat híján ezt jelzi, és nem küld levelet.
5. Ezután a `main` alapértelmezett ágon lévő workflow `*/5 * * * *` ütemezése automatikusan fut, a géped kikapcsolt állapotában is. Nincs külön szerverindítás. A feltöltés után az ütemezés már a kézi próba előtt is elindulhat; a Secrets-ek beállításáig a küldési lépés leáll.

Más ágról indított manuális futást a workflow kihagy. Az ütemezett és manuális futások közös concurrency-csoportban vannak, `cancel-in-progress: false` beállítással: egy futás dolgozhat egyszerre, az új nem szakítja meg a folyamatban lévő küldést. A függőben lévő futások közül a GitHub lecserélheti a régebbit; ezek nem kezdenek el küldeni. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

### 5. Állapotmegőrzés és működési korlátok

Minden futás előbb visszatölti és ellenőrzi a `ticketalarm-state` ágat. Ha az olvasás, hitelesítés vagy állapotellenőrzés hibázik, nem jut el a levélküldésig. Minden sikeresen elfogadott levél után rögtön menti és feltölti az állapotot, mielőtt a következő előadással folytatná. Egy záró lépés hiba után is újrapróbálja az állapotmentést. Csak változás esetén készül új commit. A Git-ágat ne töröld: elvesztése megszünteti a korábbi értesítések emlékezetét.

Az `UNKNOWN`/`unknown` állapot nem küld pozitív értesítést, és nem törli a korábbi lenyomatot. A helyi zárolás megmaradt. Helyi és GitHub-futtatást ne használj egyszerre éles levélküldésre, mert külön állapotuk lehet. A már meglévő helyi előzmények migrálásához az első aktiválás előtt külön át kell vinni az állapotot; a `.ticketalarm` fájlokat nem töltjük fel a forráskóddal.

SMTP-küldés és Git-mentés nem alkot közös tranzakciót. Ha elfogadott levél után a futtató összeomlik, vagy az állapot push-a tartósan meghiúsul, a következő futás ismételhet. Párhuzamos Actions-futások nem okoznak ismétlést; teljes egyszeri kézbesítési garancia SMTP mellett nincs. Részleges címzettelutasításnál is előfordulhat újraküldés a korábban elfogadott címeknek.

Az öt perc célzott ütemezés, nem garantált pontosság: a GitHub késleltetheti vagy kihagyhatja a futásokat. Nyilvános repónál 60 nap aktivitáshiány után az ütemezés kikapcsolhat; az Actions lapon újra engedélyezhető. Ha hosszú ideig nincs állapotváltozás vagy kódmódosítás, ezt ellenőrizd. [GitHub ütemezés](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Leállítás: **Actions → TicketAlarm → ⋯ → Disable workflow**. Ha egy futás már folyamatban van, szükség esetén azt külön állítsd le.

## Ellenőrzések

```powershell
npm.cmd test
npm.cmd run typecheck
```

A tesztek helyettesített küldőt használnak, nem küldenek valódi e-mailt. A tényleges Gmail-kézbesítés a saját beállításaid megadása után ellenőrizhető.

A jegyadatok részletes felderítése: [RESEARCH.md](RESEARCH.md).
