import { describe, expect, it } from 'vitest'
import { euro } from '../dominio/denaro.ts'
import {
  annullaCopertura,
  calcolaVerifica,
  calcolaVistaChiusura,
  calcolaVistaTranche1,
  calcolaVistaTranche2,
  chiudiCiclo,
  faseCorrente,
  impostaCampoChiusura,
  impostaCampoTranche1,
  impostaCampoTranche2,
  registraCopertura,
  riapriTranche1,
  riapriTranche2,
  scegliModalita,
  segnaBonificoChiusura,
  segnaBonificoTranche1,
  segnaBonificoTranche2,
  statoIniziale,
} from './ciclo.ts'
import type { SaldiRegistrati, StatoApp } from './modello.ts'

const T0 = '2026-09-27T08:00:00.000Z'
const T1 = '2026-09-27T08:05:00.000Z'
const T2 = '2026-10-07T09:00:00.000Z'
const T3 = '2026-10-26T20:00:00.000Z'

function conSaldoING(stato: StatoApp, importo: number): StatoApp {
  return { ...stato, saldi: { ...stato.saldi, ing: { importo, aggiornatoIl: T0 } } }
}

function importi(saldi: SaldiRegistrati) {
  return {
    ing: saldi.ing?.importo ?? null,
    intesaFrank: saldi.intesaFrank?.importo ?? null,
    buddybank: saldi.buddybank?.importo ?? null,
    intesaMG: saldi.intesaMG?.importo ?? null,
  }
}

/** Stato con la tranche 1 standard compilata: 900 € su Buddybank, 700 € su Intesa Frank, ING 3.000 €. */
function tranche1Compilata(): StatoApp {
  let stato = conSaldoING(statoIniziale(T0, 'ciclo-1'), euro(3000))
  stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(900))
  stato = impostaCampoTranche1(stato, 'saldoIntesaFrank', euro(700))
  return stato
}

function segnaTutti(stato: StatoApp, tranche: 1 | 2, adesso: string): StatoApp {
  const vista = tranche === 1
    ? calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)
    : calcolaVistaTranche2(stato.cicloCorrente, stato.saldi)
  if (!vista) throw new Error('vista non disponibile')
  for (const b of vista.risultato.bonifici.filter((x) => x.necessario)) {
    stato = tranche === 1
      ? segnaBonificoTranche1(stato, b.numero, true, adesso)
      : segnaBonificoTranche2(stato, b.numero, true, adesso)
  }
  return stato
}

describe('stato iniziale', () => {
  it('parte dalla tranche 1 con residui a zero e saldi sconosciuti', () => {
    const stato = statoIniziale(T0, 'ciclo-1')
    expect(faseCorrente(stato.cicloCorrente)).toBe('tranche1')
    expect(stato.cicloCorrente.tranche1.bozza.residuoSfiziFrank).toBe(0)
    expect(stato.cicloCorrente.tranche2.bozza.residuoSfiziMG).toBe(0)
    expect(importi(stato.saldi)).toEqual({ ing: null, intesaFrank: null, buddybank: null, intesaMG: null })
    expect(stato.cicloCorrente.parametri.trasferimentoCasa).toBe(euro(1213))
  })

  it('non calcola nulla finché mancano i saldi di Buddybank e Intesa Frank', () => {
    let stato = statoIniziale(T0, 'ciclo-1')
    expect(calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)).toBeNull()
    stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(900))
    expect(calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)).toBeNull()
  })
})

describe('ciclo standard completo', () => {
  it('tranche 1: usa il saldo ING registrato se non viene inserito', () => {
    const stato = tranche1Compilata()
    const vista = calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)
    expect(vista?.modalita).toBe('standard')
    expect(vista?.risultato.saldoINGDopo).toBe(euro(3277))
  })

  it('tranche 1: si completa quando tutti i bonifici sono segnati e aggiorna i saldi', () => {
    let stato = tranche1Compilata()
    stato = segnaBonificoTranche1(stato, '1', true, T1)
    stato = segnaBonificoTranche1(stato, '2', true, T1)
    expect(stato.cicloCorrente.tranche1.completata).toBeNull()
    stato = segnaBonificoTranche1(stato, '3', true, T1)

    const completata = stato.cicloCorrente.tranche1.completata
    expect(completata?.bonifici.map((b) => [b.numero, b.importo])).toEqual([
      ['1', euro(700)],
      ['2', euro(1490)],
      ['3', euro(1213)],
    ])
    expect(completata?.variazioneNettaING).toBe(euro(277))
    expect(completata?.anticipoCasa).toBe(euro(1213))
    expect(importi(stato.saldi)).toEqual({ ing: euro(3277), intesaFrank: euro(1213), buddybank: euro(110), intesaMG: null })
    expect(stato.saldi.buddybank?.aggiornatoIl).toBe(T1)
    expect(faseCorrente(stato.cicloCorrente)).toBe('tranche2')
  })

  it('tranche 1: dopo il primo segno i saldi non si possono più cambiare e il saldo ING entra nella bozza', () => {
    let stato = segnaBonificoTranche1(tranche1Compilata(), '1', true, T1)
    expect(stato.cicloCorrente.tranche1.bozza.saldoING).toBe(euro(3000))
    const prima = stato
    stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(1))
    expect(stato).toBe(prima)
  })

  it('tranche 1: togliere un segno riapre la tranche e ripristina i saldi', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    stato = segnaBonificoTranche1(stato, '3', false, T1)
    expect(stato.cicloCorrente.tranche1.completata).toBeNull()
    expect(stato.cicloCorrente.tranche1.eseguiti).toEqual(['1', '2'])
    expect(importi(stato.saldi)).toEqual({ ing: euro(3000), intesaFrank: null, buddybank: null, intesaMG: null })
    expect(stato.saldi.ing?.aggiornatoIl).toBe(T0)
  })

  it('tranche 1: riaprire toglie tutti i segni e sblocca i campi', () => {
    let stato = riapriTranche1(segnaTutti(tranche1Compilata(), 1, T1))
    expect(stato.cicloCorrente.tranche1.eseguiti).toEqual([])
    expect(stato.cicloCorrente.tranche1.completata).toBeNull()
    expect(importi(stato.saldi).buddybank).toBeNull()
    stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(950))
    expect(stato.cicloCorrente.tranche1.bozza.saldoBuddybank).toBe(euro(950))
  })

  it('tranche 2: usa il saldo ING dopo la tranche 1 e completa il ciclo sul target', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    expect(calcolaVistaTranche2(stato.cicloCorrente, stato.saldi)).toBeNull()
    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    const vista = calcolaVistaTranche2(stato.cicloCorrente, stato.saldi)
    expect(vista?.modalita).toBe('standard')
    expect(vista?.risultato.bonifici.map((b) => [b.numero, b.importo])).toEqual([['4', euro(490)]])

    stato = segnaBonificoTranche2(stato, '4', true, T2)
    expect(stato.cicloCorrente.tranche2.completata?.variazioneNettaING).toBe(euro(490))
    expect(importi(stato.saldi)).toEqual({ ing: euro(3767), intesaFrank: euro(1213), buddybank: euro(110), intesaMG: euro(110) })
    expect(faseCorrente(stato.cicloCorrente)).toBe('chiusura')
    expect(calcolaVerifica(stato.cicloCorrente)?.esito.codice).toBe('IN_LINEA_CON_TARGET')
  })

  it('dopo il primo segno della tranche 2 la tranche 1 non si può più toccare', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    stato = segnaBonificoTranche2(stato, '4', true, T2)
    expect(segnaBonificoTranche1(stato, '3', false, T2)).toBe(stato)
    expect(riapriTranche1(stato)).toBe(stato)
    // Riaprendo prima la tranche 2 si ripristinano i suoi saldi e la tranche 1 torna modificabile.
    stato = riapriTranche2(stato)
    expect(importi(stato.saldi)).toEqual({ ing: euro(3277), intesaFrank: euro(1213), buddybank: euro(110), intesaMG: null })
    expect(riapriTranche1(stato).cicloCorrente.tranche1.completata).toBeNull()
  })

  it('chiusura: gira l’avanzo su ING, archivia il ciclo e ne avvia uno nuovo con i residui', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    stato = segnaTutti(stato, 2, T2)

    // A fine mese: il mutuo è stato addebitato, sono avanzati 85,40 € in casa.
    stato = impostaCampoChiusura(stato, 'saldoING', euro(3330))
    stato = impostaCampoChiusura(stato, 'saldoIntesaFrank', euro(85.4))
    stato = impostaCampoChiusura(stato, 'saldoBuddybank', euro(23.5))
    expect(calcolaVistaChiusura(stato.cicloCorrente)).toBeNull()
    stato = impostaCampoChiusura(stato, 'saldoIntesaMG', euro(41.2))
    const vista = calcolaVistaChiusura(stato.cicloCorrente)
    expect(vista?.bonifici.map((b) => [b.numero, b.da, b.a, b.importo])).toEqual([['A', 'intesaFrank', 'ing', euro(85.4)]])

    stato = segnaBonificoChiusura(stato, 'A', true)
    stato = chiudiCiclo(stato, T3, 'ciclo-2')

    expect(stato.cicliChiusi).toHaveLength(1)
    const archiviato = stato.cicliChiusi[0]
    expect(archiviato.id).toBe('ciclo-1')
    expect(archiviato.chiusoIl).toBe(T3)
    expect(archiviato.tranche1.bonifici).toHaveLength(3)
    expect(archiviato.tranche2.bonifici).toHaveLength(1)
    expect(archiviato.chiusura.bonifici.map((b) => b.numero)).toEqual(['A'])
    expect(archiviato.chiusura.saldiDopo).toEqual({ ing: euro(3415.4), intesaFrank: 0, buddybank: euro(23.5), intesaMG: euro(41.2) })
    expect(archiviato.verifica).toEqual({ totale: euro(767), target: euro(767), scarto: 0 })

    const nuovo = stato.cicloCorrente
    expect(nuovo.id).toBe('ciclo-2')
    expect(nuovo.avviatoIl).toBe(T3)
    expect(faseCorrente(nuovo)).toBe('tranche1')
    expect(nuovo.residuiIniziali).toEqual({ frank: euro(23.5), mg: euro(41.2) })
    expect(nuovo.tranche1.bozza.residuoSfiziFrank).toBe(euro(23.5))
    expect(nuovo.tranche2.bozza.residuoSfiziMG).toBe(euro(41.2))
    expect(importi(stato.saldi)).toEqual({ ing: euro(3415.4), intesaFrank: 0, buddybank: euro(23.5), intesaMG: euro(41.2) })
  })

  it('chiusura: un giroconto non segnato non viene applicato ai saldi', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    stato = segnaTutti(stato, 2, T2)
    for (const [campo, valore] of [['saldoING', 3330], ['saldoIntesaFrank', 85.4], ['saldoBuddybank', 0], ['saldoIntesaMG', 0]] as const) {
      stato = impostaCampoChiusura(stato, campo, euro(valore))
    }
    stato = chiudiCiclo(stato, T3, 'ciclo-2')
    expect(stato.cicliChiusi[0].chiusura.bonifici).toEqual([])
    expect(importi(stato.saldi)).toMatchObject({ ing: euro(3330), intesaFrank: euro(85.4) })
  })

  it('non si può chiudere il ciclo prima della tranche 2', () => {
    const stato = segnaTutti(tranche1Compilata(), 1, T1)
    expect(chiudiCiclo(stato, T3, 'ciclo-2')).toBe(stato)
  })

  it('il ciclo in corso usa i parametri fissati all’avvio; il successivo quelli nuovi', () => {
    let stato = tranche1Compilata()
    stato = { ...stato, configurazione: { ...stato.configurazione, minimoAccreditoING: euro(1500) } }
    // 1.490 € resta valido per il ciclo in corso, avviato con il minimo a 1.000 €.
    expect(calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)?.risultato.bloccato).toBe(false)

    stato = segnaTutti(stato, 1, T1)
    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    stato = segnaTutti(stato, 2, T2)
    for (const campo of ['saldoING', 'saldoIntesaFrank', 'saldoBuddybank', 'saldoIntesaMG'] as const) {
      stato = impostaCampoChiusura(stato, campo, campo === 'saldoING' ? euro(3330) : 0)
    }
    stato = chiudiCiclo(stato, T3, 'ciclo-2')
    expect(stato.cicloCorrente.parametri.minimoAccreditoING).toBe(euro(1500))
  })
})

describe('piano accorpato', () => {
  /** Bonifico 2 = 940 €: sotto il minimo di 1.000 €. */
  function statoSottoMinimo(): StatoApp {
    let stato = conSaldoING(statoIniziale(T0, 'ciclo-1'), euro(3000))
    stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(500))
    stato = impostaCampoTranche1(stato, 'saldoIntesaFrank', euro(550))
    return stato
  }

  it('il piano standard bloccato non permette di segnare i bonifici', () => {
    const stato = statoSottoMinimo()
    expect(calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)?.risultato.bloccato).toBe(true)
    expect(segnaBonificoTranche1(stato, '1', true, T1)).toBe(stato)
  })

  it('porta a un unico bonifico verso ING alla tranche 2', () => {
    let stato = scegliModalita(statoSottoMinimo(), 'accorpato')
    const vista1 = calcolaVistaTranche1(stato.cicloCorrente, stato.saldi)
    expect(vista1?.modalita).toBe('accorpato')
    expect(vista1?.risultato.bonifici.map((b) => b.numero)).toEqual(['1', '3'])

    stato = segnaTutti(stato, 1, T1)
    const tranche1 = stato.cicloCorrente.tranche1.completata
    expect(tranche1?.modalita).toBe('accorpato')
    expect(tranche1?.importoDifferito).toBe(euro(940))
    expect(tranche1?.anticipoCasa).toBe(euro(1213))
    expect(importi(stato.saldi)).toEqual({ ing: euro(1787), intesaFrank: euro(1213), buddybank: euro(1050), intesaMG: null })

    stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
    const vista2 = calcolaVistaTranche2(stato.cicloCorrente, stato.saldi)
    expect(vista2?.modalita).toBe('accorpato')
    expect(vista2?.risultato.bonifici.map((b) => [b.numero, b.da, b.a, b.importo])).toEqual([
      ['4', 'intesaMG', 'buddybank', euro(490)],
      ['2+4', 'buddybank', 'ing', euro(1430)],
    ])

    stato = segnaTutti(stato, 2, T2)
    expect(importi(stato.saldi)).toEqual({ ing: euro(3217), intesaFrank: euro(1213), buddybank: euro(110), intesaMG: euro(110) })
    expect(calcolaVerifica(stato.cicloCorrente)?.totale).toBe(euro(217))
  })

  it('non si cambia piano dopo aver segnato un bonifico', () => {
    let stato = segnaBonificoTranche1(scegliModalita(statoSottoMinimo(), 'accorpato'), '1', true, T1)
    stato = scegliModalita(stato, 'standard')
    expect(stato.cicloCorrente.modalita).toBe('accorpato')
  })
})

describe('coperture di uno sforamento', () => {
  it('sposta il saldo da ING al conto casa e si può annullare', () => {
    let stato = segnaTutti(tranche1Compilata(), 1, T1)
    stato = registraCopertura(stato, euro(50), 'cop-1', T2)
    expect(stato.cicloCorrente.coperture).toEqual([{ id: 'cop-1', importo: euro(50), eseguitaIl: T2 }])
    expect(importi(stato.saldi)).toMatchObject({ ing: euro(3227), intesaFrank: euro(1263) })

    stato = annullaCopertura(stato, 'cop-1', T2)
    expect(stato.cicloCorrente.coperture).toEqual([])
    expect(importi(stato.saldi)).toMatchObject({ ing: euro(3277), intesaFrank: euro(1213) })
  })

  it('ignora importi nulli o negativi', () => {
    const stato = tranche1Compilata()
    expect(registraCopertura(stato, 0, 'x', T1)).toBe(stato)
    expect(registraCopertura(stato, -100, 'x', T1)).toBe(stato)
  })
})
