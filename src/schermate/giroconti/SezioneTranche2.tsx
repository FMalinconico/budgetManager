import { formattaEuro, type Centesimi } from '../../dominio/denaro.ts'
import { applicaBonifici } from '../../dominio/giroconti.ts'
import {
  bozzaEffettivaTranche2,
  calcolaVistaTranche2,
  impostaCampoTranche2,
  riapriTranche2,
  segnaBonificoTranche2,
  tranche2Modificabile,
  type VistaTranche2,
} from '../../stato/ciclo.ts'
import { adesso } from '../../stato/id.ts'
import type { BozzaTranche2 } from '../../stato/modello.ts'
import { BottoneConConferma } from '../../ui/BottoneConConferma.tsx'
import { CampoImporto } from '../../ui/CampoImporto.tsx'
import { ElencoEsiti } from '../../ui/ElencoEsiti.tsx'
import { formattaData, formattaDataBreve } from '../../ui/formato.ts'
import { RiepilogoSaldi, RisparmioReale, type RigaSaldo } from '../../ui/RiepilogoSaldi.tsx'
import { CasellaFatto, SchedaBonifico } from '../../ui/SchedaBonifico.tsx'
import { Sezione } from '../../ui/Sezione.tsx'
import {
  BonificiFatti,
  prossimoBonifico,
  SaldiInseriti,
  Suggerimento,
  VariazioneING,
  type PropsSezione,
} from './comuni.tsx'

const eur = formattaEuro

export function SezioneTranche2({ stato, aggiorna }: PropsSezione) {
  const ciclo = stato.cicloCorrente
  const { tranche1, tranche2, parametri: p } = ciclo

  if (!tranche1.completata) {
    return (
      <Sezione
        numero={2}
        titolo="Tranche 2"
        stato="in-attesa"
        sottotitolo="All'arrivo dello stipendio di MG, circa dieci giorni dopo. Si sblocca finita la tranche 1."
      />
    )
  }

  const completata = tranche2.completata
  if (completata) {
    return (
      <Sezione
        numero={2}
        titolo="Tranche 2"
        stato="completata"
        sottotitolo={`Stipendio di MG · fatta il ${formattaData(completata.completataIl)}`}
      >
        <BonificiFatti bonifici={completata.bonifici} />
        <div className="mt-2">
          <VariazioneING tranche={completata} />
        </div>
        {tranche2Modificabile(ciclo) && (
          <div className="mt-3">
            <BottoneConConferma
              etichetta="Riapri la tranche 2"
              spiegazione="I bonifici tornano da segnare e i saldi registrati tornano quelli di prima. Serve solo per correggere un errore."
              etichettaConferma="Riapri"
              onConferma={() => aggiorna(riapriTranche2)}
            />
          </div>
        )}
      </Sezione>
    )
  }

  const accorpato = tranche1.completata.modalita === 'accorpato'
  const bozza = bozzaEffettivaTranche2(ciclo, stato.saldi)
  const bloccataBozza = tranche2.eseguiti.length > 0
  const vista = calcolaVistaTranche2(ciclo, stato.saldi)
  const imposta = (campo: keyof BozzaTranche2) => (valore: Centesimi | null) =>
    aggiorna((s) => impostaCampoTranche2(s, campo, valore))
  const registrato = (conto: 'ing' | 'buddybank', inBozza: Centesimi | null) =>
    inBozza === null ? stato.saldi[conto] : null
  const ingRegistrato = registrato('ing', tranche2.bozza.saldoING)
  const buddybankRegistrato = registrato('buddybank', tranche2.bozza.saldoBuddybank)

  return (
    <Sezione
      numero={2}
      titolo="Tranche 2"
      stato="attiva"
      sottotitolo={accorpato ? "All'arrivo dello stipendio di MG · piano accorpato" : "All'arrivo dello stipendio di MG"}
    >
      {bloccataBozza ? (
        <SaldiInseriti
          voci={[
            { etichetta: 'Intesa MG', importo: bozza.saldoIntesaMG },
            { etichetta: 'Residuo sfizi MG', importo: bozza.residuoSfiziMG },
            { etichetta: 'ING', importo: bozza.saldoING },
            ...(accorpato ? [{ etichetta: 'Buddybank', importo: bozza.saldoBuddybank }] : []),
          ]}
          onModifica={() => aggiorna(riapriTranche2)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoImporto
            etichetta="Saldo Intesa MG"
            valore={bozza.saldoIntesaMG}
            onCambia={imposta('saldoIntesaMG')}
            aiuto="Con lo stipendio di MG già accreditato."
          />
          <CampoImporto
            etichetta="Residuo sfizi MG"
            valore={bozza.residuoSfiziMG}
            onCambia={imposta('residuoSfiziMG')}
            consentiNegativo
            aiuto={
              stato.cicliChiusi.length > 0
                ? `Rilevato alla chiusura del ciclo precedente: ${eur(ciclo.residuiIniziali.mg)}. MG spende anche nei giorni prima del suo stipendio: se serve, correggilo con il saldo di Intesa MG subito prima dell'accredito.`
                : `Quanto è avanzato degli sfizi del mese scorso su Intesa MG, subito prima dell'accredito (0 se niente). La quota di ${eur(p.quotaSfiziMG)} si aggiunge sopra.`
            }
          />
          <CampoImporto
            etichetta="Saldo ING"
            valore={bozza.saldoING}
            onCambia={imposta('saldoING')}
            aiuto={
              ingRegistrato
                ? `Ultimo saldo registrato (${formattaDataBreve(ingRegistrato.aggiornatoIl)}): aggiornalo se nel frattempo è stato addebitato il mutuo.`
                : `Serve per verificare la soglia intoccabile di ${eur(p.sogliaING)}.`
            }
          />
          {accorpato && (
            <CampoImporto
              etichetta="Saldo Buddybank"
              valore={bozza.saldoBuddybank}
              onCambia={imposta('saldoBuddybank')}
              aiuto={
                buddybankRegistrato
                  ? `Ultimo saldo registrato (${formattaDataBreve(buddybankRegistrato.aggiornatoIl)}): serve a verificare che i ${eur(tranche1.completata.importoDifferito)} da girare siano ancora lì.`
                  : `Serve a verificare che i ${eur(tranche1.completata.importoDifferito)} da girare siano ancora lì.`
              }
            />
          )}
        </div>
      )}

      <div className="mt-5">
        {vista ? (
          <PianoTranche2 vista={vista} {...{ stato, aggiorna }} />
        ) : (
          <Suggerimento>Inserisci il saldo di Intesa MG dopo l'accredito dello stipendio: qui comparirà il bonifico da fare.</Suggerimento>
        )}
      </div>
    </Sezione>
  )
}

function PianoTranche2({ vista, stato, aggiorna }: PropsSezione & { vista: VistaTranche2 }) {
  const ciclo = stato.cicloCorrente
  const { risultato } = vista
  const { eseguiti } = ciclo.tranche2
  const prossimo = prossimoBonifico(risultato.bonifici, eseguiti, risultato.bloccato)
  const segna = (numero: string) => (fatto: boolean) =>
    aggiorna((s) => segnaBonificoTranche2(s, numero, fatto, adesso()))

  const saldoING = risultato.saldoINGDopo
  // Nel piano accorpato passa da Buddybank anche il bonifico unico: si mostra cosa ci resta.
  const saldoBuddybank = bozzaEffettivaTranche2(ciclo, stato.saldi).saldoBuddybank
  const buddybankDopo =
    vista.modalita === 'accorpato' && saldoBuddybank !== null
      ? applicaBonifici({ ing: 0, intesaFrank: 0, buddybank: saldoBuddybank, intesaMG: 0 }, risultato.bonifici).buddybank
      : null
  const righe: RigaSaldo[] = [
    {
      conto: 'intesaMG',
      importo: risultato.restaSuIntesaMG,
      nota: <span className="text-slate-600 dark:text-slate-400">quota sfizi di MG</span>,
    },
    {
      conto: 'ing',
      importo: saldoING,
      nota: (
        <>
          <span className="text-slate-600 dark:text-slate-400">{eur(risultato.variazioneNettaING, { segno: true })} netti</span>
          {saldoING !== null && (
            <>
              {' · '}
              <RisparmioReale saldoING={saldoING} parametri={ciclo.parametri} />
            </>
          )}
        </>
      ),
    },
    ...(buddybankDopo !== null
      ? [
          {
            conto: 'buddybank' as const,
            importo: buddybankDopo,
            nota: <span className="text-slate-600 dark:text-slate-400">sfizi di Frank</span>,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <ElencoEsiti esiti={risultato.esiti} />
      <ol className="space-y-3" aria-label="Bonifici della tranche 2">
        {risultato.bonifici.map((bonifico) => (
          <li key={bonifico.numero}>
            <SchedaBonifico
              bonifico={bonifico}
              fatto={eseguiti.includes(bonifico.numero)}
              evidenziato={bonifico.numero === prossimo}
              bloccato={risultato.bloccato}
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
      {!risultato.bloccato && <RiepilogoSaldi titolo="Dopo questi bonifici" righe={righe} />}
    </div>
  )
}
