const BASE_BOTTONE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const BOTTONE_PRIMARIO = `${BASE_BOTTONE} bg-teal-700 text-white shadow-sm hover:bg-teal-800 active:bg-teal-900`

export const BOTTONE_SECONDARIO =
  `${BASE_BOTTONE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 ` +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

export const BOTTONE_PERICOLO = `${BASE_BOTTONE} bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900`

export const LINK =
  'font-medium text-teal-700 underline decoration-teal-700/40 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400'

export const TESTO_SECONDARIO = 'text-slate-600 dark:text-slate-400'
