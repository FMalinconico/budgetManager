import type { ReactNode } from 'react'
import { IconaSpunta } from './icone.tsx'

export type StatoSezione = 'attiva' | 'completata' | 'in-attesa'

const ETICHETTA: Record<StatoSezione, string> = {
  attiva: 'Da fare',
  completata: 'Fatta',
  'in-attesa': 'In attesa',
}

/** Un passo del ciclo: numero, titolo, stato e contenuto. */
export function Sezione({
  numero,
  titolo,
  sottotitolo,
  stato,
  children,
}: {
  numero: number
  titolo: string
  sottotitolo?: ReactNode
  stato: StatoSezione
  children?: ReactNode
}) {
  return (
    <section
      aria-label={titolo}
      className={
        'rounded-2xl border bg-white p-4 shadow-sm sm:p-5 dark:bg-slate-900 ' +
        (stato === 'attiva' ? 'border-slate-300 dark:border-slate-700' : 'border-slate-200 dark:border-slate-800')
      }
    >
      <header className="flex items-start gap-3">
        <span
          className={
            'flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold ' +
            (stato === 'completata'
              ? 'bg-emerald-600 text-white'
              : stato === 'attiva'
                ? 'bg-teal-700 text-white'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400')
          }
        >
          {stato === 'completata' ? <IconaSpunta /> : numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h2 className={`text-lg font-bold ${stato === 'in-attesa' ? 'text-slate-500 dark:text-slate-400' : ''}`}>{titolo}</h2>
            <span
              className={
                'rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
                (stato === 'completata'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : stato === 'attiva'
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400')
              }
            >
              {ETICHETTA[stato]}
            </span>
          </div>
          {sottotitolo && <p className="text-sm text-slate-600 dark:text-slate-400">{sottotitolo}</p>}
        </div>
      </header>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}
