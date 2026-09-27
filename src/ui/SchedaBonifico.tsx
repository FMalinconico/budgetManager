import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NOME_CONTO } from '../dominio/conti.ts'
import { formattaEuro, formattaPerCopia } from '../dominio/denaro.ts'
import type { Bonifico } from '../dominio/giroconti.ts'
import { copiaNegliAppunti } from './copia.ts'
import { IconaCopia, IconaFreccia, IconaSpunta } from './icone.tsx'

type StatoCopia = 'pronto' | 'copiato' | 'fallito'

/** L'importo è un bottone: un tap lo copia negli appunti, pronto da incollare nell'app della banca. */
export function ImportoCopiabile({ importo, disabilitato = false }: { importo: number; disabilitato?: boolean }) {
  const [stato, setStato] = useState<StatoCopia>('pronto')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copia() {
    const riuscito = await copiaNegliAppunti(formattaPerCopia(importo))
    setStato(riuscito ? 'copiato' : 'fallito')
    if (riuscito) navigator.vibrate?.(15)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStato('pronto'), riuscito ? 2000 : 4000)
  }

  return (
    <div>
      <button
        type="button"
        onClick={copia}
        disabled={disabilitato}
        aria-label={`Copia l'importo ${formattaEuro(importo)}`}
        className={
          'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ' +
          (stato === 'copiato'
            ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800')
        }
      >
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formattaEuro(importo)}</span>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${
            disabilitato
              ? 'hidden'
              : stato === 'copiato'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-teal-700 dark:text-teal-400'
          }`}
        >
          {stato === 'copiato' ? <IconaSpunta /> : <IconaCopia />}
          {stato === 'copiato' ? 'Copiato' : 'Copia'}
        </span>
      </button>
      <p className="sr-only" aria-live="polite">
        {stato === 'copiato' ? 'Importo copiato negli appunti' : ''}
      </p>
      {stato === 'fallito' && (
        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
          Copia non riuscita: nell'app della banca scrivi <span className="font-semibold tabular-nums">{formattaPerCopia(importo)}</span>
        </p>
      )}
    </div>
  )
}

export function Tratta({ bonifico }: { bonifico: Pick<Bonifico, 'da' | 'a'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 font-semibold">
      {NOME_CONTO[bonifico.da]}
      <IconaFreccia className="size-4 text-slate-400" />
      <span className="sr-only">verso</span>
      {NOME_CONTO[bonifico.a]}
    </span>
  )
}

export function NumeroBonifico({ numero, fatto = false }: { numero: string; fatto?: boolean }) {
  return (
    <span
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${
        fatto ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
      }`}
    >
      {fatto ? <IconaSpunta className="size-4" /> : numero}
    </span>
  )
}

interface Props {
  bonifico: Bonifico
  fatto?: boolean
  /** Il prossimo bonifico da fare: viene messo in evidenza. */
  evidenziato?: boolean
  /** Il piano è bloccato: la scheda resta visibile ma attenuata e l'importo non si copia. */
  bloccato?: boolean
  /** Spiegazione al posto dell'importo quando il bonifico non serve. */
  seNonServe?: string
  children?: ReactNode
}

export function SchedaBonifico({ bonifico, fatto = false, evidenziato = false, bloccato = false, seNonServe, children }: Props) {
  if (!bonifico.necessario) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <NumeroBonifico numero={bonifico.numero} />
        <div className="min-w-0">
          <Tratta bonifico={bonifico} />
          <p className="text-sm">{seNonServe ?? 'Niente da spostare: questo bonifico si salta.'}</p>
        </div>
      </div>
    )
  }
  return (
    <div
      className={
        'space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ' +
        (bloccato && !fatto ? 'opacity-60 ' : '') +
        (fatto
          ? 'border-emerald-300 dark:border-emerald-800'
          : evidenziato
            ? 'border-teal-500 ring-2 ring-teal-500/30'
            : 'border-slate-200 dark:border-slate-700')
      }
    >
      <div className="flex items-start gap-3">
        <NumeroBonifico numero={bonifico.numero} fatto={fatto} />
        <div className="min-w-0">
          <Tratta bonifico={bonifico} />
          <p className="text-sm text-slate-600 dark:text-slate-400">{bonifico.descrizione}</p>
        </div>
      </div>
      <ImportoCopiabile importo={bonifico.importo} disabilitato={bloccato && !fatto} />
      {children}
    </div>
  )
}

/** Casella grande per segnare un bonifico come eseguito. */
export function CasellaFatto({
  fatto,
  disabilitata,
  onCambia,
}: {
  fatto: boolean
  disabilitata: boolean
  onCambia: (fatto: boolean) => void
}) {
  return (
    <label
      className={
        'flex min-h-12 items-center gap-3 rounded-xl border px-4 font-medium select-none ' +
        (disabilitata ? 'cursor-not-allowed opacity-60 ' : 'cursor-pointer ') +
        (fatto
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
          : 'border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100')
      }
    >
      <input
        type="checkbox"
        className="size-6 shrink-0 accent-emerald-600"
        checked={fatto}
        disabled={disabilitata}
        onChange={(e) => onCambia(e.target.checked)}
      />
      {fatto ? 'Fatto' : 'Segna come fatto'}
    </label>
  )
}
