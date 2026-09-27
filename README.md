# Budget Famiglia

Web app per il budget familiare di Frank e MG. Non è un'app generica di finanza
personale: implementa una regola di ripartizione già decisa (75 / 15 / 5 / 5) e
dice ogni mese **quali bonifici fare e di quanto**.

Stack: React + TypeScript + Vite, Tailwind, Vitest. Nessun backend: i dati
restano sul dispositivo (`localStorage`).

## Comandi

```bash
npm install
npm test          # test unitari del modulo di calcolo
npm run scenari   # stampa gli scenari di calcolo con la configurazione predefinita
npm run dev       # server di sviluppo
npm run build     # typecheck + build di produzione
```

`npm run scenari` esegue direttamente `scripts/scenari.ts`, quindi richiede
Node ≥ 22.18.

## Stato

- [x] Scaffolding (React 19, Vite 8, TypeScript 6, Tailwind 4, Vitest 5)
- [x] Modulo di calcolo dei giroconti con test
- [ ] Schermata dei giroconti
- [ ] Cruscotto, spese per categoria, storico, impostazioni, PWA

## Struttura

```
src/dominio/          logica pura, senza UI né storage
  denaro.ts           importi in centesimi interi, parsing e formato italiano
  conti.ts            i quattro conti
  configurazione.ts   valori predefiniti, ripartizione e validazione
  giroconti.ts        tranche 1 e 2, piano accorpato, verifica e chiusura del ciclo
scripts/scenari.ts    report leggibile degli scenari principali
```

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
