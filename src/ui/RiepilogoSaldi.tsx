import type { ReactNode } from 'react'
import { NOME_CONTO, RUOLO_CONTO, type ContoId } from '../dominio/conti.ts'
import { formattaEuro, type Centesimi } from '../dominio/denaro.ts'
import { risparmioReale, statoSoglia, type ParametriCalcolo } from '../dominio/giroconti.ts'

const COLORE_SOGLIA = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  vicino: 'text-amber-700 dark:text-amber-400',
  sotto: 'text-red-700 dark:text-red-400',
} as const

/** Regola 2: accanto al saldo ING si mostra sempre il risparmio reale (saldo − soglia). */
export function RisparmioReale({ saldoING, parametri }: { saldoING: Centesimi; parametri: ParametriCalcolo }) {
  const stato = statoSoglia(saldoING, parametri)
  return (
    <span className={`font-medium ${COLORE_SOGLIA[stato]}`}>
      risparmio reale {formattaEuro(risparmioReale(saldoING, parametri.sogliaING))}
      {stato === 'sotto' && ' (soglia intaccata)'}
    </span>
  )
}

export interface RigaSaldo {
  conto: ContoId
  importo: Centesimi | null
  nota?: ReactNode
}

export function RiepilogoSaldi({ titolo, righe }: { titolo: string; righe: readonly RigaSaldo[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{titolo}</h3>
      <dl className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
        {righe.map((riga) => (
          <div key={riga.conto} className="flex items-start justify-between gap-3 py-2">
            <dt className="min-w-0">
              <span className="font-medium">{NOME_CONTO[riga.conto]}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{RUOLO_CONTO[riga.conto]}</span>
            </dt>
            <dd className="text-right">
              <span className="font-semibold tabular-nums">{riga.importo === null ? '—' : formattaEuro(riga.importo)}</span>
              {riga.nota && <span className="block text-xs">{riga.nota}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
