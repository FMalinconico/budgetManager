import { useState } from 'react'
import { formattaEuro, type Centesimi } from '../../dominio/denaro.ts'
import { calcolaCoperturaSforamento } from '../../dominio/giroconti.ts'
import { annullaCopertura, registraCopertura } from '../../stato/ciclo.ts'
import { adesso, nuovoId } from '../../stato/id.ts'
import { BottoneConConferma } from '../../ui/BottoneConConferma.tsx'
import { CampoImporto } from '../../ui/CampoImporto.tsx'
import { ElencoEsiti } from '../../ui/ElencoEsiti.tsx'
import { formattaDataBreve } from '../../ui/formato.ts'
import { SchedaBonifico } from '../../ui/SchedaBonifico.tsx'
import { BOTTONE_PRIMARIO } from '../../ui/stili.ts'
import type { PropsSezione } from './comuni.tsx'

/** Regola 6: se la casa sfora durante il ciclo, il buffer si prende da ING, mai dai conti sfizi. */
export function SezioneCopertura({ stato, aggiorna }: PropsSezione) {
  const ciclo = stato.cicloCorrente
  const [importo, setImporto] = useState<Centesimi | null>(null)
  const [saldoING, setSaldoING] = useState<Centesimi | null>(null)
  const saldoINGEffettivo = saldoING ?? stato.saldi.ing?.importo ?? null
  const risultato =
    importo !== null && importo > 0 ? calcolaCoperturaSforamento(importo, saldoINGEffettivo, ciclo.parametri) : null

  function registra() {
    if (importo === null) return
    aggiorna((s) => registraCopertura(s, importo, nuovoId(), adesso()))
    setImporto(null)
    setSaldoING(null)
  }

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-3 font-semibold">
        La casa ha sforato?
        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">Copri dal risparmio</span>
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Se su Intesa Frank non bastano i soldi prima di fine ciclo, il buffer si prende da ING, mai dai conti sfizi.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoImporto etichetta="Quanto manca su Intesa Frank" valore={importo} onCambia={setImporto} />
          <CampoImporto
            etichetta="Saldo ING"
            valore={saldoINGEffettivo}
            onCambia={setSaldoING}
            aiuto={saldoING === null && stato.saldi.ing ? 'Ultimo saldo registrato: correggilo se è cambiato.' : undefined}
          />
        </div>
        {risultato?.bonifico && (
          <>
            <ElencoEsiti esiti={risultato.esiti} />
            <SchedaBonifico bonifico={risultato.bonifico} evidenziato={!risultato.bloccato}>
              <button type="button" className={`${BOTTONE_PRIMARIO} w-full`} disabled={risultato.bloccato} onClick={registra}>
                Fatto: registra il giroconto
              </button>
            </SchedaBonifico>
          </>
        )}
        {ciclo.coperture.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">Coperture di questo ciclo</h3>
            <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-800">
              {ciclo.coperture.map((copertura) => (
                <li key={copertura.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    {formattaDataBreve(copertura.eseguitaIl)} · ING → Intesa Frank ·{' '}
                    <span className="font-semibold tabular-nums">{formattaEuro(copertura.importo)}</span>
                  </span>
                  <BottoneConConferma
                    etichetta="Annulla"
                    spiegazione="La copertura viene tolta e i saldi registrati di ING e Intesa Frank tornano come prima."
                    etichettaConferma="Annulla la copertura"
                    onConferma={() => aggiorna((s) => annullaCopertura(s, copertura.id, adesso()))}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
