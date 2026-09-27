import { NOME_CONTO } from './conti.ts'
import {
  CENTO_PER_CENTO,
  euro,
  formattaEuro,
  formattaPercentuale,
  percentualeDi,
  somma,
  type Centesimi,
  type PuntiBase,
} from './denaro.ts'

/** Conti su cui arrivano gli stipendi: il calcolo dei giroconti parte da questi. */
export type ContoEntrata = 'buddybank' | 'intesaFrank' | 'intesaMG'

/** Conti su cui sono addebitate le spese fisse. */
export type ContoSpesaFissa = 'ing' | 'intesaFrank'

export interface Entrata {
  id: string
  nome: string
  importo: Centesimi
  conto: ContoEntrata
}

export interface SpesaFissa {
  id: string
  nome: string
  importo: Centesimi
  conto: ContoSpesaFissa
}

export interface Percentuali {
  casa: PuntiBase
  risparmio: PuntiBase
  sfiziFrank: PuntiBase
  sfiziMG: PuntiBase
}

export interface Configurazione {
  entrate: Entrata[]
  speseFisse: SpesaFissa[]
  percentuali: Percentuali
  /** Su ING deve entrare almeno questo importo in un'unica transazione ogni mese. */
  minimoAccreditoING: Centesimi
  /** Avvisa quando il risparmio reale (saldo ING − soglia) scende sotto questo margine. */
  margineAvvisoSoglia: Centesimi
  fondoEmergenza: {
    obiettivoIntermedio: Centesimi
    obiettivoFinale: Centesimi
  }
}

export function configurazionePredefinita(): Configurazione {
  return {
    entrate: [
      { id: 'stipendio-frank-a', nome: 'Stipendio Frank (parte A)', importo: euro(900), conto: 'buddybank' },
      { id: 'stipendio-frank-b', nome: 'Stipendio Frank (parte B)', importo: euro(700), conto: 'intesaFrank' },
      { id: 'stipendio-mg', nome: 'Stipendio MG', importo: euro(600), conto: 'intesaMG' },
    ],
    speseFisse: [
      { id: 'mutuo-a', nome: 'Mutuo A', importo: euro(437), conto: 'ing' },
      { id: 'mutuo-b', nome: 'Mutuo B', importo: euro(340), conto: 'intesaFrank' },
      { id: 'assicurazione', nome: 'Assicurazione', importo: euro(31), conto: 'intesaFrank' },
    ],
    percentuali: { casa: 7500, risparmio: 1500, sfiziFrank: 500, sfiziMG: 500 },
    minimoAccreditoING: euro(1000),
    margineAvvisoSoglia: euro(200),
    fondoEmergenza: { obiettivoIntermedio: euro(6500), obiettivoFinale: euro(13000) },
  }
}

/** Gli importi mensili che discendono dalla configurazione. */
export interface Ripartizione {
  entrateTotali: Centesimi
  casa: Centesimi
  risparmio: Centesimi
  sfiziFrank: Centesimi
  sfiziMG: Centesimi
  speseFisseING: Centesimi
  speseFisseIntesaFrank: Centesimi
  speseFisseTotali: Centesimi
  /** Da portare su Intesa Frank a inizio ciclo: la quota casa meno le spese fisse che restano su ING. */
  trasferimentoCasa: Centesimi
  /** Quanto resta su Intesa Frank per le spese variabili, tolte le spese fisse addebitate lì. */
  margineVariabili: Centesimi
  /** Variazione netta attesa su ING a ogni ciclo: risparmio + spese fisse che transitano da ING. */
  targetING: Centesimi
  /** Soglia intoccabile su ING: le spese fisse addebitate su ING (il mutuo). */
  sogliaING: Centesimi
}

export function sommaPercentuali(percentuali: Percentuali): PuntiBase {
  return percentuali.casa + percentuali.risparmio + percentuali.sfiziFrank + percentuali.sfiziMG
}

export function calcolaRipartizione(configurazione: Configurazione): Ripartizione {
  const { percentuali } = configurazione
  const entrateTotali = somma(configurazione.entrate.map((e) => e.importo))
  const casa = percentualeDi(entrateTotali, percentuali.casa)
  const sfiziFrank = percentualeDi(entrateTotali, percentuali.sfiziFrank)
  const sfiziMG = percentualeDi(entrateTotali, percentuali.sfiziMG)
  // Il risparmio assorbe i centesimi di arrotondamento: così le quote sommano sempre alle entrate.
  const risparmio = sommaPercentuali(percentuali) === CENTO_PER_CENTO
    ? entrateTotali - casa - sfiziFrank - sfiziMG
    : percentualeDi(entrateTotali, percentuali.risparmio)

  const speseFisseSu = (conto: ContoSpesaFissa) =>
    somma(configurazione.speseFisse.filter((s) => s.conto === conto).map((s) => s.importo))
  const speseFisseING = speseFisseSu('ing')
  const speseFisseIntesaFrank = speseFisseSu('intesaFrank')
  const trasferimentoCasa = casa - speseFisseING

  return {
    entrateTotali,
    casa,
    risparmio,
    sfiziFrank,
    sfiziMG,
    speseFisseING,
    speseFisseIntesaFrank,
    speseFisseTotali: speseFisseING + speseFisseIntesaFrank,
    trasferimentoCasa,
    margineVariabili: trasferimentoCasa - speseFisseIntesaFrank,
    targetING: risparmio + speseFisseING,
    sogliaING: speseFisseING,
  }
}

export interface ProblemaConfigurazione {
  campo: string
  messaggio: string
}

export function validaConfigurazione(configurazione: Configurazione): ProblemaConfigurazione[] {
  const problemi: ProblemaConfigurazione[] = []
  const { percentuali, fondoEmergenza } = configurazione
  const r = calcolaRipartizione(configurazione)

  for (const entrata of configurazione.entrate) {
    if (entrata.importo < 0) {
      problemi.push({ campo: 'entrate', messaggio: `L'entrata "${entrata.nome}" non può essere negativa.` })
    }
  }
  if (r.entrateTotali <= 0) {
    problemi.push({ campo: 'entrate', messaggio: 'Le entrate totali devono essere maggiori di zero.' })
  }

  for (const spesa of configurazione.speseFisse) {
    if (spesa.importo < 0) {
      problemi.push({ campo: 'speseFisse', messaggio: `La spesa fissa "${spesa.nome}" non può essere negativa.` })
    }
  }

  if (Object.values(percentuali).some((p) => p < 0)) {
    problemi.push({ campo: 'percentuali', messaggio: 'Le percentuali non possono essere negative.' })
  }
  const totalePercentuali = sommaPercentuali(percentuali)
  if (totalePercentuali !== CENTO_PER_CENTO) {
    problemi.push({
      campo: 'percentuali',
      messaggio: `Le percentuali devono sommare al 100% (ora ${formattaPercentuale(totalePercentuali)}).`,
    })
  }

  if (r.trasferimentoCasa < 0) {
    problemi.push({
      campo: 'speseFisse',
      messaggio: `Le spese fisse su ${NOME_CONTO.ing} (${formattaEuro(r.speseFisseING)}) superano la quota casa (${formattaEuro(r.casa)}).`,
    })
  } else if (r.margineVariabili < 0) {
    problemi.push({
      campo: 'speseFisse',
      messaggio: `Le spese fisse su ${NOME_CONTO.intesaFrank} (${formattaEuro(r.speseFisseIntesaFrank)}) superano il trasferimento casa (${formattaEuro(r.trasferimentoCasa)}).`,
    })
  }

  if (configurazione.minimoAccreditoING < 0) {
    problemi.push({ campo: 'minimoAccreditoING', messaggio: "Il minimo da accreditare su ING non può essere negativo." })
  }
  if (configurazione.margineAvvisoSoglia < 0) {
    problemi.push({ campo: 'margineAvvisoSoglia', messaggio: 'Il margine di avviso sulla soglia non può essere negativo.' })
  }
  if (fondoEmergenza.obiettivoIntermedio < 0 || fondoEmergenza.obiettivoFinale < 0) {
    problemi.push({ campo: 'fondoEmergenza', messaggio: 'Gli obiettivi del fondo di emergenza non possono essere negativi.' })
  } else if (fondoEmergenza.obiettivoIntermedio > fondoEmergenza.obiettivoFinale) {
    problemi.push({
      campo: 'fondoEmergenza',
      messaggio: "L'obiettivo intermedio del fondo di emergenza non può superare quello finale.",
    })
  }

  return problemi
}
