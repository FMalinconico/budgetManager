export type ContoId = 'ing' | 'intesaFrank' | 'buddybank' | 'intesaMG'

export const CONTI: readonly ContoId[] = ['ing', 'intesaFrank', 'buddybank', 'intesaMG']

export const NOME_CONTO: Record<ContoId, string> = {
  ing: 'ING',
  intesaFrank: 'Intesa Frank',
  buddybank: 'Buddybank',
  intesaMG: 'Intesa MG',
}

export const RUOLO_CONTO: Record<ContoId, string> = {
  ing: 'Risparmio + mutuo in transito',
  intesaFrank: 'Spese di casa',
  buddybank: 'Sfizi Frank',
  intesaMG: 'Sfizi MG',
}
