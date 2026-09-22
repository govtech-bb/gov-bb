import type { Block, CollectionDefinition } from '@govtech-bb/block-kit'
import { CalendarEditor, DataTableEditor, FinderEditor } from './config'
import {
  HeadingEditor,
  ImagePlaceholderEditor,
  ListEditor,
  NoticeEditor,
  ParagraphEditor,
  StartLinkEditor,
} from './prose'

/** Dispatches to the editor for a block's type. Exhaustive by construction. */
export function BlockEditor({
  block,
  onChange,
  collections,
  refKeys,
}: {
  block: Block
  onChange: (block: Block) => void
  collections: CollectionDefinition[]
  refKeys: string[]
}) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphEditor block={block} onChange={onChange} />
    case 'heading':
      return <HeadingEditor block={block} onChange={onChange} />
    case 'list':
      return <ListEditor block={block} onChange={onChange} />
    case 'notice':
      return <NoticeEditor block={block} onChange={onChange} />
    case 'start_link':
      return <StartLinkEditor block={block} onChange={onChange} />
    case 'image_placeholder':
      return <ImagePlaceholderEditor block={block} onChange={onChange} />
    case 'finder':
      return (
        <FinderEditor block={block} onChange={onChange} collections={collections} />
      )
    case 'calendar':
      return (
        <CalendarEditor block={block} onChange={onChange} collections={collections} />
      )
    case 'data_table':
      return (
        <DataTableEditor
          block={block}
          onChange={onChange}
          collections={collections}
          refKeys={refKeys}
        />
      )
  }
}
