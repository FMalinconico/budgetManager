/**
 * Copia un testo negli appunti. L'API moderna esiste solo nei contesti sicuri:
 * aprendo l'app in rete locale via http si ripiega su `execCommand('copy')`.
 */
export async function copiaNegliAppunti(testo: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(testo)
      return true
    }
  } catch {
    // Si prova il metodo di riserva.
  }
  const area = document.createElement('textarea')
  area.value = testo
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, testo.length)
  let riuscito = false
  try {
    riuscito = document.execCommand('copy')
  } catch {
    riuscito = false
  }
  document.body.removeChild(area)
  return riuscito
}
