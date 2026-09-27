import { useId, useRef, useState, type ReactNode } from 'react'
import { formattaNumero, parseEuro, type Centesimi } from '../dominio/denaro.ts'

interface Props {
  etichetta: string
  valore: Centesimi | null
  onCambia: (valore: Centesimi | null) => void
  aiuto?: ReactNode
  /** Mostra il tasto ± (la tastiera decimale di iOS non ha il meno). */
  consentiNegativo?: boolean
  segnaposto?: string
}

/**
 * Campo per un importo in euro. Mentre si scrive conserva il testo digitato;
 * ogni valore valido viene propagato subito, così resta salvato anche se si
 * passa all'app della banca e il browser ricarica la pagina.
 */
export function CampoImporto({
  etichetta,
  valore,
  onCambia,
  aiuto,
  consentiNegativo = false,
  segnaposto = '0,00',
}: Props) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  // `null` quando non si sta modificando: allora si mostra il valore formattato.
  const [testo, setTesto] = useState<string | null>(null)
  const mostrato = testo ?? (valore === null ? '' : formattaNumero(valore))

  const letto = parseEuro(mostrato)
  const inCorso = /^\s*[-−]?\s*$/.test(mostrato) // vuoto, oppure solo il segno appena inserito con ±
  const errore =
    !inCorso && letto === null
      ? 'Importo non valido: usa la virgola per i decimali, massimo due cifre.'
      : letto !== null && letto < 0 && !consentiNegativo
        ? "L'importo non può essere negativo."
        : null

  function cambia(nuovoTesto: string) {
    setTesto(nuovoTesto)
    const importo = parseEuro(nuovoTesto)
    onCambia(importo !== null && (importo >= 0 || consentiNegativo) ? importo : null)
  }

  function esci() {
    // Il testo non valido resta visibile con il suo errore; quello valido torna nel formato standard.
    if (!errore) setTesto(null)
  }

  function cambiaSegno() {
    if (valore === null) {
      setTesto('−')
      campo.current?.focus()
      return
    }
    setTesto(null)
    onCambia(-valore)
  }

  const idDescrizione = `${id}-descrizione`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {etichetta}
      </label>
      <div className="mt-1 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">
            €
          </span>
          <input
            ref={campo}
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            placeholder={segnaposto}
            value={mostrato}
            aria-invalid={errore !== null}
            aria-describedby={errore || aiuto ? idDescrizione : undefined}
            onChange={(e) => cambia(e.target.value)}
            onBlur={esci}
            className={
              'h-12 w-full rounded-xl border bg-white pr-3 pl-8 text-lg tabular-nums shadow-inner outline-none ' +
              'focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 dark:bg-slate-900 ' +
              (errore ? 'border-red-500 dark:border-red-500' : 'border-slate-300 dark:border-slate-600')
            }
          />
        </div>
        {consentiNegativo && (
          <button
            type="button"
            onClick={cambiaSegno}
            aria-label={`Cambia il segno di ${etichetta}`}
            className={
              'h-12 w-12 shrink-0 rounded-xl border border-slate-300 bg-white text-xl text-slate-700 ' +
              'hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
            }
          >
            ±
          </button>
        )}
      </div>
      {(errore || aiuto) && (
        <p
          id={idDescrizione}
          className={`mt-1 text-sm ${errore ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {errore ?? aiuto}
        </p>
      )}
    </div>
  )
}
