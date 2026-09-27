import type { ContoId } from '../../dominio/conti.ts'
import { formattaEuro, somma, type Centesimi } from '../../dominio/denaro.ts'
import type { RisultatoChiusura } from '../../dominio/giroconti.ts'
import {
  calcolaVerifica,
  calcolaVistaChiusura,
  chiudiCiclo,
  impostaCampoChiusura,
  riapriChiusura,
  saldiDopoChiusura,
  segnaBonificoChiusura,
} from '../../stato/ciclo.ts'
import { adesso, nuovoId } from '../../stato/id.ts'
import type { BozzaChiusura, StatoApp } from '../../stato/modello.ts'
import { BottoneConConferma } from '../../ui/BottoneConConferma.tsx'
import { CampoImporto } from '../../ui/CampoImporto.tsx'
import { ElencoEsiti, MessaggioEsito } from '../../ui/ElencoEsiti.tsx'
import { formattaDataBreve } from '../../ui/formato.ts'
import { RiepilogoSaldi, RisparmioReale } from '../../ui/RiepilogoSaldi.tsx'
import { CasellaFatto, SchedaBonifico } from '../../ui/SchedaBonifico.tsx'
import { Sezione } from '../../ui/Sezione.tsx'
import { BOTTONE_PRIMARIO } from '../../ui/stili.ts'
import { prossimoBonifico, SaldiInseriti, Suggerimento, type PropsSezione } from './comuni.tsx'

const eur = formattaEuro

/** Somma delle variazioni nette di ING delle due tranche, confrontata con il target (767 €). */
export function SezioneVerifica({ stato }: { stato: StatoApp }) {
  const verifica = calcolaVerifica(stato.cicloCorrente)
  if (!verifica) return null
  const voci = [
    ['Tranche 1', verifica.variazioneTranche1],
    ['Tranche 2', verifica.variazioneTranche2],
    ['Totale', verifica.totale],
  ] as const
  return (
    <section
      aria-label="Verifica di fine ciclo"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-lg font-bold">Verifica di fine ciclo</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Variazione netta su ING, target {eur(verifica.target, { segno: true })}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {voci.map(([etichetta, valore]) => (
          <div key={etichetta} className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800/50">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{etichetta}</dt>
            <dd className={`tabular-nums ${etichetta === 'Totale' ? 'text-lg font-bold' : 'font-semibold'}`}>
              {eur(valore, { segno: true })}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <MessaggioEsito esito={verifica.esito} />
      </div>
    </section>
  )
}

export function SezioneChiusura({ stato, aggiorna, onChiuso }: PropsSezione & { onChiuso: () => void }) {
  const ciclo = stato.cicloCorrente
  if (!ciclo.tranche2.completata) {
    return (
      <Sezione
        numero={3}
        titolo="Chiusura del ciclo"
        stato="in-attesa"
        sottotitolo="A fine mese, prima del prossimo stipendio di Frank. Si sblocca finita la tranche 2."
      />
    )
  }

  const { bozza, eseguiti } = ciclo.chiusura
  const bloccataBozza = eseguiti.length > 0
  const vista = calcolaVistaChiusura(ciclo)
  const imposta = (campo: keyof BozzaChiusura) => (valore: Centesimi | null) =>
    aggiorna((s) => impostaCampoChiusura(s, campo, valore))
  const ultimoNoto = (conto: ContoId) => {
    const saldo = stato.saldi[conto]
    return saldo ? `Ultimo saldo registrato: ${eur(saldo.importo)} (${formattaDataBreve(saldo.aggiornatoIl)}).` : undefined
  }

  return (
    <Sezione numero={3} titolo="Chiusura del ciclo" stato="attiva" sottotitolo="A fine mese, prima del prossimo stipendio di Frank">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Inserisci i saldi reali dei quattro conti: l'avanzo della casa va girato su ING, uno sforamento si copre da ING, e i
        saldi dei conti sfizi diventano i residui del prossimo ciclo.
      </p>
      {bloccataBozza ? (
        <div className="mt-4">
          <SaldiInseriti
            voci={[
              { etichetta: 'Intesa Frank', importo: bozza.saldoIntesaFrank },
              { etichetta: 'ING', importo: bozza.saldoING },
              { etichetta: 'Buddybank', importo: bozza.saldoBuddybank },
              { etichetta: 'Intesa MG', importo: bozza.saldoIntesaMG },
            ]}
            onModifica={() => aggiorna(riapriChiusura)}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CampoImporto
            etichetta="Saldo Intesa Frank"
            valore={bozza.saldoIntesaFrank}
            onCambia={imposta('saldoIntesaFrank')}
            consentiNegativo
            aiuto={ultimoNoto('intesaFrank')}
          />
          <CampoImporto etichetta="Saldo ING" valore={bozza.saldoING} onCambia={imposta('saldoING')} aiuto={ultimoNoto('ing')} />
          <CampoImporto
            etichetta="Saldo Buddybank"
            valore={bozza.saldoBuddybank}
            onCambia={imposta('saldoBuddybank')}
            consentiNegativo
            aiuto={ultimoNoto('buddybank')}
          />
          <CampoImporto
            etichetta="Saldo Intesa MG"
            valore={bozza.saldoIntesaMG}
            onCambia={imposta('saldoIntesaMG')}
            consentiNegativo
            aiuto={ultimoNoto('intesaMG')}
          />
        </div>
      )}

      <div className="mt-5">
        {vista ? (
          <PianoChiusura vista={vista} {...{ stato, aggiorna, onChiuso }} />
        ) : (
          <Suggerimento>Inserisci tutti e quattro i saldi per vedere i giroconti di chiusura e i residui del prossimo ciclo.</Suggerimento>
        )}
      </div>
    </Sezione>
  )
}

function PianoChiusura({
  vista,
  stato,
  aggiorna,
  onChiuso,
}: PropsSezione & { vista: RisultatoChiusura; onChiuso: () => void }) {
  const ciclo = stato.cicloCorrente
  const { eseguiti } = ciclo.chiusura
  const prossimo = prossimoBonifico(vista.bonifici, eseguiti, vista.bloccato)
  const nonSegnati = vista.bonifici.filter((b) => b.necessario && !eseguiti.includes(b.numero))
  const dopo = saldiDopoChiusura(ciclo)
  const totaleCoperture = somma(ciclo.coperture.map((c) => c.importo))

  return (
    <div className="space-y-4">
      <ElencoEsiti esiti={vista.esiti} />
      {vista.bonifici.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Il conto casa è a zero: nessun giroconto di chiusura.</p>
      )}
      <ol className="space-y-3" aria-label="Giroconti di chiusura">
        {vista.bonifici.map((bonifico) => (
          <li key={bonifico.numero}>
            <SchedaBonifico
              bonifico={bonifico}
              fatto={eseguiti.includes(bonifico.numero)}
              evidenziato={bonifico.numero === prossimo}
              bloccato={vista.bloccato}
            >
              <CasellaFatto
                fatto={eseguiti.includes(bonifico.numero)}
                disabilitata={vista.bloccato && !eseguiti.includes(bonifico.numero)}
                onCambia={(fatto) => aggiorna((s) => segnaBonificoChiusura(s, bonifico.numero, fatto))}
              />
            </SchedaBonifico>
          </li>
        ))}
      </ol>

      {dopo && (
        <RiepilogoSaldi
          titolo="Per il prossimo ciclo"
          righe={[
            {
              conto: 'buddybank',
              importo: vista.residuoSfiziFrank,
              nota: <span className="text-slate-600 dark:text-slate-400">residuo sfizi di Frank</span>,
            },
            {
              conto: 'intesaMG',
              importo: vista.residuoSfiziMG,
              nota: <span className="text-slate-600 dark:text-slate-400">residuo sfizi di MG</span>,
            },
            { conto: 'ing', importo: dopo.ing, nota: <RisparmioReale saldoING={dopo.ing} parametri={ciclo.parametri} /> },
          ]}
        />
      )}
      {totaleCoperture > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Durante il ciclo sono stati presi {eur(totaleCoperture)} dal risparmio per coprire la casa.
        </p>
      )}

      <BottoneConConferma
        etichetta="Chiudi il ciclo e inizia il prossimo"
        classi={`${BOTTONE_PRIMARIO} w-full`}
        classiConferma={BOTTONE_PRIMARIO}
        etichettaConferma="Chiudi il ciclo"
        spiegazione={
          <>
            <p>
              Il ciclo viene archiviato con i bonifici fatti e i saldi finali. Il prossimo parte con i residui sfizi di{' '}
              {eur(vista.residuoSfiziFrank)} (Frank) e {eur(vista.residuoSfiziMG)} (MG).
            </p>
            {nonSegnati.length > 0 && (
              <p className="mt-2 font-medium text-amber-800 dark:text-amber-300">
                Il giroconto {nonSegnati.map((b) => b.numero).join(', ')} non è segnato come fatto: non verrà applicato ai saldi.
              </p>
            )}
          </>
        }
        onConferma={() => {
          aggiorna((s) => chiudiCiclo(s, adesso(), nuovoId()))
          onChiuso()
        }}
      />
    </div>
  )
}
