import type { ReactNode } from 'react'
import type { Esito, Gravita } from '../dominio/giroconti.ts'
import { IconaAvviso, IconaBlocco, IconaInfo, IconaOk } from './icone.tsx'

const STILE: Record<Gravita, { classi: string; icona: ReactNode; etichetta: string }> = {
  bloccante: {
    classi: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100',
    icona: <IconaBlocco className="text-red-700 dark:text-red-400" />,
    etichetta: 'Bloccante',
  },
  attenzione: {
    classi: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    icona: <IconaAvviso className="text-amber-700 dark:text-amber-400" />,
    etichetta: 'Attenzione',
  },
  info: {
    classi: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
    icona: <IconaInfo className="text-sky-700 dark:text-sky-400" />,
    etichetta: 'Informazione',
  },
  ok: {
    classi: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
    icona: <IconaOk className="text-emerald-700 dark:text-emerald-400" />,
    etichetta: 'OK',
  },
}

export function MessaggioEsito({ esito, children }: { esito: Esito; children?: ReactNode }) {
  const stile = STILE[esito.gravita]
  return (
    <div className={`flex gap-3 rounded-xl border p-3 ${stile.classi}`}>
      <span className="mt-0.5 shrink-0">{stile.icona}</span>
      <div className="min-w-0">
        <p className="font-semibold">
          <span className="sr-only">{stile.etichetta}: </span>
          {esito.titolo}
        </p>
        <p className="mt-0.5 text-sm">{esito.messaggio}</p>
        {children}
      </div>
    </div>
  )
}

/** Esiti delle verifiche, dal più grave. Un contenuto extra può essere agganciato a un codice. */
export function ElencoEsiti({
  esiti,
  extra = {},
}: {
  esiti: readonly Esito[]
  extra?: Partial<Record<Esito['codice'], ReactNode>>
}) {
  if (esiti.length === 0) return null
  return (
    <ul className="space-y-2" aria-live="polite">
      {esiti.map((esito, i) => (
        <li key={`${esito.codice}-${i}`}>
          <MessaggioEsito esito={esito}>{extra[esito.codice]}</MessaggioEsito>
        </li>
      ))}
    </ul>
  )
}
