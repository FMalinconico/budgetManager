# Budget Famiglia

Web app per il budget familiare di Frank e MG. Non è un'app generica di finanza
personale: implementa una regola di ripartizione già decisa (75 / 15 / 5 / 5) e
dice ogni mese **quali bonifici fare e di quanto**.

Stack: React + TypeScript + Vite, Tailwind, Vitest. Nessun backend: i dati
restano sul dispositivo (`localStorage`).

## Comandi

```bash
npm install
npm test          # test unitari (calcolo e avanzamento del ciclo)
npm run scenari   # stampa gli scenari di calcolo con la configurazione predefinita
npm run dev       # server di sviluppo
npm run build     # typecheck + build di produzione
```

`npm run scenari` esegue direttamente `scripts/scenari.ts`, quindi richiede
Node ≥ 22.18.

Per provarla dal telefono sulla stessa rete Wi-Fi: `npm run dev -- --host` e
apri dal telefono l'indirizzo "Network" che compare. In http la copia degli
importi usa un metodo di riserva, quindi funziona anche senza https.

## Stato

- [x] Scaffolding (React 19, Vite 8, TypeScript 6, Tailwind 4, Vitest 5)
- [x] Modulo di calcolo dei giroconti con test
- [x] Schermata dei giroconti
- [ ] Cruscotto, spese per categoria, storico, impostazioni, export/import, PWA

## Struttura

```
src/dominio/          logica pura, senza UI né storage
  denaro.ts           importi in centesimi interi, parsing e formato italiano
  conti.ts            i quattro conti
  configurazione.ts   valori predefiniti, ripartizione e validazione
  giroconti.ts        tranche 1 e 2, piano accorpato, verifica e chiusura del ciclo
src/stato/            stato dell'app, anch'esso in funzioni pure testate
  modello.ts          forma dei dati salvati (versionata)
  ciclo.ts            avanzamento del ciclo: bozze, segni, completamento, chiusura
  persistenza.ts      salvataggio in localStorage e verifica della forma dei dati
src/ui/               componenti riutilizzabili (campo importo, scheda bonifico, …)
src/schermate/        le schermate; per ora quella dei giroconti
scripts/scenari.ts    report leggibile degli scenari principali
deploy/pubblica.sh    pubblicazione su un server Linux con Apache
```

## Pubblicazione sul server

`deploy/pubblica.sh` pubblica l'app su un server Linux con Apache. L'app è
fatta solo di file statici: Apache la serve su una porta tutta sua, e i saldi
restano nel browser di chi la usa, non sul server.

Cosa serve:

- sul computer da cui pubblichi: Node.js 20.19 o successivo (22.12+ per la
  serie 22), npm, rsync e ssh;
- sul server: Apache (`apache2` su Debian e Ubuntu, `httpd` su Red Hat, Fedora
  e simili), rsync e un utente SSH che può usare sudo.

La prima volta:

```bash
cp deploy/pubblica.conf.esempio deploy/pubblica.conf   # indica il server in SERVER
deploy/pubblica.sh --prova                             # facoltativo: mostra cosa farebbe
deploy/pubblica.sh
```

Lo script chiede su quale porta servire l'app (rifiuta quelle già occupate) e,
con sudo, crea la cartella `/var/www/budget-famiglia`, aggiunge ad Apache un
sito dedicato su quella porta, lo attiva e ricarica Apache. Se Apache rifiuta
la nuova configurazione, rimette quella di prima. Se sul server è attivo un
firewall (ufw o firewalld), indica il comando per aprire la porta.

Le volte successive `deploy/pubblica.sh` esegue i test, compila l'app e copia i
file (prima quelli nuovi, poi `index.html`, infine toglie quelli vecchi); alla
fine controlla che `http://server:porta/versione.txt` risponda con la versione
appena pubblicata e stampa l'indirizzo da aprire sul telefono.

### Installazione con curl, direttamente sul server

Senza copiare niente a mano: entra nel server con SSH, con un utente che può
usare sudo, e lancia un solo comando. `deploy/installa.sh` scarica i sorgenti in
`~/budget-famiglia`, controlla che ci siano Node.js 20.19+ e rsync (se mancano
propone di installarli), poi esegue `deploy/pubblica.sh` sulla macchina stessa:
la prima volta chiede la porta e configura Apache.

Con il repository pubblico (anche solo per il tempo dell'installazione):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/FMalinconico/budgetManager/HEAD/deploy/installa.sh)
```

Con il repository privato serve un token GitHub in sola lettura: su GitHub,
Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token; in "Repository access" scegli solo `budgetManager` e in
"Permissions" dai "Contents: Read-only". Poi:

```bash
read -rsp "Token GitHub: " GITHUB_TOKEN && echo && export GITHUB_TOKEN && bash <(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw+json" https://api.github.com/repos/FMalinconico/budgetManager/contents/deploy/installa.sh)
```

Per aggiornare l'app dopo nuove modifiche basta rilanciare lo stesso comando.
Le opzioni di `deploy/pubblica.sh` vanno in fondo, dopo la parentesi: per
esempio `bash <(curl …) --installa` per cambiare porta.

### Altre opzioni

- Per cambiare porta: `deploy/pubblica.sh --installa`.
- Senza domande (per esempio da un altro script): `PORTA=8080 deploy/pubblica.sh`.
- Direttamente sul server, se lì c'è Node.js: con `SERVER=""` lo script lavora in
  locale.
- La cartella di destinazione deve essere dedicata all'app: lo script si rifiuta
  di pubblicare in una cartella non vuota che non ha mai usato, salvo `--forza`.

L'app si apre in http semplice e funziona così, compresa la copia degli
importi. Per installarla come PWA servirà https, cioè un dominio con un
certificato. Chi raggiunge la porta vede l'app: non i vostri saldi, che restano
nel browser, ma sì gli importi predefiniti come stipendi e mutui. Se il server è
raggiungibile da internet conviene aprire la porta solo sulla rete di casa o
proteggerla con una password.

## La schermata dei giroconti

Il ciclo va avanti in tre passi: **tranche 1** (stipendio di Frank),
**tranche 2** (stipendio di MG) e **chiusura** a fine mese.

- I bonifici compaiono man mano che inserisci i saldi, in ordine e con il
  prossimo da fare evidenziato. **Un tap sull'importo lo copia** nel formato da
  incollare nell'app della banca (`1490,00`).
- Ogni bonifico ha la sua casella "Segna come fatto". Al primo segno i saldi di
  quella fase si bloccano, così gli importi non cambiano a metà strada;
  "Modifica i saldi" toglie i segni. Quando tutti i bonifici di una tranche
  sono segnati, la tranche è completata e i saldi registrati vengono aggiornati
  con quelli dopo i bonifici.
- Tutto viene salvato sul dispositivo a ogni modifica: si può passare all'app
  della banca e tornare anche se il browser ricarica la pagina.
- Un piano bloccato (regola dei 1.000 €, soglia di ING, saldi insufficienti)
  resta visibile ma non si può eseguire: gli importi non si copiano e le
  caselle sono disabilitate. Per la regola dei 1.000 € si può passare al piano
  accorpato con un tap.
- Dopo la tranche 2 compare la verifica di fine ciclo (variazione netta di ING
  contro il target). In chiusura si inseriscono i saldi reali: l'app propone il
  giroconto dell'avanzo di casa o la copertura di uno sforamento, archivia il
  ciclo e ne avvia uno nuovo con i residui sfizi già inseriti.
- "La casa ha sforato?" copre uno sforamento durante il ciclo, sempre da ING.
- Il ciclo in corso usa i parametri fissati al suo avvio: se in futuro cambia la
  configurazione, vale dal ciclo successivo.

## Numeri di riferimento

Con la configurazione predefinita (entrate 2.200 €, spese fisse 808 €):

| Voce | Importo |
|---|---:|
| Casa (75%) | 1.650,00 € = 1.213,00 su Intesa Frank + 437,00 di mutuo su ING |
| Risparmio (15%) | 330,00 € |
| Sfizi Frank / MG (5% + 5%) | 110,00 € + 110,00 € |
| Margine spese variabili su Intesa Frank | 842,00 € |
| Target ING per ciclo | +767,00 € |
| Soglia intoccabile ING | 437,00 € |

Ciclo standard: tranche 1 → 700 / 1.490 / 1.213 € (ING +277 €), tranche 2 →
490 € (ING +490 €), totale +767 € sul target.

## Come sono state interpretate le regole

Dove la specifica lasciava margine, il modulo fa queste scelte (tutte coperte
dai test):

- **Importi e percentuali sono interi** (centesimi e punti base). Le quote casa
  e sfizi si arrotondano al centesimo; il risparmio assorbe i centesimi di
  differenza, così le quote sommano sempre alle entrate.
- Le quote (110 €, 1.213 €, …) discendono dalle **entrate configurate**; le
  entrate reali di un mese si vedono solo nei bonifici verso ING. Se sono più
  alte l'eccedenza è risparmio in più, se sono più basse su ING arriva meno.
- **Regola 1 (almeno 1.000 € in un'unica transazione)**: si guarda il solo
  bonifico 2 in entrata, non il netto dopo il bonifico 3. Se non basta, il piano
  standard è bloccato e si propone il **piano accorpato**: alla tranche 1 si
  svuota Intesa Frank e ING anticipa i 1.213 € per la casa; il bonifico 2 resta
  fermo su Buddybank e alla tranche 2 parte un solo bonifico Buddybank → ING con
  la quota di Frank più quella di MG (che prima passa da Intesa MG a Buddybank).
  Non si spezza mai il bonifico. L'importo di Frank viene fissato alla tranche 1,
  così gli sfizi spesi nel frattempo restano a carico di Buddybank e non del
  risparmio.
- **Regola 2 (soglia di 437 €)**: il risparmio reale è `saldo ING − 437`. Un
  piano che porterebbe ING sotto la soglia è bloccato; se il risparmio reale
  resta sotto un margine (predefinito 200 €, modificabile) scatta un avviso. In
  chiusura, dove non c'è un piano da bloccare, resta un avviso. Le verifiche su
  ING richiedono il saldo di ING: se manca, l'app lo segnala.
- **Regola 3**: se il bonifico 2 è inferiore al bonifico 3, l'avviso indica di
  quanto ING sta finanziando la casa col risparmio. Nel piano accorpato l'anticipo
  dal risparmio è sempre segnalato.
- **Regola 4**: la quota sfizi si somma al residuo. Un residuo negativo (sfizi
  sforati) riduce la quota del ciclo dopo; se la rendesse negativa il calcolo si
  blocca, perché un bonifico non può lasciare il conto in rosso.
- **Regole 5 e 6**: in chiusura l'avanzo di Intesa Frank va su ING; uno
  sforamento si copre sempre da ING, mai dai conti sfizi. Se Intesa Frank è in
  rosso già alla tranche 1, il bonifico 3 copre anche lo scoperto.
