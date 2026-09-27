import { describe, expect, it } from 'vitest'
import { configurazionePredefinita, type Configurazione } from './configurazione.ts'
import { euro, formattaEuro, formattaPerCopia, parseEuro, somma, type Centesimi } from './denaro.ts'
import {
  applicaBonifici,
  calcolaChiusura,
  calcolaCoperturaSforamento,
  calcolaTranche1,
  calcolaTranche1Accorpata,
  calcolaTranche2,
  calcolaTranche2Accorpata,
  parametriDaConfigurazione,
  risparmioReale,
  statoSoglia,
  verificaFineCiclo,
  type Bonifico,
  type Esito,
  type Saldi,
} from './giroconti.ts'

const p = parametriDaConfigurazione(configurazionePredefinita())

const codici = (esiti: readonly Esito[]) => esiti.map((e) => e.codice)
const gravi = (esiti: readonly Esito[]) => esiti.filter((e) => e.gravita === 'bloccante' || e.gravita === 'attenzione')
const importi = (bonifici: readonly Bonifico[]) => bonifici.map((b) => [b.numero, b.da, b.a, b.importo])
const totale = (saldi: Saldi) => somma(Object.values(saldi))

function saldi(ing: number, intesaFrank: number, buddybank: number, intesaMG: number): Saldi {
  return { ing: euro(ing), intesaFrank: euro(intesaFrank), buddybank: euro(buddybank), intesaMG: euro(intesaMG) }
}

describe('parametri derivati dalla configurazione predefinita', () => {
  it('usa le quote e le soglie del budget', () => {
    expect(p).toEqual({
      quotaSfiziFrank: euro(110),
      quotaSfiziMG: euro(110),
      trasferimentoCasa: euro(1213),
      targetING: euro(767),
      sogliaING: euro(437),
      minimoAccreditoING: euro(1000),
      margineAvvisoSoglia: euro(200),
      entrataPrevistaFrank: euro(1600),
      entrataPrevistaMG: euro(600),
    })
  })
})

describe('caso standard: stipendi come previsto, nessun residuo', () => {
  // Prima dello stipendio di Frank: ING 3.000 €, conti casa e sfizi a zero.
  // Arrivano 900 € su Buddybank e 700 € su Intesa Frank.
  const prima = saldi(3000, 700, 900, 0)
  const t1 = calcolaTranche1(
    { saldoBuddybank: prima.buddybank, saldoIntesaFrank: prima.intesaFrank, residuoSfiziFrank: 0, saldoING: prima.ing },
    p,
  )

  it('tranche 1: svuota Intesa Frank, gira 1.490 € su ING e riporta 1.213 € sul conto casa', () => {
    expect(importi(t1.bonifici)).toEqual([
      ['1', 'intesaFrank', 'buddybank', euro(700)],
      ['2', 'buddybank', 'ing', euro(1490)],
      ['3', 'ing', 'intesaFrank', euro(1213)],
    ])
    expect(t1.bonifici.every((b) => b.necessario)).toBe(true)
  })

  it('tranche 1: restano 110 € su Buddybank e ING cresce di 277 €', () => {
    expect(t1.restaSuBuddybank).toBe(euro(110))
    expect(t1.restaSuIntesaFrank).toBe(euro(1213))
    expect(t1.variazioneNettaING).toBe(euro(277))
    expect(t1.saldoINGDopo).toBe(euro(3277))
    expect(t1.bonifico2Previsto).toBe(euro(1490))
  })

  it('tranche 1: nessun avviso e piano non bloccato', () => {
    expect(t1.esiti).toEqual([])
    expect(t1.bloccato).toBe(false)
    expect(t1.pianoAccorpato).toBeNull()
  })

  it('tranche 1: i saldi dopo i bonifici tornano con quanto dichiarato', () => {
    const dopo = applicaBonifici(prima, t1.bonifici)
    expect(dopo).toEqual({
      ing: t1.saldoINGDopo,
      intesaFrank: t1.restaSuIntesaFrank,
      buddybank: t1.restaSuBuddybank,
      intesaMG: 0,
    })
    expect(totale(dopo)).toBe(totale(prima))
  })

  // Dieci giorni dopo arrivano 600 € su Intesa MG.
  const t2 = calcolaTranche2({ saldoIntesaMG: euro(600), residuoSfiziMG: 0, saldoING: t1.saldoINGDopo }, p)

  it('tranche 2: gira 490 € su ING e lascia 110 € a MG', () => {
    expect(importi(t2.bonifici)).toEqual([['4', 'intesaMG', 'ing', euro(490)]])
    expect(t2.restaSuIntesaMG).toBe(euro(110))
    expect(t2.variazioneNettaING).toBe(euro(490))
    expect(t2.saldoINGDopo).toBe(euro(3767))
    expect(t2.esiti).toEqual([])
    expect(t2.bloccato).toBe(false)
  })

  it('fine ciclo: ING cresce esattamente dei 767 € del target', () => {
    const verifica = verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, p)
    expect(verifica.totale).toBe(euro(767))
    expect(verifica.scarto).toBe(0)
    expect(verifica.esito.codice).toBe('IN_LINEA_CON_TARGET')
    expect(verifica.esito.gravita).toBe('ok')
  })

  it('le entrate si distribuiscono tutte: 1.213 casa + 110 + 110 sfizi + 767 ING = 2.200 €', () => {
    const dopoT1 = applicaBonifici({ ...prima, intesaMG: euro(600) }, t1.bonifici)
    const fine = applicaBonifici(dopoT1, t2.bonifici)
    expect(fine).toEqual(saldi(3767, 1213, 110, 110))
  })
})

describe('regola 1: almeno 1.000 € su ING in un’unica transazione', () => {
  it('conta la singola transazione in entrata, non il netto dopo il bonifico 3', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(900), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
    expect(t1.variazioneNettaING).toBeLessThan(euro(1000)) // +277 netti…
    expect(t1.bonifici[1].importo).toBeGreaterThanOrEqual(euro(1000)) // …ma entrano 1.490 € in un colpo
    expect(codici(t1.esiti)).not.toContain('ACCREDITO_ING_SOTTO_MINIMO')
  })

  it('esattamente 1.000 € è sufficiente', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(410), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
    expect(t1.bonifici[1].importo).toBe(euro(1000))
    expect(codici(t1.esiti)).not.toContain('ACCREDITO_ING_SOTTO_MINIMO')
  })

  describe('bonifico 2 sotto i 1.000 €', () => {
    // Stipendi molto più bassi: 500 € su Buddybank e 550 € su Intesa Frank → bonifico 2 = 940 €.
    const input = { saldoBuddybank: euro(500), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0, saldoING: euro(3000) }
    const t1 = calcolaTranche1(input, p)

    it('blocca il piano standard con un messaggio chiaro', () => {
      expect(t1.bonifici[1].importo).toBe(euro(940))
      expect(t1.bloccato).toBe(true)
      const esito = t1.esiti.find((e) => e.codice === 'ACCREDITO_ING_SOTTO_MINIMO')
      expect(esito?.gravita).toBe('bloccante')
      expect(esito?.messaggio).toContain('Non spezzarlo')
      expect(esito?.messaggio).toContain(formattaEuro(euro(940)))
    })

    it("propone di accorpare la tranche di MG in un unico bonifico", () => {
      expect(t1.pianoAccorpato).toEqual({
        importoDifferito: euro(940),
        stimaQuotaMG: euro(490),
        stimaBonificoUnico: euro(1430),
        raggiungeMinimo: true,
      })
    })

    it('piano accorpato, tranche 1: svuota Intesa Frank e ING anticipa la casa, senza bonifici verso ING', () => {
      const a1 = calcolaTranche1Accorpata(input, p)
      expect(importi(a1.bonifici)).toEqual([
        ['1', 'intesaFrank', 'buddybank', euro(550)],
        ['3', 'ing', 'intesaFrank', euro(1213)],
      ])
      expect(a1.importoDifferito).toBe(euro(940))
      expect(a1.restaSuBuddybank).toBe(euro(1050)) // 940 da girare + 110 di sfizi
      expect(a1.variazioneNettaING).toBe(-euro(1213))
      expect(a1.saldoINGDopo).toBe(euro(1787))
      expect(a1.bloccato).toBe(false)
      // Regola 3: l'anticipo dal risparmio va segnalato esplicitamente.
      expect(codici(a1.esiti)).toEqual(['ING_ANTICIPA_CASA', 'FONDI_VINCOLATI_SU_BUDDYBANK'])
    })

    it('piano accorpato, tranche 2: un solo bonifico da 1.430 € entra su ING', () => {
      const a1 = calcolaTranche1Accorpata(input, p)
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
      expect(importi(a2.bonifici)).toEqual([
        ['4', 'intesaMG', 'buddybank', euro(490)],
        ['2+4', 'buddybank', 'ing', euro(1430)],
      ])
      expect(a2.importoBonificoUnico).toBe(euro(1430))
      expect(a2.restaSuIntesaMG).toBe(euro(110))
      expect(a2.bloccato).toBe(false)

      // Mai spezzare: in tutto il ciclo su ING entra una sola transazione.
      const versamentiSuING = [...a1.bonifici, ...a2.bonifici].filter((b) => b.a === 'ing')
      expect(versamentiSuING).toHaveLength(1)
      expect(versamentiSuING[0].importo).toBeGreaterThanOrEqual(euro(1000))

      // I saldi finali sono gli stessi del piano standard: cambia solo il momento del bonifico.
      const prima = saldi(3000, 550, 500, 600)
      const fine = applicaBonifici(applicaBonifici(prima, a1.bonifici), a2.bonifici)
      expect(fine).toEqual({ ing: euro(3217), intesaFrank: euro(1213), buddybank: euro(110), intesaMG: euro(110) })
      expect(totale(fine)).toBe(totale(prima))

      const verifica = verificaFineCiclo(a1.variazioneNettaING, a2.variazioneNettaING, p)
      expect(verifica.totale).toBe(euro(217))
      expect(verifica.esito.codice).toBe('SOTTO_TARGET')
    })

    it('piano accorpato, tranche 2: si blocca se nel frattempo è stata spesa una parte della cifra da girare', () => {
      // Su Buddybank c'erano 1.050 €: 110 di sfizi e 940 da non toccare. Frank ne spende 150.
      const a2 = calcolaTranche2Accorpata(
        {
          saldoIntesaMG: euro(600),
          residuoSfiziMG: 0,
          saldoING: euro(1787),
          saldoBuddybank: euro(900),
          importoDifferito: euro(940),
          anticipoCasa: euro(1213),
        },
        p,
      )
      const esito = a2.esiti.find((e) => e.codice === 'BUDDYBANK_INSUFFICIENTE')
      expect(esito?.gravita).toBe('bloccante')
      expect(esito?.messaggio).toContain(formattaEuro(euro(40)))
    })

    it('piano accorpato, tranche 2: se Frank spende solo i suoi sfizi non si blocca', () => {
      const a2 = calcolaTranche2Accorpata(
        {
          saldoIntesaMG: euro(600),
          residuoSfiziMG: 0,
          saldoING: euro(1787),
          saldoBuddybank: euro(950),
          importoDifferito: euro(940),
          anticipoCasa: euro(1213),
        },
        p,
      )
      expect(a2.bloccato).toBe(false)
    })
  })

  describe('anche accorpando si resta sotto i 1.000 €', () => {
    const input = { saldoBuddybank: euro(200), saldoIntesaFrank: euro(300), residuoSfiziFrank: 0, saldoING: euro(5000) }

    it('lo dice già alla tranche 1, con la stima', () => {
      const t1 = calcolaTranche1(input, p)
      expect(t1.pianoAccorpato?.stimaBonificoUnico).toBe(euro(880))
      expect(t1.pianoAccorpato?.raggiungeMinimo).toBe(false)
      expect(t1.esiti[0].messaggio).toContain(formattaEuro(euro(120)))
      const a1 = calcolaTranche1Accorpata(input, p)
      expect(a1.esiti.find((e) => e.codice === 'ACCREDITO_ING_SOTTO_MINIMO_ANCHE_ACCORPANDO')?.gravita).toBe('attenzione')
    })

    it('blocca il bonifico unico alla tranche 2, senza proporre di spezzarlo', () => {
      const a2 = calcolaTranche2Accorpata(
        { saldoIntesaMG: euro(600), residuoSfiziMG: 0, saldoING: euro(3787), importoDifferito: euro(390), anticipoCasa: euro(1213) },
        p,
      )
      expect(a2.importoBonificoUnico).toBe(euro(880))
      expect(a2.bloccato).toBe(true)
      expect(codici(a2.esiti)).toContain('ACCREDITO_ING_SOTTO_MINIMO_ANCHE_ACCORPANDO')
      expect(codici(a2.esiti)).toContain('ING_FINANZIA_CASA')
      expect(a2.bonifici.filter((b) => b.a === 'ing')).toHaveLength(1)
    })
  })
})

describe('stipendio più alto del previsto', () => {
  // Frank prende 1.000 + 750, MG 650: 200 € in più del previsto.
  const t1 = calcolaTranche1({ saldoBuddybank: euro(1000), saldoIntesaFrank: euro(750), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
  const t2 = calcolaTranche2({ saldoIntesaMG: euro(650), residuoSfiziMG: 0, saldoING: t1.saldoINGDopo }, p)

  it("l'eccedenza va tutta su ING: le quote casa e sfizi restano fisse", () => {
    expect(t1.bonifici[1].importo).toBe(euro(1640))
    expect(t1.restaSuBuddybank).toBe(euro(110))
    expect(t1.restaSuIntesaFrank).toBe(euro(1213))
    expect(t2.bonifici[0].importo).toBe(euro(540))
    expect(t2.restaSuIntesaMG).toBe(euro(110))
  })

  it('lo segnala come informazione, non come errore', () => {
    expect(gravi(t1.esiti)).toEqual([])
    expect(gravi(t2.esiti)).toEqual([])
    expect(t1.esiti.map((e) => [e.codice, e.gravita])).toEqual([['ENTRATE_DIVERSE_DAL_PREVISTO', 'info']])
    expect(t1.esiti[0].titolo).toContain('più alte')
  })

  it('a fine ciclo mostra 200 € di risparmio extra', () => {
    const verifica = verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, p)
    expect(verifica.totale).toBe(euro(967))
    expect(verifica.scarto).toBe(euro(200))
    expect(verifica.esito.codice).toBe('RISPARMIO_EXTRA')
    expect(verifica.esito.gravita).toBe('ok')
    expect(verifica.esito.titolo).toBe(`Risparmio extra: +${formattaEuro(euro(200))}`)
  })
})

describe('stipendio più basso del previsto', () => {
  it('poco più basso: meno risparmio, nessun blocco', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(850), saldoIntesaFrank: euro(600), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
    const t2 = calcolaTranche2({ saldoIntesaMG: euro(550), residuoSfiziMG: 0, saldoING: t1.saldoINGDopo }, p)
    expect(t1.bonifici[1].importo).toBe(euro(1340))
    expect(t1.bloccato).toBe(false)
    expect(t1.esiti[0].titolo).toContain('più basse')
    expect(t2.bonifici[0].importo).toBe(euro(440))

    const verifica = verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, p)
    expect(verifica.totale).toBe(euro(567))
    expect(verifica.scarto).toBe(-euro(200))
    expect(verifica.esito.codice).toBe('SOTTO_TARGET')
    expect(verifica.esito.gravita).toBe('attenzione')
  })

  it('regola 3: se il bonifico 2 è sotto 1.213 € segnala che ING finanzia la casa col risparmio', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(700), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
    expect(t1.bonifici[1].importo).toBe(euro(1140))
    expect(t1.variazioneNettaING).toBe(-euro(73))
    const esito = t1.esiti.find((e) => e.codice === 'ING_FINANZIA_CASA')
    expect(esito?.gravita).toBe('attenzione')
    expect(esito?.messaggio).toContain(formattaEuro(euro(73)))
    // Sopra i 1.000 € il piano resta eseguibile.
    expect(t1.bloccato).toBe(false)
  })
})

describe('residuo sfizi diverso da zero', () => {
  it('Frank: la quota da 110 € si aggiunge al residuo, non lo sostituisce', () => {
    // A fine ciclo erano avanzati 45,30 € su Buddybank; arrivano i soliti 900 + 700.
    const t1 = calcolaTranche1({ saldoBuddybank: euro(945.3), saldoIntesaFrank: euro(700), residuoSfiziFrank: euro(45.3), saldoING: euro(3000) }, p)
    expect(t1.quotaSfizi).toBe(euro(155.3))
    expect(t1.restaSuBuddybank).toBe(euro(155.3))
    expect(t1.bonifici[1].importo).toBe(euro(1490)) // su ING va lo stesso importo del caso standard
    expect(t1.esiti).toEqual([])
  })

  it('MG: la quota da 110 € si aggiunge al residuo, non lo sostituisce', () => {
    const t2 = calcolaTranche2({ saldoIntesaMG: euro(620), residuoSfiziMG: euro(20), saldoING: euro(3277) }, p)
    expect(t2.quotaSfizi).toBe(euro(130))
    expect(t2.restaSuIntesaMG).toBe(euro(130))
    expect(t2.bonifici[0].importo).toBe(euro(490))
    expect(t2.esiti).toEqual([])
  })

  it('il ciclo resta in linea con il target', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(945.3), saldoIntesaFrank: euro(700), residuoSfiziFrank: euro(45.3), saldoING: euro(3000) }, p)
    const t2 = calcolaTranche2({ saldoIntesaMG: euro(620), residuoSfiziMG: euro(20), saldoING: t1.saldoINGDopo }, p)
    expect(verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, p).scarto).toBe(0)
  })

  it('un residuo negativo (sfizi sforati) riduce la quota del ciclo', () => {
    // Buddybank era in rosso di 20 €: dopo lo stipendio ha 880 €.
    const t1 = calcolaTranche1({ saldoBuddybank: euro(880), saldoIntesaFrank: euro(700), residuoSfiziFrank: -euro(20), saldoING: euro(3000) }, p)
    expect(t1.restaSuBuddybank).toBe(euro(90))
    expect(t1.bonifici[1].importo).toBe(euro(1490))
    expect(t1.bloccato).toBe(false)
  })

  it('segnala un residuo più alto del saldo (stipendio non ancora arrivato?)', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(30), saldoIntesaFrank: euro(1500), residuoSfiziFrank: euro(45.3), saldoING: euro(3000) }, p)
    const esito = t1.esiti.find((e) => e.codice === 'RESIDUO_SUPERIORE_AL_SALDO')
    expect(esito?.gravita).toBe('attenzione')
  })

  it('blocca un residuo così negativo da rendere negativa la quota sfizi', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(750), saldoIntesaFrank: euro(700), residuoSfiziFrank: -euro(150), saldoING: euro(3000) }, p)
    expect(t1.quotaSfizi).toBe(-euro(40))
    expect(codici(t1.esiti)).toContain('QUOTA_SFIZI_NEGATIVA')
    expect(t1.bloccato).toBe(true)
  })
})

describe('saldi insufficienti', () => {
  it('tranche 1: se Buddybank e Intesa Frank non coprono la quota sfizi si blocca', () => {
    // Lo stipendio non è ancora arrivato: 60 + 40 € contro 110 € di quota sfizi.
    const t1 = calcolaTranche1({ saldoBuddybank: euro(60), saldoIntesaFrank: euro(40), residuoSfiziFrank: 0, saldoING: euro(3000) }, p)
    expect(t1.bloccato).toBe(true)
    expect(t1.esiti[0].codice).toBe('SALDI_INSUFFICIENTI')
    expect(t1.esiti[0].messaggio).toContain('stipendio')
    // Non ha senso proporre il piano accorpato né verificare ING.
    expect(t1.pianoAccorpato).toBeNull()
    expect(codici(t1.esiti)).not.toContain('ACCREDITO_ING_SOTTO_MINIMO')
    expect(t1.saldoINGDopo).toBeNull()
  })

  it('tranche 1: se su ING non ci sono i soldi per il bonifico 3 si blocca', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(700), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0, saldoING: euro(50) }, p)
    expect(t1.bonifici[1].importo).toBe(euro(1140))
    expect(t1.bloccato).toBe(true)
    const esito = t1.esiti.find((e) => e.codice === 'ING_FONDI_INSUFFICIENTI')
    expect(esito?.messaggio).toContain(formattaEuro(euro(1190)))
    expect(codici(t1.esiti)).not.toContain('ING_SOTTO_SOGLIA')
  })

  it('tranche 1: con Intesa Frank in rosso non svuota niente e ING copre lo scoperto', () => {
    const prima = saldi(3000, -50, 1300, 0)
    const t1 = calcolaTranche1({ saldoBuddybank: prima.buddybank, saldoIntesaFrank: prima.intesaFrank, residuoSfiziFrank: 0, saldoING: prima.ing }, p)
    expect(t1.bonifici[0].necessario).toBe(false)
    expect(t1.bonifici[1].importo).toBe(euro(1190))
    expect(t1.bonifici[2].importo).toBe(euro(1263))
    expect(codici(t1.esiti)).toContain('CASA_IN_ROSSO')
    expect(codici(t1.esiti)).toContain('ING_FINANZIA_CASA')
    // Regola 6: lo scoperto lo paga ING, i conti sfizi restano intatti.
    expect(applicaBonifici(prima, t1.bonifici)).toEqual(saldi(2927, 1213, 110, 0))
  })

  it('tranche 2: se Intesa MG non copre la quota sfizi si blocca', () => {
    const t2 = calcolaTranche2({ saldoIntesaMG: euro(100), residuoSfiziMG: 0, saldoING: euro(3277) }, p)
    expect(t2.bonifici[0].importo).toBe(-euro(10))
    expect(t2.bonifici[0].necessario).toBe(false)
    expect(t2.bloccato).toBe(true)
    expect(codici(t2.esiti)).toEqual(['SALDI_INSUFFICIENTI'])
  })

  it('piano accorpato: se ING non può anticipare la casa si blocca', () => {
    const input = { saldoBuddybank: euro(500), saldoIntesaFrank: euro(550), residuoSfiziFrank: 0 }
    const senzaFondi = calcolaTranche1Accorpata({ ...input, saldoING: euro(1000) }, p)
    expect(codici(senzaFondi.esiti)).toContain('ING_FONDI_INSUFFICIENTI')
    expect(senzaFondi.bloccato).toBe(true)
    // Ha i fondi, ma scenderebbe sotto la soglia intoccabile.
    const sottoSoglia = calcolaTranche1Accorpata({ ...input, saldoING: euro(1500) }, p)
    expect(codici(sottoSoglia.esiti)).toContain('ING_SOTTO_SOGLIA')
    expect(sottoSoglia.bloccato).toBe(true)
  })
})

describe('regola 2: soglia intoccabile di 437 € su ING', () => {
  it('il risparmio reale è sempre saldo ING − 437', () => {
    expect(risparmioReale(euro(5000), p.sogliaING)).toBe(euro(4563))
    expect(risparmioReale(euro(400), p.sogliaING)).toBe(-euro(37))
  })

  it('classifica il saldo rispetto alla soglia e al margine di avviso', () => {
    expect(statoSoglia(euro(436.99), p)).toBe('sotto')
    expect(statoSoglia(euro(437), p)).toBe('vicino')
    expect(statoSoglia(euro(636.99), p)).toBe('vicino')
    expect(statoSoglia(euro(637), p)).toBe('ok')
  })

  it('avvisa quando dopo la tranche 1 ING si avvicina alla soglia', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(900), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0, saldoING: euro(300) }, p)
    expect(t1.saldoINGDopo).toBe(euro(577))
    const esito = t1.esiti.find((e) => e.codice === 'ING_VICINO_SOGLIA')
    expect(esito?.gravita).toBe('attenzione')
    expect(esito?.messaggio).toContain(formattaEuro(euro(140)))
    expect(t1.bloccato).toBe(false)
  })

  it('blocca un piano che porterebbe ING sotto la soglia', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(900), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0, saldoING: 0 }, p)
    expect(t1.saldoINGDopo).toBe(euro(277))
    const esito = t1.esiti.find((e) => e.codice === 'ING_SOTTO_SOGLIA')
    expect(esito?.gravita).toBe('bloccante')
    expect(esito?.messaggio).toContain(formattaEuro(euro(160)))
  })

  it('senza saldo ING non verifica la soglia ma lo dice', () => {
    const t1 = calcolaTranche1({ saldoBuddybank: euro(900), saldoIntesaFrank: euro(700), residuoSfiziFrank: 0 }, p)
    expect(t1.saldoINGDopo).toBeNull()
    expect(t1.esiti.map((e) => [e.codice, e.gravita])).toEqual([['SALDO_ING_NON_INSERITO', 'info']])
    expect(t1.bloccato).toBe(false)
  })
})

describe('arrotondamenti ai centesimi', () => {
  it('calcola i bonifici al centesimo esatto', () => {
    const t1 = calcolaTranche1(
      { saldoBuddybank: euro(1234.57), saldoIntesaFrank: euro(678.91), residuoSfiziFrank: euro(12.34), saldoING: euro(2500.01) },
      p,
    )
    // 1.234,57 + 678,91 − (110 + 12,34) = 1.791,14
    expect(t1.bonifici[1].importo).toBe(179114)
    expect(formattaEuro(t1.bonifici[1].importo)).toBe('1.791,14 €')
    expect(formattaPerCopia(t1.bonifici[1].importo)).toBe('1791,14')
    expect(t1.restaSuBuddybank).toBe(12234)
    expect(t1.variazioneNettaING).toBe(57814)
    expect(t1.saldoINGDopo).toBe(307815)
  })

  it('non accumula errori quando gli importi arrivano dal testo digitato', () => {
    const t1 = calcolaTranche1(
      { saldoBuddybank: parseEuro('1.000,10')!, saldoIntesaFrank: parseEuro('0,20')!, residuoSfiziFrank: parseEuro('0,30')!, saldoING: parseEuro('3.000')! },
      p,
    )
    // In virgola mobile 1000,10 + 0,20 − 110,30 darebbe 889,9999999999999.
    expect(1000.1 + 0.2 - 110.3).not.toBe(890)
    expect(t1.bonifici[1].importo).toBe(euro(890))
    expect(formattaPerCopia(t1.bonifici[1].importo)).toBe('890,00')
  })

  it('con entrate non tonde e stipendi come previsto chiude esattamente sul target', () => {
    const configurazione: Configurazione = configurazionePredefinita()
    configurazione.entrate[0].importo = 90055 // 900,55 su Buddybank
    configurazione.entrate[1].importo = 65500 // 655,00 su Intesa Frank
    const q = parametriDaConfigurazione(configurazione)
    expect(q.quotaSfiziFrank).toBe(10778)
    expect(q.trasferimentoCasa).toBe(117966)
    expect(q.targetING).toBe(76033)

    const t1 = calcolaTranche1({ saldoBuddybank: 90055, saldoIntesaFrank: 65500, residuoSfiziFrank: 0, saldoING: euro(3000) }, q)
    const t2 = calcolaTranche2({ saldoIntesaMG: euro(600), residuoSfiziMG: 0, saldoING: t1.saldoINGDopo }, q)
    expect(t1.bonifici[1].importo).toBe(144777)
    expect(t2.bonifici[0].importo).toBe(49222)
    expect(verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, q).scarto).toBe(0)
  })

  it('su molti cicli casuali i soldi si conservano e il ciclo torna sul target', () => {
    let seme = 2024
    const casuale = (massimo: number) => {
      seme = (seme * 16807) % 2147483647
      return seme % massimo
    }
    for (let i = 0; i < 300; i++) {
      const configurazione = configurazionePredefinita()
      configurazione.entrate[0].importo = 50000 + casuale(100000)
      configurazione.entrate[1].importo = 50000 + casuale(100000)
      configurazione.entrate[2].importo = 30000 + casuale(80000)
      const q = parametriDaConfigurazione(configurazione)
      const residuoF: Centesimi = casuale(20000)
      const residuoMG: Centesimi = casuale(20000)
      const prima: Saldi = {
        ing: euro(5000) + casuale(1000000),
        intesaFrank: configurazione.entrate[1].importo,
        buddybank: configurazione.entrate[0].importo + residuoF,
        intesaMG: configurazione.entrate[2].importo + residuoMG,
      }
      const t1 = calcolaTranche1({ saldoBuddybank: prima.buddybank, saldoIntesaFrank: prima.intesaFrank, residuoSfiziFrank: residuoF, saldoING: prima.ing }, q)
      const dopoT1 = applicaBonifici(prima, t1.bonifici)
      const t2 = calcolaTranche2({ saldoIntesaMG: dopoT1.intesaMG, residuoSfiziMG: residuoMG, saldoING: dopoT1.ing }, q)
      const fine = applicaBonifici(dopoT1, t2.bonifici)

      expect(totale(fine)).toBe(totale(prima))
      expect(fine.intesaFrank).toBe(q.trasferimentoCasa)
      expect(fine.buddybank).toBe(q.quotaSfiziFrank + residuoF)
      expect(fine.intesaMG).toBe(q.quotaSfiziMG + residuoMG)
      expect(fine.ing - prima.ing).toBe(q.targetING)
      expect(verificaFineCiclo(t1.variazioneNettaING, t2.variazioneNettaING, q).scarto).toBe(0)
    }
  })
})

describe('chiusura del ciclo', () => {
  it("regola 5: propone di girare su ING l'avanzo del conto casa", () => {
    const c = calcolaChiusura({ saldoING: euro(4000), saldoIntesaFrank: euro(85.4), saldoBuddybank: euro(23.5), saldoIntesaMG: 0 }, p)
    expect(importi(c.bonifici)).toEqual([['A', 'intesaFrank', 'ing', euro(85.4)]])
    expect(c.avanzoCasa).toBe(euro(85.4))
    expect(c.sforamentoCasa).toBe(0)
    expect(c.saldiDopo).toEqual({ ing: euro(4085.4), intesaFrank: 0, buddybank: euro(23.5), intesaMG: 0 })
    expect(c.risparmioReale).toBe(euro(3648.4))
    expect(codici(c.esiti)).toEqual(['AVANZO_CASA'])
  })

  it('rileva i residui sfizi da precompilare nel ciclo successivo', () => {
    const c = calcolaChiusura({ saldoING: euro(4000), saldoIntesaFrank: 0, saldoBuddybank: euro(23.5), saldoIntesaMG: euro(41.2) }, p)
    expect(c.residuoSfiziFrank).toBe(euro(23.5))
    expect(c.residuoSfiziMG).toBe(euro(41.2))
    expect(c.bonifici).toEqual([])

    // Ciclo successivo: il residuo resta a Frank e la quota nuova si somma.
    const t1 = calcolaTranche1({ saldoBuddybank: euro(923.5), saldoIntesaFrank: euro(700), residuoSfiziFrank: c.residuoSfiziFrank, saldoING: euro(4000) }, p)
    expect(t1.restaSuBuddybank).toBe(euro(133.5))
    expect(t1.bonifici[1].importo).toBe(euro(1490))
  })

  it('regola 6: copre lo sforamento della casa da ING, mai dai conti sfizi', () => {
    const c = calcolaChiusura({ saldoING: euro(4000), saldoIntesaFrank: -euro(30), saldoBuddybank: euro(80), saldoIntesaMG: euro(95) }, p)
    expect(importi(c.bonifici)).toEqual([['C', 'ing', 'intesaFrank', euro(30)]])
    expect(c.bonifici.some((b) => b.da === 'buddybank' || b.da === 'intesaMG')).toBe(false)
    expect(c.sforamentoCasa).toBe(euro(30))
    expect(c.saldiDopo).toEqual({ ing: euro(3970), intesaFrank: 0, buddybank: euro(80), intesaMG: euro(95) })
    expect(codici(c.esiti)).toEqual(['SFORAMENTO_CASA'])
  })

  it('se il risparmio non basta a coprire lo sforamento lo dice, ma non tocca gli sfizi', () => {
    const c = calcolaChiusura({ saldoING: euro(600), saldoIntesaFrank: -euro(300), saldoBuddybank: euro(500), saldoIntesaMG: euro(500) }, p)
    expect(c.bonifici.every((b) => b.da === 'ing')).toBe(true)
    const esito = c.esiti.find((e) => e.codice === 'RISPARMIO_INSUFFICIENTE')
    expect(esito?.gravita).toBe('bloccante')
    expect(esito?.messaggio).toContain(formattaEuro(euro(163)))
  })

  it('segnala i conti sfizi in rosso: il residuo negativo si scala dal ciclo dopo', () => {
    const c = calcolaChiusura({ saldoING: euro(4000), saldoIntesaFrank: 0, saldoBuddybank: -euro(12), saldoIntesaMG: 0 }, p)
    expect(codici(c.esiti)).toEqual(['SFIZI_IN_ROSSO'])
    expect(c.residuoSfiziFrank).toBe(-euro(12))
  })

  it('avvisa se a fine ciclo ING è sotto la soglia, senza bloccare la chiusura', () => {
    const c = calcolaChiusura({ saldoING: euro(400), saldoIntesaFrank: 0, saldoBuddybank: 0, saldoIntesaMG: 0 }, p)
    expect(c.esiti.map((e) => [e.codice, e.gravita])).toEqual([['ING_SOTTO_SOGLIA', 'attenzione']])
    expect(c.bloccato).toBe(false)
  })
})

describe('copertura di uno sforamento durante il ciclo', () => {
  it('non propone niente se non manca niente', () => {
    const c = calcolaCoperturaSforamento(0, euro(3000), p)
    expect(c.bonifico).toBeNull()
    expect(c.esiti).toEqual([])
  })

  it('prende i soldi solo da ING', () => {
    const c = calcolaCoperturaSforamento(euro(100), euro(1000), p)
    expect(c.bonifico && [c.bonifico.da, c.bonifico.a, c.bonifico.importo]).toEqual(['ing', 'intesaFrank', euro(100)])
    expect(c.coperturaMassima).toBe(euro(563))
    expect(c.saldoINGDopo).toBe(euro(900))
    expect(c.bloccato).toBe(false)
  })

  it('blocca una copertura che intaccherebbe la soglia e indica il massimo coperbile', () => {
    const c = calcolaCoperturaSforamento(euro(500), euro(800), p)
    expect(c.coperturaMassima).toBe(euro(363))
    expect(c.bloccato).toBe(true)
    expect(codici(c.esiti)).toContain('RISPARMIO_INSUFFICIENTE')
  })

  it('avvisa se dopo la copertura ING resta vicino alla soglia', () => {
    const c = calcolaCoperturaSforamento(euro(300), euro(900), p)
    expect(codici(c.esiti)).toEqual(['SFORAMENTO_CASA', 'ING_VICINO_SOGLIA'])
  })
})
