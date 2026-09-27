import { describe, expect, it } from 'vitest'
import {
  dividiArrotondando,
  euro,
  formattaEuro,
  formattaNumero,
  formattaPercentuale,
  formattaPerCopia,
  incidenza,
  parseEuro,
  percentualeDi,
  somma,
} from './denaro.ts'

const NBSP = ' '

describe('euro e somme in centesimi', () => {
  it('converte gli importi scritti nel codice in centesimi interi', () => {
    expect(euro(1213)).toBe(121300)
    expect(euro(45.3)).toBe(4530)
    expect(euro(0.07)).toBe(7)
  })

  it('non ha gli errori della virgola mobile', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(euro(0.1) + euro(0.2)).toBe(euro(0.3))
    expect(somma([euro(1000.1), euro(0.2), -euro(110.3)])).toBe(89000)
  })
})

describe('dividiArrotondando', () => {
  it('arrotonda al più vicino, le metà lontano da zero', () => {
    expect(dividiArrotondando(4, 10)).toBe(0)
    expect(dividiArrotondando(5, 10)).toBe(1)
    expect(dividiArrotondando(15, 10)).toBe(2)
    expect(dividiArrotondando(25, 10)).toBe(3)
    expect(dividiArrotondando(-4, 10)).toBe(0)
    expect(dividiArrotondando(-5, 10)).toBe(-1)
    expect(dividiArrotondando(-15, 10)).toBe(-2)
    expect(dividiArrotondando(100, 10)).toBe(10)
  })

  it('rifiuta input non interi o divisori non positivi', () => {
    expect(() => dividiArrotondando(1.5, 10)).toThrow(RangeError)
    expect(() => dividiArrotondando(10, 0)).toThrow(RangeError)
    expect(() => dividiArrotondando(10, -2)).toThrow(RangeError)
  })
})

describe('percentuali in punti base', () => {
  it('calcola le quote della ripartizione', () => {
    expect(percentualeDi(euro(2200), 7500)).toBe(euro(1650))
    expect(percentualeDi(euro(2200), 1500)).toBe(euro(330))
    expect(percentualeDi(euro(2200), 500)).toBe(euro(110))
  })

  it('arrotonda le quote al centesimo', () => {
    // 2.155,55 × 75% = 1.616,6625 → 1.616,66
    expect(percentualeDi(euro(2155.55), 7500)).toBe(161666)
    // 2.155,55 × 5% = 107,7775 → 107,78
    expect(percentualeDi(euro(2155.55), 500)).toBe(10778)
  })

  it("calcola l'incidenza di una parte sul totale", () => {
    expect(incidenza(euro(808), euro(2200))).toBe(3673) // 36,727…%
    expect(incidenza(euro(1650), euro(2200))).toBe(7500)
    expect(incidenza(euro(10), 0)).toBe(0)
  })
})

describe('formattazione', () => {
  it('formatta in italiano con due decimali e separatore delle migliaia', () => {
    expect(formattaEuro(121300)).toBe(`1.213,00${NBSP}€`)
    expect(formattaEuro(0)).toBe(`0,00${NBSP}€`)
    expect(formattaEuro(5)).toBe(`0,05${NBSP}€`)
    expect(formattaEuro(99)).toBe(`0,99${NBSP}€`)
    expect(formattaEuro(123456789)).toBe(`1.234.567,89${NBSP}€`)
    expect(formattaEuro(-5000)).toBe(`−50,00${NBSP}€`)
  })

  it('mostra il segno + sulle variazioni positive solo se richiesto', () => {
    expect(formattaNumero(27700, { segno: true })).toBe('+277,00')
    expect(formattaNumero(-27700, { segno: true })).toBe('−277,00')
    expect(formattaNumero(0, { segno: true })).toBe('0,00')
    expect(formattaNumero(27700)).toBe('277,00')
  })

  it("prepara l'importo da incollare nell'app della banca", () => {
    expect(formattaPerCopia(121300)).toBe('1213,00')
    expect(formattaPerCopia(149000)).toBe('1490,00')
    expect(formattaPerCopia(179114)).toBe('1791,14')
    expect(formattaPerCopia(5)).toBe('0,05')
    expect(formattaPerCopia(123456789)).toBe('1234567,89')
  })

  it('formatta le percentuali', () => {
    expect(formattaPercentuale(7500)).toBe('75%')
    expect(formattaPercentuale(3673)).toBe('36,73%')
    expect(formattaPercentuale(3650)).toBe('36,5%')
    expect(formattaPercentuale(505)).toBe('5,05%')
    expect(formattaPercentuale(10000)).toBe('100%')
  })
})

describe('parseEuro', () => {
  it.each([
    ['1213', 121300],
    ['1213,5', 121350],
    ['1213,50', 121350],
    ['1.213,50', 121350],
    ['1.213', 121300],
    ['1.234.567,89', 123456789],
    ['1,213.50', 121350],
    ['12.5', 1250],
    ['12.50', 1250],
    [',5', 50],
    ['5,', 500],
    ['0', 0],
    ['0,05', 5],
    ['€ 1.213,00', 121300],
    ['1 213,00 €', 121300],
    ['  45,30  ', 4530],
    ['-50', -5000],
    ['−50,00', -5000],
    ['+50', 5000],
    ['-0', 0],
  ])('legge "%s" come %i centesimi', (testo, atteso) => {
    expect(parseEuro(testo)).toBe(atteso)
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['12a'],
    [','],
    ['.'],
    ['1,2,3'],
    ['12,345'],
    ['1.2345'],
    ['12.34.56'],
    ['0.125'],
    ['1.5,00'],
    ['1234567890123'],
  ])('rifiuta "%s"', (testo) => {
    expect(parseEuro(testo)).toBeNull()
  })

  it('somma importi letti dal testo senza errori di arrotondamento', () => {
    const a = parseEuro('0,10')!
    const b = parseEuro('0,20')!
    expect(a + b).toBe(parseEuro('0,30'))
  })
})
