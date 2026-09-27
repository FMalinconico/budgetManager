import { describe, expect, it } from 'vitest'
import { euro } from '../dominio/denaro.ts'
import {
  chiudiCiclo,
  impostaCampoChiusura,
  impostaCampoTranche1,
  impostaCampoTranche2,
  segnaBonificoChiusura,
  segnaBonificoTranche1,
  segnaBonificoTranche2,
  statoIniziale,
} from './ciclo.ts'
import type { StatoApp } from './modello.ts'
import { CHIAVE_STATO, caricaStato, salvaStato, validaStatoApp, type Archivio } from './persistenza.ts'

const ADESSO = '2026-09-27T08:00:00.000Z'
const crea = () => statoIniziale(ADESSO, 'nuovo')

function archivioInMemoria(iniziale: Record<string, string> = {}) {
  const dati = new Map(Object.entries(iniziale))
  return {
    dati,
    getItem: (chiave: string) => dati.get(chiave) ?? null,
    setItem: (chiave: string, valore: string) => void dati.set(chiave, valore),
  } satisfies Archivio & { dati: Map<string, string> }
}

/** Uno stato con dentro tutto: tranche completate, chiusura, ciclo archiviato. */
function statoCompleto(): StatoApp {
  let stato: StatoApp = { ...statoIniziale(ADESSO, 'ciclo-1') }
  stato = { ...stato, saldi: { ...stato.saldi, ing: { importo: euro(3000), aggiornatoIl: ADESSO } } }
  stato = impostaCampoTranche1(stato, 'saldoBuddybank', euro(900))
  stato = impostaCampoTranche1(stato, 'saldoIntesaFrank', euro(700))
  for (const n of ['1', '2', '3']) stato = segnaBonificoTranche1(stato, n, true, ADESSO)
  stato = impostaCampoTranche2(stato, 'saldoIntesaMG', euro(600))
  stato = segnaBonificoTranche2(stato, '4', true, ADESSO)
  stato = impostaCampoChiusura(stato, 'saldoING', euro(3330))
  stato = impostaCampoChiusura(stato, 'saldoIntesaFrank', euro(85.4))
  stato = impostaCampoChiusura(stato, 'saldoBuddybank', euro(23.5))
  stato = impostaCampoChiusura(stato, 'saldoIntesaMG', euro(41.2))
  stato = segnaBonificoChiusura(stato, 'A', true)
  return chiudiCiclo(stato, ADESSO, 'ciclo-2')
}

describe('validaStatoApp', () => {
  it('accetta lo stato iniziale e uno stato con un ciclo archiviato', () => {
    expect(validaStatoApp(JSON.parse(JSON.stringify(crea())))).toEqual(crea())
    const completo = statoCompleto()
    expect(completo.cicliChiusi).toHaveLength(1)
    expect(validaStatoApp(JSON.parse(JSON.stringify(completo)))).toEqual(completo)
  })

  it.each([
    ['una versione diversa', (s: any) => { s.versione = 2 }],
    ['un campo mancante', (s: any) => { delete s.cicloCorrente }],
    ['un importo con decimali', (s: any) => { s.configurazione.entrate[0].importo = 900.5 }],
    ['un importo scritto come testo', (s: any) => { s.cicloCorrente.tranche1.bozza.saldoBuddybank = '900' }],
    ['un conto sconosciuto', (s: any) => { s.configurazione.speseFisse[0].conto = 'buddybank' }],
    ['una modalità sconosciuta', (s: any) => { s.cicloCorrente.modalita = 'misto' }],
    ['un bonifico malformato', (s: any) => { s.cicliChiusi[0].tranche1.bonifici[0].da = 'unicredit' }],
    ['un saldo precedente di un conto sconosciuto', (s: any) => { s.cicliChiusi[0].tranche1.saldiRegistratiPrima = { unicredit: null } }],
  ])('rifiuta %s', (_, guasta) => {
    const dati = JSON.parse(JSON.stringify(statoCompleto()))
    guasta(dati)
    expect(validaStatoApp(dati)).toBeNull()
  })

  it('rifiuta valori che non sono oggetti', () => {
    expect(validaStatoApp(null)).toBeNull()
    expect(validaStatoApp([])).toBeNull()
    expect(validaStatoApp('ciao')).toBeNull()
  })
})

describe('caricaStato e salvaStato', () => {
  it('senza dati salvati parte dallo stato iniziale, senza avvisi', () => {
    const esito = caricaStato(archivioInMemoria(), crea, ADESSO)
    expect(esito).toEqual({ stato: crea(), avviso: null })
  })

  it('ricarica quello che ha salvato', () => {
    const archivio = archivioInMemoria()
    const stato = statoCompleto()
    expect(salvaStato(archivio, stato)).toBe(true)
    expect(caricaStato(archivio, crea, ADESSO)).toEqual({ stato, avviso: null })
  })

  it('non riscrive se non è cambiato niente', () => {
    const archivio = archivioInMemoria()
    let scritture = 0
    const contaScritture: Archivio = {
      getItem: archivio.getItem,
      setItem: (k, v) => { scritture++; archivio.setItem(k, v) },
    }
    const stato = crea()
    salvaStato(contaScritture, stato)
    salvaStato(contaScritture, stato)
    expect(scritture).toBe(1)
  })

  it('con dati illeggibili ne conserva una copia e riparte da zero', () => {
    const archivio = archivioInMemoria({ [CHIAVE_STATO]: '{"versione":1,' })
    const esito = caricaStato(archivio, crea, ADESSO)
    expect(esito.stato).toEqual(crea())
    expect(esito.avviso).toContain('copia')
    expect(archivio.dati.get(`${CHIAVE_STATO}/illeggibile-${ADESSO}`)).toBe('{"versione":1,')
  })

  it('con dati di forma sbagliata ne conserva una copia e riparte da zero', () => {
    const archivio = archivioInMemoria({ [CHIAVE_STATO]: JSON.stringify({ versione: 1 }) })
    const esito = caricaStato(archivio, crea, ADESSO)
    expect(esito.stato).toEqual(crea())
    expect(esito.avviso).not.toBeNull()
  })

  it('senza archivio avvisa che i dati non verranno salvati', () => {
    expect(caricaStato(null, crea, ADESSO).avviso).toContain('non permette di salvare')
  })

  it('segnala quando il browser rifiuta la scrittura', () => {
    const pieno: Archivio = {
      getItem: () => null,
      setItem: () => { throw new DOMException('pieno', 'QuotaExceededError') },
    }
    expect(salvaStato(pieno, crea())).toBe(false)
  })
})
