import type { ReactNode } from 'react'
import { SchermataGiroconti } from './schermate/giroconti/SchermataGiroconti.tsx'
import { usaStatoApp } from './stato/usaStatoApp.ts'
import { IconaAvviso } from './ui/icone.tsx'
import { BOTTONE_SECONDARIO } from './ui/stili.ts'

export default function App() {
  const { stato, aggiorna, avviso, chiudiAvviso, salvataggioFallito } = usaStatoApp()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white" aria-hidden="true">
            €
          </span>
          <span className="text-base font-bold">Budget Famiglia</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {avviso && (
          <Banner>
            <p>{avviso}</p>
            <button type="button" className={`${BOTTONE_SECONDARIO} mt-2 min-h-10`} onClick={chiudiAvviso}>
              Ho capito
            </button>
          </Banner>
        )}
        {salvataggioFallito && (
          <Banner>
            <p>
              Non riesco a salvare i dati su questo dispositivo (spazio esaurito o navigazione privata): le ultime modifiche
              potrebbero andare perse.
            </p>
          </Banner>
        )}
        <SchermataGiroconti stato={stato} aggiorna={aggiorna} />
      </main>
    </div>
  )
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <IconaAvviso className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
