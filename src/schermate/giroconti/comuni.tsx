import type { ReactNode } from 'react'
import { formattaEuro, type Centesimi } from '../../dominio/denaro.ts'
import type { Bonifico } from '../../dominio/giroconti.ts'
import type { StatoApp, TrancheCompletata } from '../../stato/modello.ts'
import type { Aggiorna } from '../../stato/usaStatoApp.ts'
import { BottoneConConferma } from '../../ui/BottoneConConferma.tsx'
import { NumeroBonifico, Tratta } from '../../ui/SchedaBonifico.tsx'
import { LINK } from '../../ui/stili.ts'

export interface PropsSezione {
  stato: StatoApp
  aggiorna: Aggiorna
}

export function Suggerimento({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  )
}

/** Il primo bonifico necessario non ancora segnato: è quello da fare adesso. */
export function prossimoBonifico(bonifici: readonly Bonifico[], eseguiti: readonly string[], bloccato: boolean): string | null {
  if (bloccato) return null
  return bonifici.find((b) => b.necessario && !eseguiti.includes(b.numero))?.numero ?? null
}

/** Elenco compatto dei bonifici di una tranche già fatta. */
export function BonificiFatti({ bonifici }: { bonifici: readonly Bonifico[] }) {
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {bonifici.map((b) => (
        <li key={b.numero} className="flex items-center gap-3 py-2">
          <NumeroBonifico numero={b.numero} />
          <span className="min-w-0 flex-1 text-sm">
            <Tratta bonifico={b} />
          </span>
          <span className="font-semibold tabular-nums">{formattaEuro(b.importo)}</span>
        </li>
      ))}
    </ul>
  )
}

export function VariazioneING({ tranche }: { tranche: TrancheCompletata }) {
  return (
    <p className="text-sm text-slate-600 dark:text-slate-400">
      Variazione netta su ING:{' '}
      <span className="font-semibold text-slate-900 tabular-nums dark:text-slate-100">
        {formattaEuro(tranche.variazioneNettaING, { segno: true })}
      </span>
    </p>
  )
}

/**
 * I saldi di una fase in cui è già segnato qualche bonifico: non si possono più
 * cambiare, quindi al posto dei campi resta un riepilogo compatto.
 */
export function SaldiInseriti({
  voci,
  onModifica,
}: {
  voci: readonly { etichetta: string; importo: Centesimi | null }[]
  onModifica: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Saldi inseriti</h3>
      <dl className="mt-1 grid gap-x-6 sm:grid-cols-2">
        {voci.map((voce) => (
          <div key={voce.etichetta} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <dt className="text-slate-600 dark:text-slate-400">{voce.etichetta}</dt>
            <dd className="font-semibold tabular-nums">{voce.importo === null ? '—' : formattaEuro(voce.importo)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2">
        <BottoneConConferma
          etichetta="Modifica i saldi"
          classi={`${LINK} text-sm`}
          spiegazione="Per cambiare i saldi vanno tolti i segni dai bonifici: quelli già fatti in banca andranno segnati di nuovo."
          etichettaConferma="Togli i segni"
          onConferma={onModifica}
        />
      </div>
    </div>
  )
}
