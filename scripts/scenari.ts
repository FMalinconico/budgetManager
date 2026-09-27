/**
 * Stampa gli scenari di calcolo con la configurazione predefinita, usando il
 * modulo di dominio vero: serve a vedere che i numeri tornano.
 *
 *   npm run scenari
 */
import { calcolaRipartizione, configurazionePredefinita } from '../src/dominio/configurazione.ts'
import { NOME_CONTO } from '../src/dominio/conti.ts'
import { euro, formattaEuro, formattaPercentuale, type Centesimi } from '../src/dominio/denaro.ts'
import {
  calcolaChiusura,
  calcolaTranche1,
  calcolaTranche1Accorpata,
  calcolaTranche2,
  calcolaTranche2Accorpata,
  parametriDaConfigurazione,
  verificaFineCiclo,
  type Bonifico,
  type Esito,
  type InputTranche1,
  type InputTranche2,
} from '../src/dominio/giroconti.ts'

const configurazione = configurazionePredefinita()
const r = calcolaRipartizione(configurazione)
const p = parametriDaConfigurazione(configurazione)

const eur = (c: Centesimi) => formattaEuro(c).replace(' ', ' ')
const variazione = (c: Centesimi) => formattaEuro(c, { segno: true }).replace(' ', ' ')
const colonna = (testo: string, larghezza: number) => testo.padEnd(larghezza)
const importo = (c: Centesimi) => eur(c).padStart(12)

function riga(etichetta: string, valore: string, nota = '') {
  console.log(`  ${colonna(etichetta, 26)}${valore.padStart(12)}${nota ? `   ${nota}` : ''}`)
}

function stampaBonifici(bonifici: readonly Bonifico[], bloccato = false) {
  for (const b of bonifici) {
    const tratta = `${b.numero}. ${NOME_CONTO[b.da]} → ${NOME_CONTO[b.a]}`
    const valore = b.necessario ? importo(b.importo) : (bloccato ? '—' : '(non serve)').padStart(12)
    console.log(`    ${colonna(tratta, 30)}${valore}`)
  }
}

const SIMBOLO: Record<Esito['gravita'], string> = { bloccante: '⛔', attenzione: '⚠️ ', info: 'ℹ️ ', ok: '✅' }

function stampaEsiti(esiti: readonly Esito[]) {
  for (const e of esiti) console.log(`    ${SIMBOLO[e.gravita]} ${e.titolo} — ${e.messaggio}`)
}

function titolo(testo: string) {
  console.log(`\n${testo}\n${'─'.repeat(testo.length)}`)
}

function cicloStandard(nome: string, input1: InputTranche1, input2: Omit<InputTranche2, 'saldoING'>) {
  titolo(nome)
  const t1 = calcolaTranche1(input1, p)
  console.log(
    `  Tranche 1 — Buddybank ${eur(input1.saldoBuddybank)} · Intesa Frank ${eur(input1.saldoIntesaFrank)}` +
      ` · residuo sfizi ${eur(input1.residuoSfiziFrank)} · ING ${input1.saldoING == null ? 'n.d.' : eur(input1.saldoING)}`,
  )
  stampaBonifici(t1.bonifici, t1.bloccato)
  stampaEsiti(t1.esiti)
  if (t1.bloccato) {
    console.log('    → Piano standard bloccato.')
    return
  }
  console.log(`    Resta su Buddybank ${eur(t1.restaSuBuddybank)} · variazione netta ING ${variazione(t1.variazioneNettaING)}`)

  const t2 = calcolaTranche2({ ...input2, saldoING: t1.saldoINGDopo }, p)
  console.log(`  Tranche 2 — Intesa MG ${eur(input2.saldoIntesaMG)} · residuo sfizi ${eur(input2.residuoSfiziMG)}`)
  stampaBonifici(t2.bonifici, t2.bloccato)
  stampaEsiti(t2.esiti)
  if (t2.bloccato) {
    console.log('    → Tranche 2 bloccata.')
    return
  }
  console.log(`    Resta su Intesa MG ${eur(t2.restaSuIntesaMG)} · variazione netta ING ${variazione(t2.variazioneNettaING)}`)

  const verifica = verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, p)
  console.log(`  Fine ciclo — ING ${variazione(verifica.totale)} (target ${variazione(verifica.target)})`)
  stampaEsiti([verifica.esito])
}

titolo('Ripartizione predefinita')
riga('Entrate mensili', eur(r.entrateTotali))
riga(`Casa (${formattaPercentuale(configurazione.percentuali.casa)})`, eur(r.casa), `${eur(r.trasferimentoCasa)} su Intesa Frank + ${eur(r.speseFisseING)} di mutuo su ING`)
riga(`Risparmio (${formattaPercentuale(configurazione.percentuali.risparmio)})`, eur(r.risparmio))
riga(`Sfizi Frank (${formattaPercentuale(configurazione.percentuali.sfiziFrank)})`, eur(r.sfiziFrank))
riga(`Sfizi MG (${formattaPercentuale(configurazione.percentuali.sfiziMG)})`, eur(r.sfiziMG))
riga('Spese fisse', eur(r.speseFisseTotali), `${eur(r.speseFisseING)} su ING + ${eur(r.speseFisseIntesaFrank)} su Intesa Frank`)
riga('Margine spese variabili', eur(r.margineVariabili), 'su Intesa Frank')
riga('Target ING per ciclo', variazione(r.targetING), `${eur(r.speseFisseING)} mutuo + ${eur(r.risparmio)} risparmio`)
riga('Soglia intoccabile ING', eur(r.sogliaING))

cicloStandard(
  '1. Caso standard',
  { saldoBuddybank: euro(900), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0, saldoING: euro(3000) },
  { saldoIntesaMG: euro(600), residuoSfiziMG: 0 },
)
cicloStandard(
  '2. Stipendi più alti del previsto (+200 €)',
  { saldoBuddybank: euro(1000), saldoIntesaFrank: euro(750), residuoSfiziFrank: 0, saldoING: euro(3000) },
  { saldoIntesaMG: euro(650), residuoSfiziMG: 0 },
)
cicloStandard(
  '3. Stipendi più bassi del previsto (−200 €)',
  { saldoBuddybank: euro(850), saldoIntesaFrank: euro(600), residuoSfiziFrank: 0, saldoING: euro(3000) },
  { saldoIntesaMG: euro(550), residuoSfiziMG: 0 },
)
cicloStandard(
  '4. Bonifico 2 sotto 1.213 € (ING finanzia la casa)',
  { saldoBuddybank: euro(700), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0, saldoING: euro(3000) },
  { saldoIntesaMG: euro(600), residuoSfiziMG: 0 },
)
cicloStandard(
  '5. Residui sfizi dal ciclo precedente (Frank 45,30 €, MG 20,00 €)',
  { saldoBuddybank: euro(945.3), saldoIntesaFrank: euro(700), residuoSfiziFrank: euro(45.3), saldoING: euro(3000) },
  { saldoIntesaMG: euro(620), residuoSfiziMG: euro(20) },
)

const inputBasso = { saldoBuddybank: euro(500), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0, saldoING: euro(3000) }
cicloStandard('6. Bonifico 2 sotto 1.000 € → piano standard bloccato', inputBasso, { saldoIntesaMG: euro(600), residuoSfiziMG: 0 })
titolo('6b. Stesso caso con il piano accorpato')
const a1 = calcolaTranche1Accorpata(inputBasso, p)
console.log('  Tranche 1')
stampaBonifici(a1.bonifici)
console.log(`    Bonifico 2 rinviato: ${eur(a1.importoDifferito)} restano fermi su Buddybank · variazione netta ING ${variazione(a1.variazioneNettaING)}`)
stampaEsiti(a1.esiti)
const a2 = calcolaTranche2Accorpata(
  {
    saldoIntesaMG: euro(600),
    residuoSfiziMG: 0,
    saldoING: a1.saldoINGDopo,
    saldoBuddybank: a1.restaSuBuddybank,
    importoDifferito: a1.importoDifferito,
    anticipoCasa: a1.bonifici[1].importo,
  },
  p,
)
console.log('  Tranche 2')
stampaBonifici(a2.bonifici)
console.log(`    Variazione netta ING ${variazione(a2.variazioneNettaING)}`)
stampaEsiti(a2.esiti)
const verificaAccorpata = verificaFineCiclo(a1.variazioneNettaING, a2.variazioneNettaING, p)
console.log(`  Fine ciclo — ING ${variazione(verificaAccorpata.totale)} (target ${variazione(verificaAccorpata.target)})`)
stampaEsiti([verificaAccorpata.esito])

cicloStandard(
  '7. Saldi insufficienti (stipendio non ancora arrivato)',
  { saldoBuddybank: euro(60), saldoIntesaFrank: euro(40), residuoSfiziFrank: 0, saldoING: euro(3000) },
  { saldoIntesaMG: euro(600), residuoSfiziMG: 0 },
)
cicloStandard(
  '8. Arrotondamenti al centesimo',
  { saldoBuddybank: euro(1234.57), saldoIntesaFrank: euro(678.91), residuoSfiziFrank: euro(12.34), saldoING: euro(2500.01) },
  { saldoIntesaMG: euro(612.49), residuoSfiziMG: euro(3.33) },
)

for (const [nome, saldoIntesaFrank] of [
  ['9. Chiusura con avanzo sul conto casa', euro(85.4)],
  ['10. Chiusura con sforamento del conto casa', -euro(30)],
] as const) {
  titolo(nome)
  const c = calcolaChiusura({ saldoING: euro(4000), saldoIntesaFrank, saldoBuddybank: euro(23.5), saldoIntesaMG: euro(41.2) }, p)
  console.log(`  Saldi finali — ING ${eur(euro(4000))} · Intesa Frank ${eur(saldoIntesaFrank)} · Buddybank ${eur(euro(23.5))} · Intesa MG ${eur(euro(41.2))}`)
  stampaBonifici(c.bonifici)
  console.log(`    Residui per il ciclo dopo: Frank ${eur(c.residuoSfiziFrank)} · MG ${eur(c.residuoSfiziMG)} · risparmio reale ${eur(c.risparmioReale)}`)
  stampaEsiti(c.esiti)
}
console.log('')
