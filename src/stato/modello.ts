/**
 * Forma dei dati salvati sul dispositivo. Ogni modifica incompatibile va
 * accompagnata da un nuovo numero di versione e da una migrazione.
 */
import type { Configurazione } from '../dominio/configurazione.ts'
import type { ContoId } from '../dominio/conti.ts'
import type { Centesimi } from '../dominio/denaro.ts'
import type { Bonifico, ParametriCalcolo, Saldi } from '../dominio/giroconti.ts'

export const VERSIONE_STATO = 1

export interface SaldoRegistrato {
  importo: Centesimi
  /** Data e ora ISO 8601 dell'ultimo aggiornamento. */
  aggiornatoIl: string
}

export type SaldiRegistrati = Record<ContoId, SaldoRegistrato | null>

export type ModalitaCiclo = 'standard' | 'accorpato'

/** Valori inseriti a mano: `null` finché il campo è vuoto. */
export interface BozzaTranche1 {
  saldoBuddybank: Centesimi | null
  saldoIntesaFrank: Centesimi | null
  residuoSfiziFrank: Centesimi | null
  saldoING: Centesimi | null
}

export interface BozzaTranche2 {
  saldoIntesaMG: Centesimi | null
  residuoSfiziMG: Centesimi | null
  saldoING: Centesimi | null
  /** Solo nel piano accorpato: per verificare che l'importo differito sia ancora su Buddybank. */
  saldoBuddybank: Centesimi | null
}

export interface BozzaChiusura {
  saldoING: Centesimi | null
  saldoIntesaFrank: Centesimi | null
  saldoBuddybank: Centesimi | null
  saldoIntesaMG: Centesimi | null
}

/** Fotografia di una tranche completata: non cambia più, anche se cambia la configurazione. */
export interface TrancheCompletata {
  completataIl: string
  modalita: ModalitaCiclo
  /** I bonifici eseguiti, nell'ordine. */
  bonifici: Bonifico[]
  variazioneNettaING: Centesimi
  /** Tranche 1 accorpata: il bonifico 2 rinviato alla tranche 2. Altrimenti 0. */
  importoDifferito: Centesimi
  /** Tranche 1: il bonifico 3, cioè quanto ING ha versato alla casa. Altrimenti 0. */
  anticipoCasa: Centesimi
  /** Saldi registrati prima del completamento, da ripristinare se la tranche viene riaperta. */
  saldiRegistratiPrima: Partial<SaldiRegistrati>
}

export interface StatoTranche<B> {
  bozza: B
  /** Numeri dei bonifici segnati come eseguiti. */
  eseguiti: string[]
  completata: TrancheCompletata | null
}

export interface CoperturaRegistrata {
  id: string
  importo: Centesimi
  eseguitaIl: string
}

export interface Ciclo {
  id: string
  avviatoIl: string
  /** Fissati all'avvio: il ciclo in corso non cambia se nel frattempo cambia la configurazione. */
  parametri: ParametriCalcolo
  /** Residui sfizi rilevati alla chiusura del ciclo precedente. */
  residuiIniziali: { frank: Centesimi; mg: Centesimi }
  modalita: ModalitaCiclo
  tranche1: StatoTranche<BozzaTranche1>
  tranche2: StatoTranche<BozzaTranche2>
  chiusura: { bozza: BozzaChiusura; eseguiti: string[] }
  /** Giroconti da ING al conto casa per coprire sforamenti durante il ciclo. */
  coperture: CoperturaRegistrata[]
}

export interface CicloChiuso {
  id: string
  avviatoIl: string
  chiusoIl: string
  parametri: ParametriCalcolo
  tranche1: TrancheCompletata
  tranche2: TrancheCompletata
  coperture: CoperturaRegistrata[]
  chiusura: {
    /** Saldi rilevati a fine ciclo, prima dei giroconti di chiusura. */
    saldiFinali: Saldi
    /** Giroconti di chiusura eseguiti (avanzo casa o copertura sforamento). */
    bonifici: Bonifico[]
    saldiDopo: Saldi
    residuoSfiziFrank: Centesimi
    residuoSfiziMG: Centesimi
  }
  verifica: { totale: Centesimi; target: Centesimi; scarto: Centesimi }
}

export interface StatoApp {
  versione: typeof VERSIONE_STATO
  configurazione: Configurazione
  /** Ultimi saldi noti dei conti, inseriti a mano o calcolati dopo i giroconti. */
  saldi: SaldiRegistrati
  cicloCorrente: Ciclo
  /** Dal più recente al più vecchio. */
  cicliChiusi: CicloChiuso[]
}
