const DATA = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
const DATA_BREVE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

/** `27 settembre 2026` */
export function formattaData(iso: string): string {
  return DATA.format(new Date(iso))
}

/** `27 set` */
export function formattaDataBreve(iso: string): string {
  return DATA_BREVE.format(new Date(iso))
}
