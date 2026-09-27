/**
 * Salvataggio dello stato sul dispositivo e verifica della sua forma.
 * La stessa verifica servirà per importare un backup JSON.
 */
import type { Configurazione, Entrata, Percentuali, SpesaFissa } from '../dominio/configurazione.ts'
import { CONTI, type ContoId } from '../dominio/conti.ts'
import type { Bonifico, ParametriCalcolo, Saldi } from '../dominio/giroconti.ts'
import {
  VERSIONE_STATO,
  type BozzaChiusura,
  type BozzaTranche1,
  type BozzaTranche2,
  type Ciclo,
  type CicloChiuso,
  type CoperturaRegistrata,
  type SaldiRegistrati,
  type SaldoRegistrato,
  type StatoApp,
  type StatoTranche,
  type TrancheCompletata,
} from './modello.ts'

export const CHIAVE_STATO = 'budget-famiglia/stato'

// ---------------------------------------------------------------------------
// Verifica della forma
// ---------------------------------------------------------------------------

type Guardia<T> = (valore: unknown) => valore is T

function eOggetto(valore: unknown): valore is Record<string, unknown> {
  return typeof valore === 'object' && valore !== null && !Array.isArray(valore)
}

const eIntero: Guardia<number> = (v): v is number => Number.isSafeInteger(v)
const eStringa: Guardia<string> = (v): v is string => typeof v === 'string'
const eBooleano: Guardia<boolean> = (v): v is boolean => typeof v === 'boolean'

function nullabile<T>(guardia: Guardia<T>): Guardia<T | null> {
  return (v): v is T | null => v === null || guardia(v)
}

function listaDi<T>(guardia: Guardia<T>): Guardia<T[]> {
  return (v): v is T[] => Array.isArray(v) && v.every(guardia)
}

function unoDi<T extends string>(...valori: readonly T[]): Guardia<T> {
  return (v): v is T => typeof v === 'string' && (valori as readonly string[]).includes(v)
}

/** Oggetto con esattamente i campi indicati, ciascuno verificato dalla sua guardia. */
function struttura<T>(campi: { [K in keyof T]-?: Guardia<T[K]> }): Guardia<T> {
  const guardie = Object.entries(campi) as [string, Guardia<unknown>][]
  return (v): v is T => eOggetto(v) && guardie.every(([chiave, guardia]) => guardia(v[chiave]))
}

/** Oggetto con un sottoinsieme delle chiavi indicate. */
function parziale<K extends string, T>(chiavi: readonly K[], guardia: Guardia<T>): Guardia<Partial<Record<K, T>>> {
  return (v): v is Partial<Record<K, T>> =>
    eOggetto(v) && Object.entries(v).every(([chiave, x]) => (chiavi as readonly string[]).includes(chiave) && guardia(x))
}

const eConto: Guardia<ContoId> = unoDi(...CONTI)
const eImportoONull = nullabile(eIntero)

const eConfigurazione = struttura<Configurazione>({
  entrate: listaDi(
    struttura<Entrata>({ id: eStringa, nome: eStringa, importo: eIntero, conto: unoDi('buddybank', 'intesaFrank', 'intesaMG') }),
  ),
  speseFisse: listaDi(struttura<SpesaFissa>({ id: eStringa, nome: eStringa, importo: eIntero, conto: unoDi('ing', 'intesaFrank') })),
  percentuali: struttura<Percentuali>({ casa: eIntero, risparmio: eIntero, sfiziFrank: eIntero, sfiziMG: eIntero }),
  minimoAccreditoING: eIntero,
  margineAvvisoSoglia: eIntero,
  fondoEmergenza: struttura<Configurazione['fondoEmergenza']>({ obiettivoIntermedio: eIntero, obiettivoFinale: eIntero }),
})

const eParametri = struttura<ParametriCalcolo>({
  quotaSfiziFrank: eIntero,
  quotaSfiziMG: eIntero,
  trasferimentoCasa: eIntero,
  targetING: eIntero,
  sogliaING: eIntero,
  minimoAccreditoING: eIntero,
  margineAvvisoSoglia: eIntero,
  entrataPrevistaFrank: eIntero,
  entrataPrevistaMG: eIntero,
})

const eBonifico = struttura<Bonifico>({
  numero: eStringa,
  da: eConto,
  a: eConto,
  importo: eIntero,
  descrizione: eStringa,
  necessario: eBooleano,
})

const eSaldoRegistrato = struttura<SaldoRegistrato>({ importo: eIntero, aggiornatoIl: eStringa })
const eSaldoRegistratoONull = nullabile(eSaldoRegistrato)

const eSaldiRegistrati = struttura<SaldiRegistrati>({
  ing: eSaldoRegistratoONull,
  intesaFrank: eSaldoRegistratoONull,
  buddybank: eSaldoRegistratoONull,
  intesaMG: eSaldoRegistratoONull,
})

const eSaldi = struttura<Saldi>({ ing: eIntero, intesaFrank: eIntero, buddybank: eIntero, intesaMG: eIntero })

const eModalita = unoDi('standard', 'accorpato')

const eTrancheCompletata = struttura<TrancheCompletata>({
  completataIl: eStringa,
  modalita: eModalita,
  bonifici: listaDi(eBonifico),
  variazioneNettaING: eIntero,
  importoDifferito: eIntero,
  anticipoCasa: eIntero,
  saldiRegistratiPrima: parziale(CONTI, eSaldoRegistratoONull),
})

function statoTranche<B>(eBozza: Guardia<B>): Guardia<StatoTranche<B>> {
  return struttura<StatoTranche<B>>({ bozza: eBozza, eseguiti: listaDi(eStringa), completata: nullabile(eTrancheCompletata) })
}

const eCopertura = struttura<CoperturaRegistrata>({ id: eStringa, importo: eIntero, eseguitaIl: eStringa })

const eCiclo = struttura<Ciclo>({
  id: eStringa,
  avviatoIl: eStringa,
  parametri: eParametri,
  residuiIniziali: struttura<Ciclo['residuiIniziali']>({ frank: eIntero, mg: eIntero }),
  modalita: eModalita,
  tranche1: statoTranche(
    struttura<BozzaTranche1>({
      saldoBuddybank: eImportoONull,
      saldoIntesaFrank: eImportoONull,
      residuoSfiziFrank: eImportoONull,
      saldoING: eImportoONull,
    }),
  ),
  tranche2: statoTranche(
    struttura<BozzaTranche2>({
      saldoIntesaMG: eImportoONull,
      residuoSfiziMG: eImportoONull,
      saldoING: eImportoONull,
      saldoBuddybank: eImportoONull,
    }),
  ),
  chiusura: struttura<Ciclo['chiusura']>({
    bozza: struttura<BozzaChiusura>({
      saldoING: eImportoONull,
      saldoIntesaFrank: eImportoONull,
      saldoBuddybank: eImportoONull,
      saldoIntesaMG: eImportoONull,
    }),
    eseguiti: listaDi(eStringa),
  }),
  coperture: listaDi(eCopertura),
})

const eCicloChiuso = struttura<CicloChiuso>({
  id: eStringa,
  avviatoIl: eStringa,
  chiusoIl: eStringa,
  parametri: eParametri,
  tranche1: eTrancheCompletata,
  tranche2: eTrancheCompletata,
  coperture: listaDi(eCopertura),
  chiusura: struttura<CicloChiuso['chiusura']>({
    saldiFinali: eSaldi,
    bonifici: listaDi(eBonifico),
    saldiDopo: eSaldi,
    residuoSfiziFrank: eIntero,
    residuoSfiziMG: eIntero,
  }),
  verifica: struttura<CicloChiuso['verifica']>({ totale: eIntero, target: eIntero, scarto: eIntero }),
})

const eStatoApp = struttura<StatoApp>({
  versione: (v): v is typeof VERSIONE_STATO => v === VERSIONE_STATO,
  configurazione: eConfigurazione,
  saldi: eSaldiRegistrati,
  cicloCorrente: eCiclo,
  cicliChiusi: listaDi(eCicloChiuso),
})

/** Lo stato, se i dati hanno la forma attesa; altrimenti `null`. */
export function validaStatoApp(dati: unknown): StatoApp | null {
  return eStatoApp(dati) ? dati : null
}

// ---------------------------------------------------------------------------
// Caricamento e salvataggio
// ---------------------------------------------------------------------------

export type Archivio = Pick<Storage, 'getItem' | 'setItem'>

export interface EsitoCaricamento {
  stato: StatoApp
  /** Messaggio da mostrare se qualcosa non è andato come previsto. */
  avviso: string | null
}

/** Il `localStorage` del browser, oppure `null` se non è disponibile (per esempio in certe modalità private). */
export function archivioDelBrowser(): Archivio | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function caricaStato(archivio: Archivio | null, creaStato: () => StatoApp, adesso: string): EsitoCaricamento {
  const nonSalvabile = 'Questo browser non permette di salvare i dati sul dispositivo: andranno persi alla chiusura.'
  if (!archivio) return { stato: creaStato(), avviso: nonSalvabile }

  let grezzo: string | null
  try {
    grezzo = archivio.getItem(CHIAVE_STATO)
  } catch {
    return { stato: creaStato(), avviso: nonSalvabile }
  }
  if (grezzo === null) return { stato: creaStato(), avviso: null }

  try {
    const stato = validaStatoApp(JSON.parse(grezzo))
    if (stato) return { stato, avviso: null }
  } catch {
    // JSON non valido: si gestisce sotto come dati illeggibili.
  }

  // Prima di ripartire da zero si conserva una copia dei dati illeggibili.
  const copia = `${CHIAVE_STATO}/illeggibile-${adesso}`
  try {
    archivio.setItem(copia, grezzo)
  } catch {
    return { stato: creaStato(), avviso: 'I dati salvati non erano leggibili e non è stato possibile conservarne una copia.' }
  }
  return { stato: creaStato(), avviso: `I dati salvati non erano leggibili: ne è stata conservata una copia (${copia}) e l'app è ripartita da zero.` }
}

/** Salva lo stato; restituisce `false` se il browser rifiuta la scrittura (spazio esaurito, modalità privata). */
export function salvaStato(archivio: Archivio, stato: StatoApp): boolean {
  try {
    const json = JSON.stringify(stato)
    if (archivio.getItem(CHIAVE_STATO) !== json) archivio.setItem(CHIAVE_STATO, json)
    return true
  } catch {
    return false
  }
}
