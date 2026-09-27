/** Identificativo univoco. `crypto.randomUUID` esiste solo nei contesti sicuri (https o localhost). */
export function nuovoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function adesso(): string {
  return new Date().toISOString()
}
