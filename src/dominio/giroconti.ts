/**
 * Calcolo dei giroconti del ciclo mensile.
 *
 * Solo funzioni pure: ricevono saldi e parametri, restituiscono i bonifici da
 * fare e gli esiti delle verifiche. Nessuno stato, nessun accesso alla UI o
 * allo storage.
 *
 * Il ciclo si esegue in due tranche perché lo stipendio di MG arriva circa
 * dieci giorni dopo quello di Frank:
 *
 *   Tranche 1 (stipendio di Frank)
 *     1. Intesa Frank → Buddybank : saldo Intesa Frank                  (svuota il conto)
 *     2. Buddybank → ING          : saldo Buddybank + bonifico 1 − (quota sfizi + residuo)
 *     3. ING → Intesa Frank       : trasferimento casa (1.213 €)
 *
 *   Tranche 2 (stipendio di MG)
 *     4. Intesa MG → ING          : saldo Intesa MG − (quota sfizi + residuo)
 *
 * Se il bonifico 2 non raggiunge il minimo di 1.000 € in un'unica transazione,
 * il piano standard è bloccato e si usa il piano accorpato: il bonifico 2 viene
 * rinviato alla tranche 2 e fatto insieme alla quota di MG in un solo bonifico.
 */
import { calcolaRipartizione, type Configurazione } from './configurazione.ts'
import { NOME_CONTO, type ContoId } from './conti.ts'
import { formattaEuro as eur, somma, type Centesimi } from './denaro.ts'

/** I numeri che servono al calcolo, derivati dalla configurazione. */
export interface ParametriCalcolo {
  /** Quota sfizi mensile di Frank (110 €), da versare sopra al residuo. */
  quotaSfiziFrank: Centesimi
  /** Quota sfizi mensile di MG (110 €), da versare sopra al residuo. */
  quotaSfiziMG: Centesimi
  /** Da portare su Intesa Frank a inizio ciclo (1.213 €). */
  trasferimentoCasa: Centesimi
  /** Variazione netta attesa su ING nel ciclo (767 €). */
  targetING: Centesimi
  /** Soglia intoccabile su ING (437 €). */
  sogliaING: Centesimi
  /** Minimo da accreditare su ING in un'unica transazione ogni mese (1.000 €). */
  minimoAccreditoING: Centesimi
  /** Sotto questo risparmio reale scatta l'avviso di vicinanza alla soglia. */
  margineAvvisoSoglia: Centesimi
  /** Stipendio previsto di Frank, somma delle due parti (1.600 €). */
  entrataPrevistaFrank: Centesimi
  /** Stipendio previsto di MG (600 €). */
  entrataPrevistaMG: Centesimi
}

export function parametriDaConfigurazione(configurazione: Configurazione): ParametriCalcolo {
  const r = calcolaRipartizione(configurazione)
  const entrateSu = (...conti: ContoId[]) =>
    somma(configurazione.entrate.filter((e) => conti.includes(e.conto)).map((e) => e.importo))
  return {
    quotaSfiziFrank: r.sfiziFrank,
    quotaSfiziMG: r.sfiziMG,
    trasferimentoCasa: r.trasferimentoCasa,
    targetING: r.targetING,
    sogliaING: r.sogliaING,
    minimoAccreditoING: configurazione.minimoAccreditoING,
    margineAvvisoSoglia: configurazione.margineAvvisoSoglia,
    entrataPrevistaFrank: entrateSu('buddybank', 'intesaFrank'),
    entrataPrevistaMG: entrateSu('intesaMG'),
  }
}

// ---------------------------------------------------------------------------
// Bonifici ed esiti
// ---------------------------------------------------------------------------

export interface Bonifico {
  /** Posizione nella sequenza del ciclo: '1', '2', '3', '4', '2+4', … */
  numero: string
  da: ContoId
  a: ContoId
  importo: Centesimi
  descrizione: string
  /** `false` quando non c'è niente da spostare (per esempio il conto è già vuoto): si salta. */
  necessario: boolean
}

function bonifico(numero: string, da: ContoId, a: ContoId, importo: Centesimi, descrizione: string): Bonifico {
  return { numero, da, a, importo, descrizione, necessario: importo > 0 }
}

export type Saldi = Record<ContoId, Centesimi>

/** Saldi dopo aver eseguito i bonifici indicati; quelli non necessari si saltano. */
export function applicaBonifici(saldi: Saldi, bonifici: readonly Bonifico[]): Saldi {
  const dopo = { ...saldi }
  for (const b of bonifici) {
    if (!b.necessario) continue
    dopo[b.da] -= b.importo
    dopo[b.a] += b.importo
  }
  return dopo
}

export type Gravita = 'bloccante' | 'attenzione' | 'info' | 'ok'

export type CodiceEsito =
  | 'SALDI_INSUFFICIENTI'
  | 'QUOTA_SFIZI_NEGATIVA'
  | 'RESIDUO_SUPERIORE_AL_SALDO'
  | 'ACCREDITO_ING_SOTTO_MINIMO'
  | 'ACCREDITO_ING_SOTTO_MINIMO_ANCHE_ACCORPANDO'
  | 'ING_FONDI_INSUFFICIENTI'
  | 'ING_SOTTO_SOGLIA'
  | 'ING_VICINO_SOGLIA'
  | 'ING_FINANZIA_CASA'
  | 'ING_ANTICIPA_CASA'
  | 'FONDI_VINCOLATI_SU_BUDDYBANK'
  | 'BUDDYBANK_INSUFFICIENTE'
  | 'CASA_IN_ROSSO'
  | 'SALDO_ING_NON_INSERITO'
  | 'ENTRATE_DIVERSE_DAL_PREVISTO'
  | 'IN_LINEA_CON_TARGET'
  | 'RISPARMIO_EXTRA'
  | 'SOTTO_TARGET'
  | 'AVANZO_CASA'
  | 'SFORAMENTO_CASA'
  | 'RISPARMIO_INSUFFICIENTE'
  | 'SFIZI_IN_ROSSO'

export interface Esito {
  codice: CodiceEsito
  gravita: Gravita
  titolo: string
  messaggio: string
}

const ORDINE_GRAVITA: Record<Gravita, number> = { bloccante: 0, attenzione: 1, info: 2, ok: 3 }

/** Esiti dal più grave al meno grave, a parità di gravità nell'ordine in cui sono stati rilevati. */
function ordina(esiti: Esito[]): Esito[] {
  return [...esiti].sort((a, b) => ORDINE_GRAVITA[a.gravita] - ORDINE_GRAVITA[b.gravita])
}

function bloccato(esiti: readonly Esito[]): boolean {
  return esiti.some((e) => e.gravita === 'bloccante')
}

type Persona = 'Frank' | 'MG'

const CONTO_SFIZI: Record<Persona, ContoId> = { Frank: 'buddybank', MG: 'intesaMG' }

/** Verifiche comuni sulla quota sfizi (quota mensile + residuo) che resta sul conto personale. */
function verificaQuotaSfizi(persona: Persona, saldo: Centesimi, residuo: Centesimi, quota: Centesimi): Esito[] {
  const conto = NOME_CONTO[CONTO_SFIZI[persona]]
  const esiti: Esito[] = []
  if (quota < 0) {
    esiti.push({
      codice: 'QUOTA_SFIZI_NEGATIVA',
      gravita: 'bloccante',
      titolo: `Quota sfizi di ${persona} negativa`,
      messaggio: `Con un residuo di ${eur(residuo)} la quota sfizi di ${persona} sarebbe ${eur(quota)}: ${conto} dovrebbe restare in rosso, e un bonifico non può lasciarlo in negativo. Controlla il residuo.`,
    })
  }
  if (residuo > saldo) {
    esiti.push({
      codice: 'RESIDUO_SUPERIORE_AL_SALDO',
      gravita: 'attenzione',
      titolo: `Residuo sfizi di ${persona} maggiore del saldo`,
      messaggio: `Il residuo sfizi di ${persona} (${eur(residuo)}) supera il saldo di ${conto} (${eur(saldo)}): lo stipendio è già arrivato? Controlla i dati prima di procedere.`,
    })
  }
  return esiti
}

function saldoINGNonInserito(motivo: string): Esito {
  return {
    codice: 'SALDO_ING_NON_INSERITO',
    gravita: 'info',
    titolo: 'Saldo ING non inserito',
    messaggio: `Inserisci il saldo attuale di ING per ${motivo}.`,
  }
}

/** Risparmio reale: quanto c'è su ING sopra la soglia intoccabile. Negativo se la soglia è intaccata. */
export function risparmioReale(saldoING: Centesimi, sogliaING: Centesimi): Centesimi {
  return saldoING - sogliaING
}

export type StatoSoglia = 'sotto' | 'vicino' | 'ok'

export function statoSoglia(saldoING: Centesimi, p: Pick<ParametriCalcolo, 'sogliaING' | 'margineAvvisoSoglia'>): StatoSoglia {
  const risparmio = risparmioReale(saldoING, p.sogliaING)
  if (risparmio < 0) return 'sotto'
  if (risparmio < p.margineAvvisoSoglia) return 'vicino'
  return 'ok'
}

/**
 * Verifica della soglia intoccabile su ING dopo una serie di bonifici.
 * Scendere sotto la soglia blocca il piano; in chiusura, dove non c'è un piano
 * da bloccare, resta un avviso.
 */
function verificaSoglia(
  saldoINGDopo: Centesimi,
  p: ParametriCalcolo,
  momento: string,
  gravitaSottoSoglia: Gravita = 'bloccante',
): Esito[] {
  const risparmio = risparmioReale(saldoINGDopo, p.sogliaING)
  switch (statoSoglia(saldoINGDopo, p)) {
    case 'sotto':
      return [{
        codice: 'ING_SOTTO_SOGLIA',
        gravita: gravitaSottoSoglia,
        titolo: 'Soglia intoccabile di ING intaccata',
        messaggio: `${momento}: ING a ${eur(saldoINGDopo)}, sotto la soglia intoccabile di ${eur(p.sogliaING)} che copre il mutuo (mancano ${eur(-risparmio)}).`,
      }]
    case 'vicino':
      return [{
        codice: 'ING_VICINO_SOGLIA',
        gravita: 'attenzione',
        titolo: 'ING vicino alla soglia intoccabile',
        messaggio: `${momento}: ING a ${eur(saldoINGDopo)}, solo ${eur(risparmio)} di risparmio reale sopra la soglia di ${eur(p.sogliaING)}.`,
      }]
    case 'ok':
      return []
  }
}

function entrateDiverseDalPrevisto(
  persona: Persona,
  numeroBonifico: string,
  importo: Centesimi,
  previsto: Centesimi,
): Esito[] {
  const scarto = importo - previsto
  if (scarto === 0) return []
  const piu = scarto > 0
  return [{
    codice: 'ENTRATE_DIVERSE_DAL_PREVISTO',
    gravita: 'info',
    titolo: `Entrate di ${persona} più ${piu ? 'alte' : 'basse'} del previsto`,
    messaggio: piu
      ? `Il bonifico ${numeroBonifico} è di ${eur(importo)}, ${eur(scarto)} in più rispetto ai ${eur(previsto)} attesi con le entrate configurate: l'eccedenza va su ING come risparmio in più.`
      : `Il bonifico ${numeroBonifico} è di ${eur(importo)}, ${eur(-scarto)} in meno rispetto ai ${eur(previsto)} attesi con le entrate configurate: su ING arriva meno risparmio.`,
  }]
}

// ---------------------------------------------------------------------------
// Tranche 1 — all'arrivo dello stipendio di Frank
// ---------------------------------------------------------------------------

export interface InputTranche1 {
  saldoBuddybank: Centesimi
  saldoIntesaFrank: Centesimi
  /** Avanzo sfizi di Frank rilevato alla chiusura del ciclo precedente (0 se non ce n'è). */
  residuoSfiziFrank: Centesimi
  /** Facoltativo: serve per verificare la soglia e i fondi per il bonifico 3. */
  saldoING?: Centesimi | null
}

/** Cosa succederebbe accorpando la tranche di MG nel bonifico verso ING. */
export interface AnteprimaPianoAccorpato {
  /** Il bonifico 2, rinviato alla tranche 2. */
  importoDifferito: Centesimi
  /** Quota di MG prevista con le entrate configurate (stipendio − quota sfizi). */
  stimaQuotaMG: Centesimi
  stimaBonificoUnico: Centesimi
  raggiungeMinimo: boolean
}

export interface RisultatoTranche1 {
  /** Bonifici 1, 2 e 3, nell'ordine in cui vanno fatti. */
  bonifici: Bonifico[]
  /** Quota sfizi + residuo: resta su Buddybank. */
  quotaSfizi: Centesimi
  restaSuBuddybank: Centesimi
  restaSuIntesaFrank: Centesimi
  /** Bonifico 2 − bonifico 3. */
  variazioneNettaING: Centesimi
  saldoINGDopo: Centesimi | null
  /** Il bonifico 2 che ci si aspetta con le entrate configurate. */
  bonifico2Previsto: Centesimi
  esiti: Esito[]
  bloccato: boolean
  /** Presente solo se il bonifico 2 non raggiunge il minimo su ING. */
  pianoAccorpato: AnteprimaPianoAccorpato | null
}

/** Parti della tranche 1 comuni al piano standard e a quello accorpato. */
function basiTranche1(input: InputTranche1, p: ParametriCalcolo) {
  const quotaSfizi = p.quotaSfiziFrank + input.residuoSfiziFrank
  // Se Intesa Frank è in rosso non c'è niente da svuotare: lo scoperto lo copre ING con il bonifico 3.
  const scopertoCasa = Math.max(0, -input.saldoIntesaFrank)
  const importo1 = Math.max(0, input.saldoIntesaFrank)
  const disponibile = input.saldoBuddybank + importo1
  const importo2 = disponibile - quotaSfizi
  const importo3 = p.trasferimentoCasa + scopertoCasa

  const esiti: Esito[] = [...verificaQuotaSfizi('Frank', input.saldoBuddybank, input.residuoSfiziFrank, quotaSfizi)]
  if (importo2 <= 0) {
    esiti.push({
      codice: 'SALDI_INSUFFICIENTI',
      gravita: 'bloccante',
      titolo: 'Saldi insufficienti',
      messaggio: `Buddybank e Intesa Frank insieme hanno ${eur(disponibile)}: non bastano a coprire la quota sfizi di Frank (${eur(quotaSfizi)}). Lo stipendio è già arrivato su entrambi i conti?`,
    })
  }
  if (scopertoCasa > 0) {
    esiti.push({
      codice: 'CASA_IN_ROSSO',
      gravita: 'attenzione',
      titolo: 'Conto casa in rosso',
      messaggio: `Intesa Frank è in rosso di ${eur(scopertoCasa)}: il bonifico 3 copre anche lo scoperto prendendo i soldi da ING (risparmio), mai dai conti sfizi.`,
    })
  }

  const bonifico1 = bonifico('1', 'intesaFrank', 'buddybank', importo1, 'Svuota Intesa Frank')
  const bonifico3 = bonifico(
    '3',
    'ing',
    'intesaFrank',
    importo3,
    scopertoCasa > 0
      ? `Budget casa (${eur(p.trasferimentoCasa)}) + copertura dello scoperto (${eur(scopertoCasa)})`
      : 'Budget casa del ciclo',
  )
  return { quotaSfizi, importo2, importo3, bonifico1, bonifico3, esiti }
}

export function calcolaTranche1(input: InputTranche1, p: ParametriCalcolo): RisultatoTranche1 {
  const { quotaSfizi, importo2, importo3, bonifico1, bonifico3, esiti } = basiTranche1(input, p)
  const saldoING = input.saldoING ?? null
  const bonifico2Previsto = p.entrataPrevistaFrank - p.quotaSfiziFrank
  let pianoAccorpato: AnteprimaPianoAccorpato | null = null

  if (importo2 > 0) {
    // Regola 1: conta solo la singola transazione in entrata, non il netto dopo il bonifico 3.
    if (importo2 < p.minimoAccreditoING) {
      const stimaQuotaMG = p.entrataPrevistaMG - p.quotaSfiziMG
      const stimaBonificoUnico = importo2 + stimaQuotaMG
      pianoAccorpato = {
        importoDifferito: importo2,
        stimaQuotaMG,
        stimaBonificoUnico,
        raggiungeMinimo: stimaBonificoUnico >= p.minimoAccreditoING,
      }
      esiti.push({
        codice: 'ACCREDITO_ING_SOTTO_MINIMO',
        gravita: 'bloccante',
        titolo: `Su ING devono entrare almeno ${eur(p.minimoAccreditoING)} in un'unica transazione`,
        messaggio:
          `Il bonifico 2 sarebbe di ${eur(importo2)}, sotto il minimo di ${eur(p.minimoAccreditoING)}. ` +
          'Non spezzarlo in bonifici più piccoli: rinvialo alla tranche 2 e accorpa la quota di MG in un unico bonifico verso ING' +
          (pianoAccorpato.raggiungeMinimo
            ? ` (circa ${eur(stimaBonificoUnico)}).`
            : `. Attenzione: anche così il bonifico unico sarebbe di circa ${eur(stimaBonificoUnico)}, ancora ${eur(p.minimoAccreditoING - stimaBonificoUnico)} sotto il minimo.`),
      })
    }
    // Regola 3: se ING restituisce alla casa più di quanto ha ricevuto, sta usando il risparmio.
    if (importo2 < importo3) {
      esiti.push({
        codice: 'ING_FINANZIA_CASA',
        gravita: 'attenzione',
        titolo: 'ING sta finanziando la casa con il risparmio',
        messaggio: `Il bonifico 2 (${eur(importo2)}) è inferiore al bonifico 3 (${eur(importo3)}): per la casa ING attinge al risparmio per ${eur(importo3 - importo2)}.`,
      })
    }
    esiti.push(...entrateDiverseDalPrevisto('Frank', '2', importo2, bonifico2Previsto))
  }

  let saldoINGDopo: Centesimi | null = null
  if (saldoING === null) {
    esiti.push(saldoINGNonInserito('verificare la soglia intoccabile e che ci siano i fondi per il bonifico 3'))
  } else if (importo2 > 0) {
    const disponibileSuING = saldoING + importo2
    saldoINGDopo = disponibileSuING - importo3
    if (disponibileSuING < importo3) {
      esiti.push({
        codice: 'ING_FONDI_INSUFFICIENTI',
        gravita: 'bloccante',
        titolo: 'Fondi insufficienti su ING',
        messaggio: `Dopo il bonifico 2 su ING ci sarebbero ${eur(disponibileSuING)}, meno dei ${eur(importo3)} del bonifico 3.`,
      })
    } else {
      esiti.push(...verificaSoglia(saldoINGDopo, p, 'Dopo la tranche 1'))
    }
  }

  return {
    bonifici: [bonifico1, bonifico('2', 'buddybank', 'ing', importo2, `Tutto tranne la quota sfizi di Frank (${eur(quotaSfizi)})`), bonifico3],
    quotaSfizi,
    restaSuBuddybank: quotaSfizi,
    restaSuIntesaFrank: p.trasferimentoCasa,
    variazioneNettaING: importo2 - importo3,
    saldoINGDopo,
    bonifico2Previsto,
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
    pianoAccorpato,
  }
}

// ---------------------------------------------------------------------------
// Tranche 1 con piano accorpato
// ---------------------------------------------------------------------------

export interface RisultatoTranche1Accorpata {
  /** Bonifici 1 e 3: il 2 è rinviato alla tranche 2. */
  bonifici: Bonifico[]
  /** Il bonifico 2 rinviato: resta fermo su Buddybank fino al bonifico unico. */
  importoDifferito: Centesimi
  quotaSfizi: Centesimi
  /** Quota sfizi + importo differito. */
  restaSuBuddybank: Centesimi
  restaSuIntesaFrank: Centesimi
  /** −bonifico 3: ING anticipa il budget casa. */
  variazioneNettaING: Centesimi
  saldoINGDopo: Centesimi | null
  stimaBonificoUnico: Centesimi
  esiti: Esito[]
  bloccato: boolean
}

export function calcolaTranche1Accorpata(input: InputTranche1, p: ParametriCalcolo): RisultatoTranche1Accorpata {
  const { quotaSfizi, importo2, importo3, bonifico1, bonifico3, esiti } = basiTranche1(input, p)
  const saldoING = input.saldoING ?? null
  const stimaBonificoUnico = importo2 + p.entrataPrevistaMG - p.quotaSfiziMG

  if (importo2 > 0) {
    esiti.push({
      codice: 'ING_ANTICIPA_CASA',
      gravita: 'attenzione',
      titolo: 'ING anticipa il budget casa',
      messaggio: `Il bonifico 2 è rinviato: ING anticipa ${eur(importo3)} per la casa attingendo al risparmio. Verranno reintegrati con il bonifico unico all'arrivo dello stipendio di MG.`,
    })
    esiti.push({
      codice: 'FONDI_VINCOLATI_SU_BUDDYBANK',
      gravita: 'info',
      titolo: 'Soldi da lasciare fermi su Buddybank',
      messaggio: `Su Buddybank restano ${eur(quotaSfizi + importo2)}: ${eur(quotaSfizi)} sono sfizi di Frank, gli altri ${eur(importo2)} vanno lasciati fermi per il bonifico unico verso ING.`,
    })
    if (stimaBonificoUnico < p.minimoAccreditoING) {
      esiti.push({
        codice: 'ACCREDITO_ING_SOTTO_MINIMO_ANCHE_ACCORPANDO',
        gravita: 'attenzione',
        titolo: `Anche accorpando si resterebbe sotto ${eur(p.minimoAccreditoING)}`,
        messaggio: `Con la quota di MG prevista (${eur(p.entrataPrevistaMG - p.quotaSfiziMG)}) il bonifico unico sarebbe di circa ${eur(stimaBonificoUnico)}: servono circa ${eur(p.minimoAccreditoING - stimaBonificoUnico)} in più.`,
      })
    }
  }

  let saldoINGDopo: Centesimi | null = null
  if (saldoING === null) {
    esiti.push(saldoINGNonInserito('verificare che possa anticipare il budget casa senza intaccare la soglia'))
  } else {
    saldoINGDopo = saldoING - importo3
    if (saldoING < importo3) {
      esiti.push({
        codice: 'ING_FONDI_INSUFFICIENTI',
        gravita: 'bloccante',
        titolo: 'Fondi insufficienti su ING',
        messaggio: `ING ha ${eur(saldoING)}: non basta ad anticipare i ${eur(importo3)} del bonifico 3.`,
      })
    } else {
      esiti.push(...verificaSoglia(saldoINGDopo, p, "Dopo l'anticipo per la casa"))
    }
  }

  return {
    bonifici: [bonifico1, bonifico3],
    importoDifferito: importo2,
    quotaSfizi,
    restaSuBuddybank: quotaSfizi + importo2,
    restaSuIntesaFrank: p.trasferimentoCasa,
    variazioneNettaING: -importo3,
    saldoINGDopo,
    stimaBonificoUnico,
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
  }
}

// ---------------------------------------------------------------------------
// Tranche 2 — all'arrivo dello stipendio di MG
// ---------------------------------------------------------------------------

export interface InputTranche2 {
  saldoIntesaMG: Centesimi
  /** Avanzo sfizi di MG rilevato alla chiusura del ciclo precedente (0 se non ce n'è). */
  residuoSfiziMG: Centesimi
  /** Facoltativo: serve per verificare la soglia. */
  saldoING?: Centesimi | null
}

export interface RisultatoTranche2 {
  /** Bonifico 4. */
  bonifici: Bonifico[]
  /** Quota sfizi + residuo: resta su Intesa MG. */
  quotaSfizi: Centesimi
  restaSuIntesaMG: Centesimi
  /** Bonifico 4. */
  variazioneNettaING: Centesimi
  saldoINGDopo: Centesimi | null
  bonifico4Previsto: Centesimi
  esiti: Esito[]
  bloccato: boolean
}

/** Parti della tranche 2 comuni al piano standard e a quello accorpato. */
function basiTranche2(input: InputTranche2, p: ParametriCalcolo) {
  const quotaSfizi = p.quotaSfiziMG + input.residuoSfiziMG
  const importo4 = input.saldoIntesaMG - quotaSfizi
  const esiti: Esito[] = [...verificaQuotaSfizi('MG', input.saldoIntesaMG, input.residuoSfiziMG, quotaSfizi)]
  if (importo4 <= 0) {
    esiti.push({
      codice: 'SALDI_INSUFFICIENTI',
      gravita: 'bloccante',
      titolo: 'Saldo insufficiente',
      messaggio: `Intesa MG ha ${eur(input.saldoIntesaMG)}: non basta a coprire la quota sfizi di MG (${eur(quotaSfizi)}). Lo stipendio di MG è già arrivato?`,
    })
  }
  return { quotaSfizi, importo4, esiti }
}

export function calcolaTranche2(input: InputTranche2, p: ParametriCalcolo): RisultatoTranche2 {
  const { quotaSfizi, importo4, esiti } = basiTranche2(input, p)
  const saldoING = input.saldoING ?? null
  const bonifico4Previsto = p.entrataPrevistaMG - p.quotaSfiziMG

  if (importo4 > 0) {
    esiti.push(...entrateDiverseDalPrevisto('MG', '4', importo4, bonifico4Previsto))
  }

  let saldoINGDopo: Centesimi | null = null
  if (saldoING === null) {
    esiti.push(saldoINGNonInserito('verificare la soglia intoccabile'))
  } else if (importo4 > 0) {
    saldoINGDopo = saldoING + importo4
    esiti.push(...verificaSoglia(saldoINGDopo, p, 'Dopo la tranche 2'))
  }

  return {
    bonifici: [bonifico('4', 'intesaMG', 'ing', importo4, `Tutto tranne la quota sfizi di MG (${eur(quotaSfizi)})`)],
    quotaSfizi,
    restaSuIntesaMG: quotaSfizi,
    variazioneNettaING: importo4,
    saldoINGDopo,
    bonifico4Previsto,
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
  }
}

// ---------------------------------------------------------------------------
// Tranche 2 con piano accorpato
// ---------------------------------------------------------------------------

export interface InputTranche2Accorpata extends InputTranche2 {
  /** Il bonifico 2 rinviato dalla tranche 1. */
  importoDifferito: Centesimi
  /** Il bonifico 3 anticipato da ING alla tranche 1. */
  anticipoCasa: Centesimi
  /** Facoltativo: serve per verificare che su Buddybank ci sia ancora l'importo differito. */
  saldoBuddybank?: Centesimi | null
}

export interface RisultatoTranche2Accorpata {
  /** Bonifico 4 (Intesa MG → Buddybank) e bonifico unico 2+4 (Buddybank → ING). */
  bonifici: Bonifico[]
  quotaSfizi: Centesimi
  restaSuIntesaMG: Centesimi
  importoBonificoUnico: Centesimi
  /** Il bonifico unico. */
  variazioneNettaING: Centesimi
  saldoINGDopo: Centesimi | null
  esiti: Esito[]
  bloccato: boolean
}

export function calcolaTranche2Accorpata(input: InputTranche2Accorpata, p: ParametriCalcolo): RisultatoTranche2Accorpata {
  const { quotaSfizi, importo4, esiti } = basiTranche2(input, p)
  const saldoING = input.saldoING ?? null
  const saldoBuddybank = input.saldoBuddybank ?? null
  const importoUnico = input.importoDifferito + importo4

  if (importo4 > 0) {
    if (importoUnico < p.minimoAccreditoING) {
      esiti.push({
        codice: 'ACCREDITO_ING_SOTTO_MINIMO_ANCHE_ACCORPANDO',
        gravita: 'bloccante',
        titolo: `Il bonifico unico non raggiunge ${eur(p.minimoAccreditoING)}`,
        messaggio: `Il bonifico unico verso ING sarebbe di ${eur(importoUnico)}, sotto il minimo di ${eur(p.minimoAccreditoING)} in un'unica transazione. Non spezzarlo: servono altri ${eur(p.minimoAccreditoING - importoUnico)} su Buddybank prima di farlo.`,
      })
    }
    if (saldoBuddybank !== null && saldoBuddybank + importo4 < importoUnico) {
      const disponibile = saldoBuddybank + importo4
      esiti.push({
        codice: 'BUDDYBANK_INSUFFICIENTE',
        gravita: 'bloccante',
        titolo: 'Su Buddybank manca una parte del bonifico unico',
        messaggio: `Dopo il bonifico 4 su Buddybank ci sarebbero ${eur(disponibile)}, meno dei ${eur(importoUnico)} del bonifico unico: mancano ${eur(importoUnico - disponibile)}. Parte dei soldi da girare su ING è stata spesa?`,
      })
    }
    if (importoUnico < input.anticipoCasa) {
      esiti.push({
        codice: 'ING_FINANZIA_CASA',
        gravita: 'attenzione',
        titolo: 'ING sta finanziando la casa con il risparmio',
        messaggio: `Il bonifico unico (${eur(importoUnico)}) non basta a reintegrare i ${eur(input.anticipoCasa)} anticipati per la casa: ING attinge al risparmio per ${eur(input.anticipoCasa - importoUnico)}.`,
      })
    }
  }

  let saldoINGDopo: Centesimi | null = null
  if (saldoING === null) {
    esiti.push(saldoINGNonInserito('verificare la soglia intoccabile'))
  } else if (importo4 > 0) {
    saldoINGDopo = saldoING + importoUnico
    esiti.push(...verificaSoglia(saldoINGDopo, p, 'Dopo il bonifico unico'))
  }

  return {
    bonifici: [
      bonifico('4', 'intesaMG', 'buddybank', importo4, `Quota di MG da accorpare, tolta la quota sfizi (${eur(quotaSfizi)})`),
      bonifico('2+4', 'buddybank', 'ing', importoUnico, `Bonifico unico: ${eur(input.importoDifferito)} di Frank + ${eur(importo4)} di MG`),
    ],
    quotaSfizi,
    restaSuIntesaMG: quotaSfizi,
    importoBonificoUnico: importoUnico,
    variazioneNettaING: importoUnico,
    saldoINGDopo,
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
  }
}

// ---------------------------------------------------------------------------
// Verifica di fine ciclo
// ---------------------------------------------------------------------------

export interface VerificaFineCiclo {
  variazioneTranche1: Centesimi
  variazioneTranche2: Centesimi
  totale: Centesimi
  target: Centesimi
  /** Totale − target: positivo = risparmio in più, negativo = sotto il target. */
  scarto: Centesimi
  esito: Esito
}

/** Somma le variazioni nette di ING delle due tranche e le confronta con il target (767 €). */
export function verificaFineCiclo(
  variazioneTranche1: Centesimi,
  variazioneTranche2: Centesimi,
  p: Pick<ParametriCalcolo, 'targetING'>,
): VerificaFineCiclo {
  const totale = variazioneTranche1 + variazioneTranche2
  const scarto = totale - p.targetING
  let esito: Esito
  if (scarto > 0) {
    esito = {
      codice: 'RISPARMIO_EXTRA',
      gravita: 'ok',
      titolo: `Risparmio extra: ${eur(scarto, { segno: true })}`,
      messaggio: `Su ING sono entrati netti ${eur(totale)}, ${eur(scarto)} in più rispetto al target di ${eur(p.targetING)}: gli stipendi sono stati più alti del previsto e l'eccedenza è risparmio in più.`,
    }
  } else if (scarto < 0) {
    esito = {
      codice: 'SOTTO_TARGET',
      gravita: 'attenzione',
      titolo: `Sotto il target di ${eur(-scarto)}`,
      messaggio: `Su ING sono entrati netti ${eur(totale)}, ${eur(-scarto)} in meno rispetto al target di ${eur(p.targetING)}.`,
    }
  } else {
    esito = {
      codice: 'IN_LINEA_CON_TARGET',
      gravita: 'ok',
      titolo: 'In linea con il target',
      messaggio: `Su ING sono entrati netti ${eur(totale)}, esattamente il target del ciclo.`,
    }
  }
  return { variazioneTranche1, variazioneTranche2, totale, target: p.targetING, scarto, esito }
}

// ---------------------------------------------------------------------------
// Copertura di uno sforamento della casa
// ---------------------------------------------------------------------------

export interface RisultatoCopertura {
  /** Sempre da ING verso Intesa Frank: mai dai conti sfizi. `null` se non c'è niente da coprire. */
  bonifico: Bonifico | null
  /** Quanto si può prendere da ING senza intaccare la soglia (`null` se il saldo ING non è noto). */
  coperturaMassima: Centesimi | null
  saldoINGDopo: Centesimi | null
  esiti: Esito[]
  bloccato: boolean
}

/** Come coprire uno sforamento del conto casa: il buffer si prende dal risparmio su ING, mai dai conti sfizi. */
export function calcolaCoperturaSforamento(
  importoMancante: Centesimi,
  saldoING: Centesimi | null,
  p: ParametriCalcolo,
): RisultatoCopertura {
  if (importoMancante <= 0) {
    return { bonifico: null, coperturaMassima: null, saldoINGDopo: saldoING, esiti: [], bloccato: false }
  }
  const esiti: Esito[] = [{
    codice: 'SFORAMENTO_CASA',
    gravita: 'attenzione',
    titolo: 'Sforamento del conto casa',
    messaggio: `Mancano ${eur(importoMancante)} sul conto casa: si coprono con un giroconto da ING (risparmio), mai dai conti sfizi.`,
  }]
  let coperturaMassima: Centesimi | null = null
  let saldoINGDopo: Centesimi | null = null
  if (saldoING === null) {
    esiti.push(saldoINGNonInserito('verificare che il risparmio basti a coprire lo sforamento'))
  } else {
    coperturaMassima = Math.max(0, risparmioReale(saldoING, p.sogliaING))
    saldoINGDopo = saldoING - importoMancante
    if (importoMancante > coperturaMassima) {
      esiti.push({
        codice: 'RISPARMIO_INSUFFICIENTE',
        gravita: 'bloccante',
        titolo: 'Il risparmio non basta a coprire lo sforamento',
        messaggio: `Sopra la soglia intoccabile di ${eur(p.sogliaING)} su ING ci sono ${eur(coperturaMassima)}: si possono coprire al massimo ${eur(coperturaMassima)} dei ${eur(importoMancante)} mancanti. Il resto non può venire dai conti sfizi.`,
      })
    } else {
      esiti.push(...verificaSoglia(saldoINGDopo, p, 'Dopo la copertura'))
    }
  }
  return {
    bonifico: bonifico('C', 'ing', 'intesaFrank', importoMancante, 'Copertura sforamento casa (dal risparmio)'),
    coperturaMassima,
    saldoINGDopo,
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
  }
}

// ---------------------------------------------------------------------------
// Chiusura del ciclo
// ---------------------------------------------------------------------------

export interface InputChiusura {
  saldoING: Centesimi
  saldoIntesaFrank: Centesimi
  saldoBuddybank: Centesimi
  saldoIntesaMG: Centesimi
}

export interface RisultatoChiusura {
  /** Giroconto dell'avanzo casa verso ING, oppure copertura dello sforamento da ING. */
  bonifici: Bonifico[]
  avanzoCasa: Centesimi
  sforamentoCasa: Centesimi
  /** Da precompilare come residuo sfizi nel ciclo successivo. */
  residuoSfiziFrank: Centesimi
  residuoSfiziMG: Centesimi
  /** Saldi dopo i giroconti di chiusura. */
  saldiDopo: Saldi
  risparmioReale: Centesimi
  esiti: Esito[]
  bloccato: boolean
}

export function calcolaChiusura(input: InputChiusura, p: ParametriCalcolo): RisultatoChiusura {
  const avanzoCasa = Math.max(0, input.saldoIntesaFrank)
  const sforamentoCasa = Math.max(0, -input.saldoIntesaFrank)
  const esiti: Esito[] = []
  const bonifici: Bonifico[] = []

  if (avanzoCasa > 0) {
    // Regola 5: l'avanzo del conto casa va su ING, non resta sul conto.
    bonifici.push(bonifico('A', 'intesaFrank', 'ing', avanzoCasa, 'Avanzo del conto casa'))
    esiti.push({
      codice: 'AVANZO_CASA',
      gravita: 'info',
      titolo: 'Avanzo sul conto casa',
      messaggio: `Su Intesa Frank sono avanzati ${eur(avanzoCasa)}: girali su ING, non lasciarli sul conto casa.`,
    })
  }
  if (sforamentoCasa > 0) {
    // Regola 6: lo sforamento si copre dal risparmio su ING, mai dai conti sfizi.
    const copertura = calcolaCoperturaSforamento(sforamentoCasa, input.saldoING, p)
    if (copertura.bonifico) bonifici.push(copertura.bonifico)
    esiti.push(...copertura.esiti)
  }

  const saldoINGDopo = input.saldoING + avanzoCasa - sforamentoCasa
  if (sforamentoCasa === 0) {
    // Con uno sforamento la soglia l'ha già verificata la copertura.
    esiti.push(...verificaSoglia(saldoINGDopo, p, 'A fine ciclo', 'attenzione'))
  }

  for (const [persona, saldo] of [['Frank', input.saldoBuddybank], ['MG', input.saldoIntesaMG]] as const) {
    if (saldo < 0) {
      esiti.push({
        codice: 'SFIZI_IN_ROSSO',
        gravita: 'attenzione',
        titolo: `Sfizi di ${persona} in rosso`,
        messaggio: `${NOME_CONTO[CONTO_SFIZI[persona]]} è in rosso di ${eur(-saldo)}: il residuo negativo verrà scalato dalla quota sfizi di ${persona} del prossimo ciclo.`,
      })
    }
  }

  return {
    bonifici,
    avanzoCasa,
    sforamentoCasa,
    residuoSfiziFrank: input.saldoBuddybank,
    residuoSfiziMG: input.saldoIntesaMG,
    saldiDopo: {
      ing: saldoINGDopo,
      intesaFrank: 0,
      buddybank: input.saldoBuddybank,
      intesaMG: input.saldoIntesaMG,
    },
    risparmioReale: risparmioReale(saldoINGDopo, p.sogliaING),
    esiti: ordina(esiti),
    bloccato: bloccato(esiti),
  }
}
