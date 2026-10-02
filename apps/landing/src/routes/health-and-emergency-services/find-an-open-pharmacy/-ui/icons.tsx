/**
 * Small inline icons for the pharmacy finder.
 */

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-6 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 7.75V12L14.75 14.75M21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 13.875L9.2 18L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  )
}

export function MapPinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M19.5 10.15C19.5 6.06309 16.1421 2.75 12 2.75C7.85786 2.75 4.5 6.06309 4.5 10.15C4.5 14.5772 9.1875 17.0875 10.9609 20.6412C11.1519 21.024 11.5675 21.25 12 21.25C12.4325 21.25 12.8279 21.0135 13.0391 20.6412C14.8125 17.0875 19.5 14.5772 19.5 10.15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8.75 10.25C8.75 8.45507 10.2051 7 12 7C13.7949 7 15.25 8.45507 15.25 10.25C15.25 12.0449 13.7949 13.5 12 13.5C10.2051 13.5 8.75 12.0449 8.75 10.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}
