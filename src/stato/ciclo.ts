/**
 * Avanzamento del ciclo mensile: funzioni pure che ricevono lo stato e ne
 * restituiscono uno nuovo. La UI si limita a chiamarle.
 *
 * Una tranche è completata quando tutti i suoi bonifici necessari sono segnati
 * come eseguiti: in quel momento se ne salva una fotografia e i saldi
 * registrati vengono aggiornati con quelli dopo i bonifici. Togliere un segno
 * riapre la tranche e ripristina i saldi di prima.
 */
import { configurazionePredefinita, type Configurazione } from '../dominio/configurazione.ts'
import { CONTI, type ContoId } from '../dominio/conti.ts'
import type { Centesimi } from '../dominio/denaro.ts'
import {
  applicaBonifici,
  calcolaChiusura,
  calcolaTranche1,
  calcolaTranche1Accorpata,
  calcolaTranche2,
  calcolaTranche2Accorpata,
  parametriDaConfigurazione,
  verificaFineCiclo,
  type Bonifico,
  type RisultatoChiusura,
  type RisultatoTranche1,
  type RisultatoTranche1Accorpata,
  type RisultatoTranche2,
  type RisultatoTranche2Accorpata,
  type Saldi,
  type VerificaFineCiclo,
} from '../dominio/giroconti.ts'
import {
  VERSIONE_STATO,
  type BozzaChiusura,
  type BozzaTranche1,
  type BozzaTranche2,
  type Ciclo,
  type CicloChiuso,
  type ModalitaCiclo,
  type SaldiRegistrati,
  type StatoApp,
  type TrancheCompletata,
} from './modello.ts'

// ---------------------------------------------------------------------------
// Creazione
// ---------------------------------------------------------------------------

export function nuovoCiclo(opzioni: {
  id: string
  adesso: string
  configurazione: Configurazione
  residuoSfiziFrank: Centesimi
  residuoSfiziMG: Centesimi
}): Ciclo {
  const { residuoSfiziFrank, residuoSfiziMG } = opzioni
  return {
    id: opzioni.id,
    avviatoIl: opzioni.adesso,
    parametri: parametriDaConfigurazione(opzioni.configurazione),
    residuiIniziali: { frank: residuoSfiziFrank, mg: residuoSfiziMG },
    modalita: 'standard',
    tranche1: {
      bozza: { saldoBuddybank: null, saldoIntesaFrank: null, residuoSfiziFrank, saldoING: null },
      eseguiti: [],
      completata: null,
    },
    tranche2: {
      bozza: { saldoIntesaMG: null, residuoSfiziMG, saldoING: null, saldoBuddybank: null },
      eseguiti: [],
      completata: null,
    },
    chiusura: {
      bozza: { saldoING: null, saldoIntesaFrank: null, saldoBuddybank: null, saldoIntesaMG: null },
      eseguiti: [],
    },
    coperture: [],
  }
}

export function statoIniziale(adesso: string, idCiclo: string): StatoApp {
  const configurazione = configurazionePredefinita()
  return {
    versione: VERSIONE_STATO,
    configurazione,
    saldi: { ing: null, intesaFrank: null, buddybank: null, intesaMG: null },
    cicloCorrente: nuovoCiclo({ id: idCiclo, adesso, configurazione, residuoSfiziFrank: 0, residuoSfiziMG: 0 }),
    cicliChiusi: [],
  }
}

// ---------------------------------------------------------------------------
// Viste calcolate
// ---------------------------------------------------------------------------

export type FaseCiclo = 'tranche1' | 'tranche2' | 'chiusura'

export function faseCorrente(ciclo: Ciclo): FaseCiclo {
  if (!ciclo.tranche1.completata) return 'tranche1'
  if (!ciclo.tranche2.completata) return 'tranche2'
  return 'chiusura'
}

export type VistaTranche1 =
  | { modalita: 'standard'; risultato: RisultatoTranche1 }
  | { modalita: 'accorpato'; risultato: RisultatoTranche1Accorpata }

export type VistaTranche2 =
  | { modalita: 'standard'; risultato: RisultatoTranche2 }
  | { modalita: 'accorpato'; risultato: RisultatoTranche2Accorpata }

/** La bozza con il saldo ING preso dall'ultimo saldo registrato, se non è stato inserito. */
export function bozzaEffettivaTranche1(ciclo: Ciclo, saldi: SaldiRegistrati): BozzaTranche1 {
  const bozza = ciclo.tranche1.bozza
  return { ...bozza, saldoING: bozza.saldoING ?? saldi.ing?.importo ?? null }
}

export function bozzaEffettivaTranche2(ciclo: Ciclo, saldi: SaldiRegistrati): BozzaTranche2 {
  const bozza = ciclo.tranche2.bozza
  return {
    ...bozza,
    saldoING: bozza.saldoING ?? saldi.ing?.importo ?? null,
    saldoBuddybank: bozza.saldoBuddybank ?? saldi.buddybank?.importo ?? null,
  }
}

/** Bonifici della tranche 1, oppure `null` finché mancano i saldi di Buddybank e Intesa Frank. */
export function calcolaVistaTranche1(ciclo: Ciclo, saldi: SaldiRegistrati): VistaTranche1 | null {
  const bozza = bozzaEffettivaTranche1(ciclo, saldi)
  if (bozza.saldoBuddybank === null || bozza.saldoIntesaFrank === null) return null
  const input = {
    saldoBuddybank: bozza.saldoBuddybank,
    saldoIntesaFrank: bozza.saldoIntesaFrank,
    residuoSfiziFrank: bozza.residuoSfiziFrank ?? 0,
    saldoING: bozza.saldoING,
  }
  return ciclo.modalita === 'accorpato'
    ? { modalita: 'accorpato', risultato: calcolaTranche1Accorpata(input, ciclo.parametri) }
    : { modalita: 'standard', risultato: calcolaTranche1(input, ciclo.parametri) }
}

/** Bonifici della tranche 2: disponibili solo dopo la tranche 1 e con il saldo di Intesa MG. */
export function calcolaVistaTranche2(ciclo: Ciclo, saldi: SaldiRegistrati): VistaTranche2 | null {
  const tranche1 = ciclo.tranche1.completata
  if (!tranche1) return null
  const bozza = bozzaEffettivaTranche2(ciclo, saldi)
  if (bozza.saldoIntesaMG === null) return null
  const input = { saldoIntesaMG: bozza.saldoIntesaMG, residuoSfiziMG: bozza.residuoSfiziMG ?? 0, saldoING: bozza.saldoING }
  return tranche1.modalita === 'accorpato'
    ? {
        modalita: 'accorpato',
        risultato: calcolaTranche2Accorpata(
          {
            ...input,
            saldoBuddybank: bozza.saldoBuddybank,
            importoDifferito: tranche1.importoDifferito,
            anticipoCasa: tranche1.anticipoCasa,
          },
          ciclo.parametri,
        ),
      }
    : { modalita: 'standard', risultato: calcolaTranche2(input, ciclo.parametri) }
}

export function calcolaVerifica(ciclo: Ciclo): VerificaFineCiclo | null {
  const { completata: t1 } = ciclo.tranche1
  const { completata: t2 } = ciclo.tranche2
  if (!t1 || !t2) return null
  return verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, ciclo.parametri)
}

function saldiFinali(bozza: BozzaChiusura): Saldi | null {
  const { saldoING, saldoIntesaFrank, saldoBuddybank, saldoIntesaMG } = bozza
  if (saldoING === null || saldoIntesaFrank === null || saldoBuddybank === null || saldoIntesaMG === null) return null
  return { ing: saldoING, intesaFrank: saldoIntesaFrank, buddybank: saldoBuddybank, intesaMG: saldoIntesaMG }
}

/** Giroconti di chiusura: disponibili dopo la tranche 2 e con tutti e quattro i saldi finali. */
export function calcolaVistaChiusura(ciclo: Ciclo): RisultatoChiusura | null {
  if (!ciclo.tranche2.completata) return null
  const saldi = saldiFinali(ciclo.chiusura.bozza)
  if (!saldi) return null
  return calcolaChiusura(
    { saldoING: saldi.ing, saldoIntesaFrank: saldi.intesaFrank, saldoBuddybank: saldi.buddybank, saldoIntesaMG: saldi.intesaMG },
    ciclo.parametri,
  )
}

/** Saldi dopo la chiusura, applicando solo i giroconti di chiusura segnati come eseguiti. */
export function saldiDopoChiusura(ciclo: Ciclo): Saldi | null {
  const saldi = saldiFinali(ciclo.chiusura.bozza)
  const vista = calcolaVistaChiusura(ciclo)
  if (!saldi || !vista) return null
  return applicaBonifici(saldi, vista.bonifici.filter((b) => ciclo.chiusura.eseguiti.includes(b.numero)))
}

/** Si può segnare un bonifico solo se il piano non è bloccato e la fase successiva non è iniziata. */
export function tranche1Modificabile(ciclo: Ciclo): boolean {
  return ciclo.tranche2.eseguiti.length === 0
}

export function tranche2Modificabile(ciclo: Ciclo): boolean {
  return ciclo.tranche1.completata !== null && ciclo.chiusura.eseguiti.length === 0
}

// ---------------------------------------------------------------------------
// Transizioni
// ---------------------------------------------------------------------------

function conCiclo(stato: StatoApp, modifica: (ciclo: Ciclo) => Ciclo): StatoApp {
  return { ...stato, cicloCorrente: modifica(stato.cicloCorrente) }
}

function necessari(bonifici: readonly Bonifico[]): Bonifico[] {
  return bonifici.filter((b) => b.necessario)
}

function aggiungiOTogli(eseguiti: readonly string[], numero: string, eseguito: boolean): string[] {
  const senza = eseguiti.filter((n) => n !== numero)
  return eseguito ? [...senza, numero] : senza
}

/** Applica i bonifici ai soli saldi noti; i conti di cui non si conosce il saldo restano fuori. */
function saldiDopoBonifici(saldiNoti: Partial<Saldi>, bonifici: readonly Bonifico[]): Partial<Saldi> {
  const completi: Saldi = { ing: 0, intesaFrank: 0, buddybank: 0, intesaMG: 0, ...saldiNoti }
  const dopo = applicaBonifici(completi, bonifici)
  const risultato: Partial<Saldi> = {}
  for (const conto of CONTI) {
    if (saldiNoti[conto] !== undefined) risultato[conto] = dopo[conto]
  }
  return risultato
}

function registraSaldi(saldi: SaldiRegistrati, nuovi: Partial<Saldi>, adesso: string): SaldiRegistrati {
  const aggiornati = { ...saldi }
  for (const conto of CONTI) {
    const importo = nuovi[conto]
    if (importo !== undefined) aggiornati[conto] = { importo, aggiornatoIl: adesso }
  }
  return aggiornati
}

function estraiSaldi(saldi: SaldiRegistrati, conti: readonly ContoId[]): Partial<SaldiRegistrati> {
  const estratti: Partial<SaldiRegistrati> = {}
  for (const conto of conti) estratti[conto] = saldi[conto]
  return estratti
}

function soloNoti(saldi: Partial<Record<ContoId, Centesimi | null>>): Partial<Saldi> {
  const noti: Partial<Saldi> = {}
  for (const conto of CONTI) {
    const importo = saldi[conto]
    if (importo !== undefined && importo !== null) noti[conto] = importo
  }
  return noti
}

/**
 * Completa la tranche se tutti i bonifici necessari sono segnati, oppure la
 * riapre (ripristinando i saldi) se non lo sono più.
 */
function aggiornaCompletamento(
  stato: StatoApp,
  tranche: 'tranche1' | 'tranche2',
  bonifici: readonly Bonifico[],
  saldiPrima: Partial<Saldi>,
  datiFotografia: Pick<TrancheCompletata, 'modalita' | 'variazioneNettaING' | 'importoDifferito' | 'anticipoCasa'>,
  adesso: string,
): StatoApp {
  const statoTranche = stato.cicloCorrente[tranche]
  const daFare = necessari(bonifici)
  const completa = daFare.every((b) => statoTranche.eseguiti.includes(b.numero))

  if (completa && !statoTranche.completata) {
    const saldiDopo = saldiDopoBonifici(saldiPrima, daFare)
    const completata: TrancheCompletata = {
      ...datiFotografia,
      completataIl: adesso,
      bonifici: daFare,
      saldiRegistratiPrima: estraiSaldi(stato.saldi, Object.keys(saldiDopo) as ContoId[]),
    }
    return {
      ...conCiclo(stato, (c) => ({ ...c, [tranche]: { ...c[tranche], completata } })),
      saldi: registraSaldi(stato.saldi, saldiDopo, adesso),
    }
  }
  if (!completa && statoTranche.completata) {
    return {
      ...conCiclo(stato, (c) => ({ ...c, [tranche]: { ...c[tranche], completata: null } })),
      saldi: { ...stato.saldi, ...statoTranche.completata.saldiRegistratiPrima },
    }
  }
  return stato
}

export function impostaCampoTranche1(stato: StatoApp, campo: keyof BozzaTranche1, valore: Centesimi | null): StatoApp {
  if (stato.cicloCorrente.tranche1.eseguiti.length > 0) return stato
  return conCiclo(stato, (c) => ({ ...c, tranche1: { ...c.tranche1, bozza: { ...c.tranche1.bozza, [campo]: valore } } }))
}

export function impostaCampoTranche2(stato: StatoApp, campo: keyof BozzaTranche2, valore: Centesimi | null): StatoApp {
  if (stato.cicloCorrente.tranche2.eseguiti.length > 0) return stato
  return conCiclo(stato, (c) => ({ ...c, tranche2: { ...c.tranche2, bozza: { ...c.tranche2.bozza, [campo]: valore } } }))
}

export function impostaCampoChiusura(stato: StatoApp, campo: keyof BozzaChiusura, valore: Centesimi | null): StatoApp {
  if (stato.cicloCorrente.chiusura.eseguiti.length > 0) return stato
  return conCiclo(stato, (c) => ({ ...c, chiusura: { ...c.chiusura, bozza: { ...c.chiusura.bozza, [campo]: valore } } }))
}

/** Passa dal piano standard a quello accorpato (o viceversa) finché non è segnato nessun bonifico. */
export function scegliModalita(stato: StatoApp, modalita: ModalitaCiclo): StatoApp {
  if (stato.cicloCorrente.tranche1.eseguiti.length > 0) return stato
  return conCiclo(stato, (c) => ({ ...c, modalita }))
}

export function segnaBonificoTranche1(stato: StatoApp, numero: string, eseguito: boolean, adesso: string): StatoApp {
  const ciclo = stato.cicloCorrente
  if (!tranche1Modificabile(ciclo)) return stato
  const vista = calcolaVistaTranche1(ciclo, stato.saldi)
  if (!vista) return stato
  const { risultato } = vista
  if (eseguito && (risultato.bloccato || !necessari(risultato.bonifici).some((b) => b.numero === numero))) return stato

  // Al primo segno i valori sottintesi (saldo registrato, residuo vuoto = 0) entrano nella bozza, che da qui è bloccata.
  const effettiva = bozzaEffettivaTranche1(ciclo, stato.saldi)
  const bozza = ciclo.tranche1.eseguiti.length === 0
    ? { ...effettiva, residuoSfiziFrank: effettiva.residuoSfiziFrank ?? 0 }
    : ciclo.tranche1.bozza
  const eseguiti = aggiungiOTogli(ciclo.tranche1.eseguiti, numero, eseguito)
  const segnato = conCiclo(stato, (c) => ({ ...c, tranche1: { ...c.tranche1, bozza, eseguiti } }))

  const bonifico3 = risultato.bonifici.find((b) => b.numero === '3')
  return aggiornaCompletamento(
    segnato,
    'tranche1',
    risultato.bonifici,
    soloNoti({ buddybank: bozza.saldoBuddybank, intesaFrank: bozza.saldoIntesaFrank, ing: bozza.saldoING }),
    {
      modalita: vista.modalita,
      variazioneNettaING: risultato.variazioneNettaING,
      importoDifferito: vista.modalita === 'accorpato' ? vista.risultato.importoDifferito : 0,
      anticipoCasa: bonifico3?.importo ?? 0,
    },
    adesso,
  )
}

export function segnaBonificoTranche2(stato: StatoApp, numero: string, eseguito: boolean, adesso: string): StatoApp {
  const ciclo = stato.cicloCorrente
  if (!tranche2Modificabile(ciclo)) return stato
  const vista = calcolaVistaTranche2(ciclo, stato.saldi)
  if (!vista) return stato
  const { risultato } = vista
  if (eseguito && (risultato.bloccato || !necessari(risultato.bonifici).some((b) => b.numero === numero))) return stato

  const effettiva = bozzaEffettivaTranche2(ciclo, stato.saldi)
  const bozza = ciclo.tranche2.eseguiti.length === 0
    ? { ...effettiva, residuoSfiziMG: effettiva.residuoSfiziMG ?? 0 }
    : ciclo.tranche2.bozza
  const eseguiti = aggiungiOTogli(ciclo.tranche2.eseguiti, numero, eseguito)
  const segnato = conCiclo(stato, (c) => ({ ...c, tranche2: { ...c.tranche2, bozza, eseguiti } }))

  return aggiornaCompletamento(
    segnato,
    'tranche2',
    risultato.bonifici,
    soloNoti({
      intesaMG: bozza.saldoIntesaMG,
      ing: bozza.saldoING,
      buddybank: vista.modalita === 'accorpato' ? bozza.saldoBuddybank : null,
    }),
    { modalita: vista.modalita, variazioneNettaING: risultato.variazioneNettaING, importoDifferito: 0, anticipoCasa: 0 },
    adesso,
  )
}

export function segnaBonificoChiusura(stato: StatoApp, numero: string, eseguito: boolean): StatoApp {
  const vista = calcolaVistaChiusura(stato.cicloCorrente)
  if (!vista) return stato
  const bonifico = vista.bonifici.find((b) => b.numero === numero)
  if (eseguito && (!bonifico || vista.bloccato)) return stato
  return conCiclo(stato, (c) => ({
    ...c,
    chiusura: { ...c.chiusura, eseguiti: aggiungiOTogli(c.chiusura.eseguiti, numero, eseguito) },
  }))
}

/** Toglie tutti i segni della tranche 1 per poterne correggere i saldi. */
export function riapriTranche1(stato: StatoApp): StatoApp {
  const ciclo = stato.cicloCorrente
  if (!tranche1Modificabile(ciclo)) return stato
  const saldiPrima = ciclo.tranche1.completata?.saldiRegistratiPrima ?? {}
  return {
    ...conCiclo(stato, (c) => ({ ...c, tranche1: { ...c.tranche1, eseguiti: [], completata: null } })),
    saldi: { ...stato.saldi, ...saldiPrima },
  }
}

/** Toglie tutti i segni della tranche 2 per poterne correggere i saldi. */
export function riapriTranche2(stato: StatoApp): StatoApp {
  const ciclo = stato.cicloCorrente
  if (!tranche2Modificabile(ciclo)) return stato
  const saldiPrima = ciclo.tranche2.completata?.saldiRegistratiPrima ?? {}
  return {
    ...conCiclo(stato, (c) => ({ ...c, tranche2: { ...c.tranche2, eseguiti: [], completata: null } })),
    saldi: { ...stato.saldi, ...saldiPrima },
  }
}

export function riapriChiusura(stato: StatoApp): StatoApp {
  return conCiclo(stato, (c) => ({ ...c, chiusura: { ...c.chiusura, eseguiti: [] } }))
}

/** Registra un giroconto ING → Intesa Frank fatto per coprire uno sforamento della casa. */
export function registraCopertura(stato: StatoApp, importo: Centesimi, id: string, adesso: string): StatoApp {
  if (importo <= 0) return stato
  const { ing, intesaFrank } = stato.saldi
  return {
    ...conCiclo(stato, (c) => ({ ...c, coperture: [...c.coperture, { id, importo, eseguitaIl: adesso }] })),
    saldi: {
      ...stato.saldi,
      ing: ing ? { importo: ing.importo - importo, aggiornatoIl: adesso } : null,
      intesaFrank: intesaFrank ? { importo: intesaFrank.importo + importo, aggiornatoIl: adesso } : null,
    },
  }
}

export function annullaCopertura(stato: StatoApp, id: string, adesso: string): StatoApp {
  const copertura = stato.cicloCorrente.coperture.find((c) => c.id === id)
  if (!copertura) return stato
  const { ing, intesaFrank } = stato.saldi
  return {
    ...conCiclo(stato, (c) => ({ ...c, coperture: c.coperture.filter((x) => x.id !== id) })),
    saldi: {
      ...stato.saldi,
      ing: ing ? { importo: ing.importo + copertura.importo, aggiornatoIl: adesso } : null,
      intesaFrank: intesaFrank ? { importo: intesaFrank.importo - copertura.importo, aggiornatoIl: adesso } : null,
    },
  }
}

/**
 * Archivia il ciclo e ne avvia uno nuovo, con i residui sfizi rilevati adesso
 * e i parametri della configurazione attuale. I giroconti di chiusura non
 * segnati come eseguiti non vengono applicati ai saldi.
 */
export function chiudiCiclo(stato: StatoApp, adesso: string, idNuovoCiclo: string): StatoApp {
  const ciclo = stato.cicloCorrente
  const { completata: tranche1 } = ciclo.tranche1
  const { completata: tranche2 } = ciclo.tranche2
  const saldi = saldiFinali(ciclo.chiusura.bozza)
  const saldiDopo = saldiDopoChiusura(ciclo)
  const vista = calcolaVistaChiusura(ciclo)
  const verifica = calcolaVerifica(ciclo)
  if (!tranche1 || !tranche2 || !saldi || !saldiDopo || !vista || !verifica) return stato

  const bonifici = vista.bonifici.filter((b) => ciclo.chiusura.eseguiti.includes(b.numero))
  const archiviato: CicloChiuso = {
    id: ciclo.id,
    avviatoIl: ciclo.avviatoIl,
    chiusoIl: adesso,
    parametri: ciclo.parametri,
    tranche1,
    tranche2,
    coperture: ciclo.coperture,
    chiusura: {
      saldiFinali: saldi,
      bonifici,
      saldiDopo,
      residuoSfiziFrank: vista.residuoSfiziFrank,
      residuoSfiziMG: vista.residuoSfiziMG,
    },
    verifica: { totale: verifica.totale, target: verifica.target, scarto: verifica.scarto },
  }
  return {
    ...stato,
    saldi: registraSaldi(stato.saldi, saldiDopo, adesso),
    cicloCorrente: nuovoCiclo({
      id: idNuovoCiclo,
      adesso,
      configurazione: stato.configurazione,
      residuoSfiziFrank: vista.residuoSfiziFrank,
      residuoSfiziMG: vista.residuoSfiziMG,
    }),
    cicliChiusi: [archiviato, ...stato.cicliChiusi],
  }
}
