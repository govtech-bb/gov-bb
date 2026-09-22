import { Link, useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * The banner is doing real work: with the editor and the site on one origin
 * it is otherwise easy to forget which tree you are looking at.
 */
export function Chrome({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const inEditor = pathname.startsWith('/editor')

  return (
    <div className={inEditor ? 'app app-editor' : 'app app-site'}>
      <header className="app-bar">
        <span className="app-mark">GOV.BB</span>
        <span className="app-tag">{inEditor ? 'Editor' : 'Site'}</span>
        <nav className="app-nav">
          <Link to="/">Site</Link>
          <Link to="/editor">Editor</Link>
        </nav>
        <span className="app-note">Spike · local Postgres · not for merge</span>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
