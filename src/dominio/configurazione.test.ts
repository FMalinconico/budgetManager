import { describe, expect, it } from 'vitest'
import {
  calcolaRipartizione,
  configurazionePredefinita,
  validaConfigurazione,
  type Configurazione,
} from './configurazione.ts'
import { euro } from './denaro.ts'

function conEntrate(frankA: number, frankB: number, mg: number): Configurazione {
  const configurazione = configurazionePredefinita()
  const [a, b, c] = configurazione.entrate
  a.importo = frankA
  b.importo = frankB
  c.importo = mg
  return configurazione
}

describe('ripartizione predefinita 75 / 15 / 5 / 5', () => {
  const r = calcolaRipartizione(configurazionePredefinita())

  it('divide 2.200 € di entrate secondo le percentuali', () => {
    expect(r.entrateTotali).toBe(euro(2200))
    expect(r.casa).toBe(euro(1650))
    expect(r.risparmio).toBe(euro(330))
    expect(r.sfiziFrank).toBe(euro(110))
    expect(r.sfiziMG).toBe(euro(110))
  })

  it('ricava 808 € di spese fisse, 437 su ING e 371 su Intesa Frank', () => {
    expect(r.speseFisseTotali).toBe(euro(808))
    expect(r.speseFisseING).toBe(euro(437))
    expect(r.speseFisseIntesaFrank).toBe(euro(340 + 31))
  })

  it('porta 1.213 € su Intesa Frank e lascia 437 € di mutuo su ING', () => {
    expect(r.trasferimentoCasa).toBe(euro(1213))
    expect(r.trasferimentoCasa + r.speseFisseING).toBe(r.casa)
  })

  it('lascia 842 € di margine per le spese variabili', () => {
    expect(r.margineVariabili).toBe(euro(842))
  })

  it('fissa il target ING a +767 € (437 mutuo + 330 risparmio) e la soglia a 437 €', () => {
    expect(r.targetING).toBe(euro(767))
    expect(r.sogliaING).toBe(euro(437))
  })

  it('distribuisce esattamente tutte le entrate tra casa, sfizi e ING', () => {
    expect(r.trasferimentoCasa + r.sfiziFrank + r.sfiziMG + r.targetING).toBe(r.entrateTotali)
  })

  it('è una configurazione valida', () => {
    expect(validaConfigurazione(configurazionePredefinita())).toEqual([])
  })
})

describe('arrotondamenti della ripartizione', () => {
  it('arrotonda le quote al centesimo e fa assorbire il resto al risparmio', () => {
    // 900,55 + 655,00 + 600,00 = 2.155,55 €
    const r = calcolaRipartizione(conEntrate(90055, 65500, 60000))
    expect(r.entrateTotali).toBe(215555)
    expect(r.casa).toBe(161666) // 1.616,6625
    expect(r.sfiziFrank).toBe(10778) // 107,7775
    expect(r.sfiziMG).toBe(10778)
    expect(r.risparmio).toBe(32333) // 323,3325
    expect(r.casa + r.risparmio + r.sfiziFrank + r.sfiziMG).toBe(r.entrateTotali)
  })

  it('non perde né crea centesimi anche quando ogni quota arrotonda per eccesso', () => {
    // 1,10 €: 75% = 0,825 → 0,83; 5% = 0,055 → 0,06; il 15% (0,165) arrotondato darebbe 0,17
    // e la somma farebbe 1,12 €. Il risparmio prende il resto: 0,15.
    const r = calcolaRipartizione(conEntrate(110, 0, 0))
    expect(r.casa).toBe(83)
    expect(r.sfiziFrank).toBe(6)
    expect(r.risparmio).toBe(15)
    expect(r.casa + r.risparmio + r.sfiziFrank + r.sfiziMG).toBe(110)
  })

  it('conserva il totale su molte entrate diverse', () => {
    // Generatore di Park-Miller: deterministico e senza perdita di precisione.
    let seme = 12345
    const casuale = () => {
      seme = (seme * 16807) % 2147483647
      return seme
    }
    for (let i = 0; i < 500; i++) {
      const r = calcolaRipartizione(conEntrate(casuale() % 300000, casuale() % 200000, casuale() % 150000))
      expect(r.casa + r.risparmio + r.sfiziFrank + r.sfiziMG).toBe(r.entrateTotali)
      expect(r.trasferimentoCasa + r.sfiziFrank + r.sfiziMG + r.targetING).toBe(r.entrateTotali)
    }
  })
})

describe('cambi di configurazione', () => {
  it('se cambia il mutuo su ING cambiano soglia, trasferimento casa e target ING', () => {
    const configurazione = configurazionePredefinita()
    configurazione.speseFisse[0].importo = euro(450)
    const r = calcolaRipartizione(configurazione)
    expect(r.sogliaING).toBe(euro(450))
    expect(r.trasferimentoCasa).toBe(euro(1200))
    expect(r.targetING).toBe(euro(780))
    expect(r.margineVariabili).toBe(euro(829))
  })

  it('se cambia una spesa fissa su Intesa Frank cala solo il margine variabile', () => {
    const configurazione = configurazionePredefinita()
    configurazione.speseFisse[1].importo = euro(360)
    const r = calcolaRipartizione(configurazione)
    expect(r.trasferimentoCasa).toBe(euro(1213))
    expect(r.margineVariabili).toBe(euro(822))
    expect(r.targetING).toBe(euro(767))
  })

  it('se crescono le entrate crescono tutte le quote in proporzione', () => {
    const r = calcolaRipartizione(conEntrate(euro(1000), euro(800), euro(600)))
    expect(r.entrateTotali).toBe(euro(2400))
    expect(r.casa).toBe(euro(1800))
    expect(r.trasferimentoCasa).toBe(euro(1363))
    expect(r.sfiziFrank).toBe(euro(120))
    expect(r.risparmio).toBe(euro(360))
    expect(r.targetING).toBe(euro(797))
  })
})

describe('validaConfigurazione', () => {
  const campi = (configurazione: Configurazione) => validaConfigurazione(configurazione).map((p) => p.campo)

  it('richiede che le percentuali sommino al 100%', () => {
    const configurazione = configurazionePredefinita()
    configurazione.percentuali.casa = 7600
    const problemi = validaConfigurazione(configurazione)
    expect(problemi).toHaveLength(1)
    expect(problemi[0].messaggio).toContain('101%')
  })

  it('rifiuta percentuali ed entrate negative', () => {
    const configurazione = configurazionePredefinita()
    configurazione.percentuali.sfiziMG = -500
    configurazione.percentuali.casa = 8500
    configurazione.entrate[0].importo = -1
    expect(campi(configurazione)).toContain('percentuali')
    expect(campi(configurazione)).toContain('entrate')
  })

  it('segnala spese fisse su ING più alte della quota casa', () => {
    const configurazione = configurazionePredefinita()
    configurazione.speseFisse[0].importo = euro(1700)
    expect(campi(configurazione)).toEqual(['speseFisse'])
  })

  it('segnala spese fisse su Intesa Frank più alte del trasferimento casa', () => {
    const configurazione = configurazionePredefinita()
    configurazione.speseFisse[1].importo = euro(1200)
    expect(campi(configurazione)).toEqual(['speseFisse'])
  })

  it("richiede che l'obiettivo intermedio del fondo non superi quello finale", () => {
    const configurazione = configurazionePredefinita()
    configurazione.fondoEmergenza.obiettivoIntermedio = euro(14000)
    expect(campi(configurazione)).toEqual(['fondoEmergenza'])
  })

  it('richiede entrate totali positive', () => {
    expect(campi(conEntrate(0, 0, 0))).toContain('entrate')
  })
})
