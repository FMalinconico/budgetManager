import { useState, type ReactNode } from 'react'
import { BOTTONE_SECONDARIO } from './stili.ts'

/**
 * Bottone per le azioni da confermare: al primo tap mostra la spiegazione e
 * i bottoni Conferma / Annulla, senza finestre di dialogo del browser.
 */
export function BottoneConConferma({
  etichetta,
  spiegazione,
  etichettaConferma,
  onConferma,
  classi = BOTTONE_SECONDARIO,
  classiConferma = BOTTONE_SECONDARIO,
  disabilitato = false,
}: {
  etichetta: ReactNode
  spiegazione: ReactNode
  etichettaConferma: string
  onConferma: () => void
  classi?: string
  classiConferma?: string
  disabilitato?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  if (!aperto) {
    return (
      <button type="button" className={classi} disabled={disabilitato} onClick={() => setAperto(true)}>
        {etichetta}
      </button>
    )
  }
  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/60" role="group">
      <div className="text-sm">{spiegazione}</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={classiConferma}
          onClick={() => {
            setAperto(false)
            onConferma()
          }}
        >
          {etichettaConferma}
        </button>
        <button type="button" className={BOTTONE_SECONDARIO} onClick={() => setAperto(false)}>
          Annulla
        </button>
      </div>
    </div>
  )
}
