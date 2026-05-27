'use client'

import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useField } from '@payloadcms/ui'

/**
 * Read-only preview of the sibling `body` markdown field. Renders GFM
 * (tables, lists, links) at roughly the fidelity of the public site — it does
 * not render the site's Start-now buttons or research-only content.
 */
export const MarkdownPreview: React.FC = () => {
  const { value } = useField<string>({ path: 'body' })

  return (
    <div className="field-type">
      <div className="field-label">Preview</div>
      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          padding: '1rem',
          background: 'var(--theme-elevation-50)',
          maxHeight: 480,
          overflow: 'auto',
        }}
      >
        {value ? (
          <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
        ) : (
          <em style={{ color: 'var(--theme-elevation-400)' }}>Nothing to preview yet.</em>
        )}
      </div>
    </div>
  )
}

export default MarkdownPreview
