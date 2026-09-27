import { formattaEuro, type Centesimi } from '../../dominio/denaro.ts'
import type { AnteprimaPianoAccorpato } from '../../dominio/giroconti.ts'
import {
  bozzaEffettivaTranche1,
  calcolaVistaTranche1,
  impostaCampoTranche1,
  riapriTranche1,
  scegliModalita,
  segnaBonificoTranche1,
  tranche1Modificabile,
  type VistaTranche1,
} from '../../stato/ciclo.ts'
import { adesso } from '../../stato/id.ts'
import type { BozzaTranche1 } from '../../stato/modello.ts'
import { BottoneConConferma } from '../../ui/BottoneConConferma.tsx'
import { CampoImporto } from '../../ui/CampoImporto.tsx'
import { ElencoEsiti } from '../../ui/ElencoEsiti.tsx'
import { formattaData, formattaDataBreve } from '../../ui/formato.ts'
import { RiepilogoSaldi, RisparmioReale } from '../../ui/RiepilogoSaldi.tsx'
import { CasellaFatto, NumeroBonifico, SchedaBonifico, Tratta } from '../../ui/SchedaBonifico.tsx'
import { Sezione } from '../../ui/Sezione.tsx'
import { BOTTONE_PRIMARIO, BOTTONE_SECONDARIO } from '../../ui/stili.ts'
import {
  BonificiFatti,
  prossimoBonifico,
  SaldiInseriti,
  Suggerimento,
  VariazioneING,
  type PropsSezione,
} from './comuni.tsx'

const eur = formattaEuro

export function SezioneTranche1({ stato, aggiorna }: PropsSezione) {
  const ciclo = stato.cicloCorrente
  const { tranche1, parametri: p } = ciclo
  const completata = tranche1.completata

  if (completata) {
    return (
      <Sezione
        numero={1}
        titolo="Tranche 1"
        stato="completata"
        sottotitolo={`Stipendio di Frank · fatta il ${formattaData(completata.completataIl)}`}
      >
        <BonificiFatti bonifici={completata.bonifici} />
        <div className="mt-2 space-y-1">
          <VariazioneING tranche={completata} />
          {completata.modalita === 'accorpato' && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Piano accorpato: {eur(completata.importoDifferito)} restano fermi su Buddybank per il bonifico unico della tranche 2.
            </p>
          )}
        </div>
        {tranche1Modificabile(ciclo) && (
          <div className="mt-3">
            <BottoneConConferma
              etichetta="Riapri la tranche 1"
              spiegazione="I bonifici tornano da segnare e i saldi registrati tornano quelli di prima. Serve solo per correggere un errore."
              etichettaConferma="Riapri"
              onConferma={() => aggiorna(riapriTranche1)}
            />
          </div>
        )}
      </Sezione>
    )
  }

  const bozza = bozzaEffettivaTranche1(ciclo, stato.saldi)
  const bloccataBozza = tranche1.eseguiti.length > 0
  const vista = calcolaVistaTranche1(ciclo, stato.saldi)
  const imposta = (campo: keyof BozzaTranche1) => (valore: Centesimi | null) =>
    aggiorna((s) => impostaCampoTranche1(s, campo, valore))
  const saldoINGRegistrato = tranche1.bozza.saldoING === null ? stato.saldi.ing : null

  return (
    <Sezione numero={1} titolo="Tranche 1" stato="attiva" sottotitolo="All'arrivo dello stipendio di Frank">
      {bloccataBozza ? (
        <SaldiInseriti
          voci={[
            { etichetta: 'Buddybank', importo: bozza.saldoBuddybank },
            { etichetta: 'Intesa Frank', importo: bozza.saldoIntesaFrank },
            { etichetta: 'Residuo sfizi Frank', importo: bozza.residuoSfiziFrank },
            { etichetta: 'ING', importo: bozza.saldoING },
          ]}
          onModifica={() => aggiorna(riapriTranche1)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoImporto
            etichetta="Saldo Buddybank"
            valore={bozza.saldoBuddybank}
            onCambia={imposta('saldoBuddybank')}
            aiuto="Con lo stipendio di Frank (parte A) già accreditato."
          />
          <CampoImporto
            etichetta="Saldo Intesa Frank"
            valore={bozza.saldoIntesaFrank}
            onCambia={imposta('saldoIntesaFrank')}
            consentiNegativo
            aiuto="Con lo stipendio di Frank (parte B) già accreditato."
          />
          <CampoImporto
            etichetta="Residuo sfizi Frank"
            valore={bozza.residuoSfiziFrank}
            onCambia={imposta('residuoSfiziFrank')}
            consentiNegativo
            aiuto={
              stato.cicliChiusi.length > 0
                ? `Rilevato alla chiusura del ciclo precedente: ${eur(ciclo.residuiIniziali.frank)}. La quota di ${eur(p.quotaSfiziFrank)} si aggiunge sopra.`
                : `Quanto è avanzato degli sfizi del mese scorso su Buddybank (0 se niente). La quota di ${eur(p.quotaSfiziFrank)} si aggiunge sopra.`
            }
          />
          <CampoImporto
            etichetta="Saldo ING"
            valore={bozza.saldoING}
            onCambia={imposta('saldoING')}
            aiuto={
              saldoINGRegistrato
                ? `Ultimo saldo registrato (${formattaDataBreve(saldoINGRegistrato.aggiornatoIl)}): correggilo se è cambiato.`
                : `Serve per verificare la soglia intoccabile di ${eur(p.sogliaING)} e i fondi per il bonifico 3.`
            }
          />
        </div>
      )}

      <div className="mt-5">
        {vista ? (
          <PianoTranche1 vista={vista} {...{ stato, aggiorna }} />
        ) : (
          <Suggerimento>
            Inserisci i saldi di Buddybank e Intesa Frank dopo l'accredito dello stipendio: qui compariranno i bonifici da
            fare, in ordine.
          </Suggerimento>
        )}
      </div>
    </Sezione>
  )
}

function PianoTranche1({ vista, stato, aggiorna }: PropsSezione & { vista: VistaTranche1 }) {
  const ciclo = stato.cicloCorrente
  const { risultato } = vista
  const { eseguiti } = ciclo.tranche1
  const prossimo = prossimoBonifico(risultato.bonifici, eseguiti, risultato.bloccato)
  const segna = (numero: string) => (fatto: boolean) =>
    aggiorna((s) => segnaBonificoTranche1(s, numero, fatto, adesso()))

  const extra =
    vista.modalita === 'standard' && vista.risultato.pianoAccorpato
      ? {
          ACCREDITO_ING_SOTTO_MINIMO: (
            <PropostaPianoAccorpato
              anteprima={vista.risultato.pianoAccorpato}
              anticipoCasa={ciclo.parametri.trasferimentoCasa}
              onScegli={() => aggiorna((s) => scegliModalita(s, 'accorpato'))}
            />
          ),
        }
      : {}

  return (
    <div className="space-y-4">
      {vista.modalita === 'accorpato' && <AvvisoPianoAccorpato {...{ stato, aggiorna }} />}
      <ElencoEsiti esiti={risultato.esiti} extra={extra} />
      <ol className="space-y-3" aria-label="Bonifici della tranche 1">
        {risultato.bonifici.map((bonifico) => (
          <li key={bonifico.numero} className="space-y-3">
            {vista.modalita === 'accorpato' && bonifico.numero === '3' && <BonificoRinviato />}
            <SchedaBonifico
              bonifico={bonifico}
              fatto={eseguiti.includes(bonifico.numero)}
              evidenziato={bonifico.numero === prossimo}
              bloccato={risultato.bloccato}
              seNonServe="Intesa Frank è vuoto: niente da spostare, si passa al bonifico successivo."
            >
              <CasellaFatto
                fatto={eseguiti.includes(bonifico.numero)}
                disabilitata={risultato.bloccato && !eseguiti.includes(bonifico.numero)}
                onCambia={segna(bonifico.numero)}
              />
            </SchedaBonifico>
          </li>
        ))}
      </ol>
      {!risultato.bloccato && <SaldiDopoTranche1 vista={vista} {...{ stato, aggiorna }} />}
    </div>
  )
}

function PropostaPianoAccorpato({
  anteprima,
  anticipoCasa,
  onScegli,
}: {
  anteprima: AnteprimaPianoAccorpato
  anticipoCasa: Centesimi
  onScegli: () => void
}) {
  if (!anteprima.raggiungeMinimo) return null
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-white/70 p-3 text-sm text-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
      <p>
        <strong>Piano accorpato:</strong> il bonifico 2 ({eur(anteprima.importoDifferito)}) resta su Buddybank e, all'arrivo
        dello stipendio di MG, parte un unico bonifico verso ING di circa <strong>{eur(anteprima.stimaBonificoUnico)}</strong>{' '}
        ({eur(anteprima.importoDifferito)} di Frank + {eur(anteprima.stimaQuotaMG)} previsti di MG). Intanto ING anticipa i{' '}
        {eur(anticipoCasa)} per la casa.
      </p>
      <button type="button" className={`${BOTTONE_PRIMARIO} w-full sm:w-auto`} onClick={onScegli}>
        Usa il piano accorpato
      </button>
    </div>
  )
}

function AvvisoPianoAccorpato({ stato, aggiorna }: PropsSezione) {
  const ciclo = stato.cicloCorrente
  const puoTornare = ciclo.tranche1.eseguiti.length === 0
  const standard = calcolaVistaTranche1({ ...ciclo, modalita: 'standard' }, stato.saldi)
  const standardPossibile = standard !== null && !standard.risultato.bloccato
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
      <p className="font-semibold">Piano accorpato attivo</p>
      <p className="mt-0.5">
        Il bonifico 2 è rinviato alla tranche 2: partirà insieme alla quota di MG in un unico bonifico da Buddybank a ING.
      </p>
      {puoTornare && (
        <div className="mt-2">
          {standardPossibile && <p className="mb-2 font-medium">Con questi saldi il piano standard rispetta tutte le regole.</p>}
          <button
            type="button"
            className={standardPossibile ? BOTTONE_PRIMARIO : BOTTONE_SECONDARIO}
            onClick={() => aggiorna((s) => scegliModalita(s, 'standard'))}
          >
            Torna al piano standard
          </button>
        </div>
      )}
    </div>
  )
}

function BonificoRinviato() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-teal-300 p-4 text-teal-900 dark:border-teal-800 dark:text-teal-200">
      <NumeroBonifico numero="2" />
      <div className="min-w-0">
        <Tratta bonifico={{ da: 'buddybank', a: 'ing' }} />
        <p className="text-sm">Rinviato alla tranche 2: diventa il bonifico unico insieme alla quota di MG.</p>
      </div>
    </div>
  )
}

function SaldiDopoTranche1({ vista, stato }: PropsSezione & { vista: VistaTranche1 }) {
  const p = stato.cicloCorrente.parametri
  const { risultato } = vista
  const saldoING = risultato.saldoINGDopo
  const notaING = (
    <>
      <span className="text-slate-600 dark:text-slate-400">{eur(risultato.variazioneNettaING, { segno: true })} netti</span>
      {saldoING !== null && (
        <>
          {' · '}
          <RisparmioReale saldoING={saldoING} parametri={p} />
        </>
      )}
    </>
  )
  return (
    <RiepilogoSaldi
      titolo="Dopo questi bonifici"
      righe={[
        {
          conto: 'buddybank',
          importo: risultato.restaSuBuddybank,
          nota:
            vista.modalita === 'accorpato' ? (
              <span className="text-slate-600 dark:text-slate-400">
                di cui {eur(vista.risultato.importoDifferito)} da non toccare
              </span>
            ) : (
              <span className="text-slate-600 dark:text-slate-400">quota sfizi di Frank</span>
            ),
        },
        { conto: 'intesaFrank', importo: risultato.restaSuIntesaFrank },
        { conto: 'ing', importo: saldoING, nota: notaING },
      ]}
    />
  )
}
