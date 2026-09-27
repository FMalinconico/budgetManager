import { useState } from 'react'
import { formattaEuro } from '../../dominio/denaro.ts'
import { faseCorrente } from '../../stato/ciclo.ts'
import type { Ciclo } from '../../stato/modello.ts'
import { formattaData } from '../../ui/formato.ts'
import { IconaOk, IconaSpunta } from '../../ui/icone.tsx'
import { BOTTONE_SECONDARIO } from '../../ui/stili.ts'
import type { PropsSezione } from './comuni.tsx'
import { SezioneChiusura, SezioneVerifica } from './SezioneChiusura.tsx'
import { SezioneCopertura } from './SezioneCopertura.tsx'
import { SezioneTranche1 } from './SezioneTranche1.tsx'
import { SezioneTranche2 } from './SezioneTranche2.tsx'

const eur = formattaEuro

export function SchermataGiroconti({ stato, aggiorna }: PropsSezione) {
  const [appenaChiuso, setAppenaChiuso] = useState(false)
  const ciclo = stato.cicloCorrente
  const ultimoChiuso = stato.cicliChiusi[0]

  function dopoLaChiusura() {
    setAppenaChiuso(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <IntestazioneCiclo ciclo={ciclo} />
      {appenaChiuso && ultimoChiuso && (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          <IconaOk className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Ciclo chiuso e archiviato</p>
            <p>
              Il nuovo ciclo parte con i residui sfizi di {eur(ultimoChiuso.chiusura.residuoSfiziFrank)} (Frank) e{' '}
              {eur(ultimoChiuso.chiusura.residuoSfiziMG)} (MG), già inseriti nelle tranche.
            </p>
            <button type="button" className={`${BOTTONE_SECONDARIO} mt-2 min-h-10`} onClick={() => setAppenaChiuso(false)}>
              Ok
            </button>
          </div>
        </div>
      )}
      <SezioneTranche1 stato={stato} aggiorna={aggiorna} />
      <SezioneTranche2 stato={stato} aggiorna={aggiorna} />
      <SezioneVerifica stato={stato} />
      <SezioneChiusura stato={stato} aggiorna={aggiorna} onChiuso={dopoLaChiusura} />
      <SezioneCopertura stato={stato} aggiorna={aggiorna} />
    </div>
  )
}

function IntestazioneCiclo({ ciclo }: { ciclo: Ciclo }) {
  const p = ciclo.parametri
  const fase = faseCorrente(ciclo)
  const passi = [
    { chiave: 'tranche1', etichetta: 'Tranche 1', fatto: ciclo.tranche1.completata !== null },
    { chiave: 'tranche2', etichetta: 'Tranche 2', fatto: ciclo.tranche2.completata !== null },
    { chiave: 'chiusura', etichetta: 'Chiusura', fatto: false },
  ] as const
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Giroconti</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Ciclo avviato il {formattaData(ciclo.avviatoIl)}</p>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Avanzamento del ciclo">
        {passi.map((passo) => {
          const attuale = passo.chiave === fase
          return (
            <li
              key={passo.chiave}
              aria-current={attuale ? 'step' : undefined}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ' +
                (passo.fatto
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : attuale
                    ? 'border-teal-600 bg-white text-teal-800 dark:bg-slate-900 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400')
              }
            >
              {passo.fatto && <IconaSpunta className="size-4" />}
              {passo.etichetta}
            </li>
          )
        })}
      </ol>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Regole del ciclo">
        {[
          ['Casa a inizio ciclo', eur(p.trasferimentoCasa)],
          p.quotaSfiziFrank === p.quotaSfiziMG
            ? ['Sfizi Frank e MG', `${eur(p.quotaSfiziFrank)} ciascuno`]
            : ['Sfizi Frank / MG', `${eur(p.quotaSfiziFrank)} / ${eur(p.quotaSfiziMG)}`],
          ['Target ING', eur(p.targetING, { segno: true })],
          ['Soglia intoccabile ING', eur(p.sogliaING)],
        ].map(([etichetta, valore]) => (
          <div key={etichetta} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{etichetta}</dt>
            <dd className="text-sm font-semibold tabular-nums">{valore}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
