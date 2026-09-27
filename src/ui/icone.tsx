import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>

function Icona({ children, ...props }: Props) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconaCopia = (props: Props) => (
  <Icona {...props}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Icona>
)

export const IconaSpunta = (props: Props) => (
  <Icona {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icona>
)

export const IconaFreccia = (props: Props) => (
  <Icona {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icona>
)

export const IconaBlocco = (props: Props) => (
  <Icona {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Icona>
)

export const IconaAvviso = (props: Props) => (
  <Icona {...props}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icona>
)

export const IconaInfo = (props: Props) => (
  <Icona {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icona>
)

export const IconaOk = (props: Props) => (
  <Icona {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Icona>
)

export const IconaOrologio = (props: Props) => (
  <Icona {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icona>
)
