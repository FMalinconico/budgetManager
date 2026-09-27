/**
 * Importi in centesimi di euro, sempre interi.
 *
 * Tutta la logica lavora su interi per evitare gli errori della virgola mobile
 * (0,1 + 0,2 ≠ 0,3): la conversione da/verso euro avviene solo in ingresso
 * (parseEuro) e in uscita (formattaEuro, formattaPerCopia).
 */
export type Centesimi = number

const MENO = '−'
const SPAZIO_INSECABILE = ' '

/** Converte un importo scritto nel codice (es. `euro(1213)`, `euro(45.3)`) in centesimi. */
export function euro(importo: number): Centesimi {
  return Math.round(importo * 100)
}

export function somma(importi: readonly Centesimi[]): Centesimi {
  return importi.reduce((totale, importo) => totale + importo, 0)
}

/**
 * Divisione tra interi arrotondata al più vicino, con le metà arrotondate
 * lontano da zero (0,5 → 1; −0,5 → −1). Lavora solo su interi, quindi è esatta.
 */
export function dividiArrotondando(numeratore: number, denominatore: number): number {
  if (!Number.isSafeInteger(numeratore) || !Number.isSafeInteger(denominatore) || denominatore <= 0) {
    throw new RangeError(`Divisione non valida: ${numeratore} / ${denominatore}`)
  }
  const n = 2 * Math.abs(numeratore) + denominatore
  const d = 2 * denominatore
  const quoziente = (n - (n % d)) / d
  return numeratore < 0 && quoziente !== 0 ? -quoziente : quoziente
}

/** Percentuali espresse in punti base: 7500 = 75%, 525 = 5,25%. */
export type PuntiBase = number

export const CENTO_PER_CENTO: PuntiBase = 10_000

/** Quota percentuale di un importo, arrotondata al centesimo. */
export function percentualeDi(importo: Centesimi, puntiBase: PuntiBase): Centesimi {
  return dividiArrotondando(importo * puntiBase, CENTO_PER_CENTO)
}

/** Quanto pesa `parte` su `totale`, in punti base arrotondati. */
export function incidenza(parte: Centesimi, totale: Centesimi): PuntiBase {
  if (totale === 0) return 0
  return dividiArrotondando(parte * CENTO_PER_CENTO, totale)
}

function raggruppaMigliaia(cifre: string): string {
  return cifre.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function scomponi(importo: Centesimi): { interi: string; decimali: string } {
  const assoluto = Math.abs(importo)
  return {
    interi: String(Math.floor(assoluto / 100)),
    decimali: String(assoluto % 100).padStart(2, '0'),
  }
}

/**
 * Importo in formato italiano senza simbolo: `1.213,00`, `−50,00`.
 * Con `segno: true` i positivi hanno il `+` davanti (utile per le variazioni).
 */
export function formattaNumero(importo: Centesimi, opzioni: { segno?: boolean } = {}): string {
  const { interi, decimali } = scomponi(importo)
  const testo = `${raggruppaMigliaia(interi)},${decimali}`
  if (importo < 0) return MENO + testo
  if (opzioni.segno && importo > 0) return '+' + testo
  return testo
}

/** Importo in formato italiano con il simbolo: `1.213,00 €`. */
export function formattaEuro(importo: Centesimi, opzioni: { segno?: boolean } = {}): string {
  return `${formattaNumero(importo, opzioni)}${SPAZIO_INSECABILE}€`
}

/**
 * Importo da incollare nell'app della banca: niente simbolo e niente
 * separatore delle migliaia, virgola per i decimali (`1213,00`).
 */
export function formattaPerCopia(importo: Centesimi): string {
  const { interi, decimali } = scomponi(importo)
  return `${importo < 0 ? '-' : ''}${interi},${decimali}`
}

/** Punti base in formato italiano: 7500 → `75%`, 3673 → `36,73%`. */
export function formattaPercentuale(puntiBase: PuntiBase): string {
  const assoluto = Math.abs(puntiBase)
  const interi = Math.floor(assoluto / 100)
  const decimali = assoluto % 100
  const testo = decimali === 0
    ? String(interi)
    : `${interi},${String(decimali).padStart(2, '0').replace(/0$/, '')}`
  return `${puntiBase < 0 ? MENO : ''}${testo}%`
}

const MAX_CIFRE_INTERE = 12

function gruppiMigliaiaValidi(parteIntera: string, separatore: string): boolean {
  const gruppi = parteIntera.split(separatore)
  return gruppi.every((gruppo, i) => (i === 0 ? /^[1-9]\d{0,2}$/ : /^\d{3}$/).test(gruppo))
}

/**
 * Legge un importo scritto da una persona e lo restituisce in centesimi,
 * oppure `null` se il testo non è un importo valido.
 *
 * Accetta la virgola come separatore decimale (`1213,50`), il punto come
 * separatore delle migliaia (`1.213,50`), il simbolo € e gli spazi.
 * Un solo punto seguito da esattamente tre cifre è un separatore delle
 * migliaia (`1.213` = 1213 €); negli altri casi il punto è decimale
 * (`12.5` = 12,50 €). Più di due decimali non sono ammessi.
 */
export function parseEuro(testo: string): Centesimi | null {
  let s = testo.replace(/[€\s  ]/g, '')
  let negativo = false
  if (/^[-−+]/.test(s)) {
    negativo = s[0] !== '+'
    s = s.slice(1)
  }
  if (s === '') return null

  const virgola = s.lastIndexOf(',')
  const punto = s.lastIndexOf('.')
  let parteIntera: string
  let parteDecimale: string

  if (virgola >= 0 && punto >= 0) {
    // Entrambi presenti: l'ultimo è il separatore decimale, l'altro delle migliaia.
    const [decimale, migliaia] = virgola > punto ? [',', '.'] : ['.', ',']
    const indice = s.lastIndexOf(decimale)
    const intera = s.slice(0, indice)
    if (intera.includes(decimale) || !gruppiMigliaiaValidi(intera, migliaia)) return null
    parteIntera = intera.split(migliaia).join('')
    parteDecimale = s.slice(indice + 1)
  } else if (virgola >= 0) {
    if (s.indexOf(',') !== virgola) return null
    parteIntera = s.slice(0, virgola)
    parteDecimale = s.slice(virgola + 1)
  } else if (punto >= 0) {
    const dopoIlPunto = s.slice(punto + 1)
    const piuPunti = s.indexOf('.') !== punto
    if (piuPunti || dopoIlPunto.length === 3) {
      if (!gruppiMigliaiaValidi(s, '.')) return null
      parteIntera = s.split('.').join('')
      parteDecimale = ''
    } else {
      parteIntera = s.slice(0, punto)
      parteDecimale = dopoIlPunto
    }
  } else {
    parteIntera = s
    parteDecimale = ''
  }

  if (!/^\d*$/.test(parteIntera) || !/^\d{0,2}$/.test(parteDecimale)) return null
  if (parteIntera === '' && parteDecimale === '') return null
  if (parteIntera.replace(/^0+/, '').length > MAX_CIFRE_INTERE) return null

  const centesimi = Number(parteIntera || '0') * 100 + Number(parteDecimale.padEnd(2, '0'))
  return negativo && centesimi !== 0 ? -centesimi : centesimi
}
