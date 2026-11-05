# Page blocks

Each kind of component an author inserts into a page, such as a Notice or Highlights, is a block: a file of its own here, made with `defineBlock` and listed in `index.ts`. A block holds everything about itself, so adding one doesn't edit the editor's shared code. `notice.tsx` is the smallest; `highlights.tsx` uses every part.

## What a block declares

- **Kinds and attributes**: the components it's made of, and the attributes they keep. Every component is a `PageComponentNode`, told apart by its kind, so saved pages keep one node type whichever blocks exist. A block adds its kinds to `PageComponentKinds`, and its attributes to `PageComponentAttributes`, from its own file:

  ```ts
  declare module "./node" {
    interface PageComponentKinds {
      details: true;
    }
    interface PageComponentAttributes {
      summary?: string;
    }
  }
  ```

  Attributes are optional, as an author's settings may be incomplete until the Markdown is written. Blocks that keep the same attribute, as buttons and Start markers both keep `href`, declare it with the same type. Any attribute that holds text can be edited with `LabelSettings`.

  Each kind says how it behaves (`BlockKind` in `node.ts`): whether editing stays inside it (`shadowRoot`), whether it can be emptied and written in again (`canBeEmpty`), the label it shows on the editing surface (`decorate`), its `name` in hints, and the `traits` the shared editing asks about instead of knowing every kind: `button`, `buttons`, `holds-lines` and `leavable`.

- **Markdown**: how it reads into its components and is written back. A component of the GovBB dialect uses `directive(kind, spec)`, whose spec maps the parsed directive to the component's attributes, children and label. Anything else, such as landing's retained HTML, is a `PageHandler` of its own.

- **Insert**: its entries in the insert and `/` menus, made with `pageInsertAction`. `notInside` keeps it out of components it can't go in.

- **Options**: what Block options shows for the component at the caret, for the kinds named: settings, such as `LabelSettings` for a plain-text label, or rows, such as Add highlight, made with `BlockMenuItem`.

- **Registrations and slots**: its own editing behaviour, such as what its keys do, and what it adds around the page, such as the buttons' destination popover.

- **Styles**: a CSS file beside it, which it imports. A label from `decorate`'s `data-summary` takes the shared look in `block.css`.

Muted text isn't a block: it's a paragraph's colour (`../modules/muted.ts`).
