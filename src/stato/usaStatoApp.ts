import { useCallback, useEffect, useState } from 'react'
import { statoIniziale } from './ciclo.ts'
import { adesso, nuovoId } from './id.ts'
import type { StatoApp } from './modello.ts'
import { archivioDelBrowser, caricaStato, CHIAVE_STATO, salvaStato, validaStatoApp } from './persistenza.ts'

export type Aggiorna = (modifica: (stato: StatoApp) => StatoApp) => void

/**
 * Stato dell'app salvato sul dispositivo a ogni modifica. Se l'app è aperta in
 * più schede, le modifiche fatte in una arrivano anche nelle altre.
 */
export function usaStatoApp() {
  const [caricamento] = useState(() =>
    caricaStato(archivioDelBrowser(), () => statoIniziale(adesso(), nuovoId()), adesso()),
  )
  const [stato, setStato] = useState<StatoApp>(caricamento.stato)
  const [avviso, setAvviso] = useState<string | null>(caricamento.avviso)
  const [salvataggioFallito, setSalvataggioFallito] = useState(false)

  useEffect(() => {
    const archivio = archivioDelBrowser()
    if (archivio) setSalvataggioFallito(!salvaStato(archivio, stato))
  }, [stato])

  useEffect(() => {
    function daAltraScheda(evento: StorageEvent) {
      if (evento.key !== CHIAVE_STATO || evento.newValue === null) return
      try {
        const nuovo = validaStatoApp(JSON.parse(evento.newValue))
        if (nuovo) setStato(nuovo)
      } catch {
        // Scrittura incompleta o estranea: si ignora.
      }
    }
    window.addEventListener('storage', daAltraScheda)
    return () => window.removeEventListener('storage', daAltraScheda)
  }, [])

  const aggiorna = useCallback<Aggiorna>((modifica) => setStato(modifica), [])
  const chiudiAvviso = useCallback(() => setAvviso(null), [])

  return { stato, aggiorna, avviso, chiudiAvviso, salvataggioFallito }
}
