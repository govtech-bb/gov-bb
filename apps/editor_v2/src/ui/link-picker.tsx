import { useId, useState, type ComponentProps } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { ListBox, useListNavigation } from "./list-box";
import { cn } from "../cn";
import { rowLabel } from "./surface";

/** A page a link can go to, as the host knows it: its title, and its address on the site. */
export type LinkPage = { readonly title: string; readonly url: string };

// Typed as an address rather than searched for: a scheme, or a path from the site's root, a fragment or a query
const typedAddress = /^([a-z][a-z\d+.-]*:|[/#?])/i;

// A domain, such as gov.bb: it might be a title too, so it searches, but Enter keeps the address
const domain = /^\S+\.\S{2,}$/;

// Case and accents aside, as a search box should
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The pages a search finds by their titles, those starting with it first, as many as fit. */
function findPages(pages: readonly LinkPage[], query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);

  if (query.trim().length < 2 || typedAddress.test(query.trim())) return [];

  return pages
    .filter((page) => words.every((word) => fold(page.title).includes(word)))
    .toSorted(
      (a, b) =>
        Number(fold(b.title).startsWith(words[0]!)) - Number(fold(a.title).startsWith(words[0]!)),
    )
    .slice(0, 8);
}

type LinkPickerProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "role"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** The pages it can find by their titles, such as the host's. Without them it takes typed addresses only. */
  pages?: readonly LinkPage[];
  /** A page chosen from the list. Its address becomes the value unless this says otherwise. */
  onPick?: (page: LinkPage) => void;
  /** For the list of pages, such as its place in a row of controls. */
  listClassName?: string;
};

/**
 * Where a link or a button goes: one field that finds a page by its title or takes an address typed in
 * full. The pages it finds list below it; ↑ and ↓ move through them and Enter picks one. With nothing picked, Enter is
 * the form's, as it is in any field.
 */
export function LinkPicker({
  value,
  onValueChange,
  pages = [],
  onPick = (page) => onValueChange(page.url),
  onKeyDown,
  placeholder = pages.length
    ? "Search pages or type an address"
    : "https://www.gov.bb or /guidance",
  listClassName,
  ...props
}: LinkPickerProps) {
  const found = findPages(pages, value);
  // The first page is ready for Enter, unless what's typed reads as an address
  const first = (text: string) => (domain.test(text.trim()) ? -1 : 0);

  const list = useListNavigation(found.length, {
    initial: first(value),
    onPick: (index) => onPick(found[index]!),
  });

  // The field and the list are the parent's to lay out, so the list can take a row of its own
  return (
    <>
      <Input
        {...props}
        {...(pages.length ? list.comboboxProps : undefined)}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          list.setIndex(first(event.target.value));
        }}
        onKeyDown={(event) => {
          list.onKeyDown(event);
          onKeyDown?.(event);
        }}
      />
      {found.length > 0 && (
        <ListBox.Root
          {...list.listProps}
          aria-label="Pages"
          className={cn("-mx-1 mt-1 max-h-64 py-0", listClassName)}
        >
          {found.map((page, index) => (
            <ListBox.Option
              key={page.url}
              {...list.optionProps(index)}
              onClick={() => onPick(page)}
            >
              <span className="flex min-w-0 flex-col">
                <span className={rowLabel}>{page.title}</span>
                <span className="truncate text-12 leading-4 text-muted group-data-highlighted/row:text-white/75">
                  {page.url}
                </span>
              </span>
            </ListBox.Option>
          ))}
        </ListBox.Root>
      )}
    </>
  );
}

/**
 * A link's destination and Apply, checked by the link policy: `toAddress` gives the address it allows for what was
 * typed, or null. A page picked from the list applies at once, with its title.
 */
export function LinkForm({
  url = "",
  pages,
  toAddress,
  onApply,
  onRemove,
  removeLabel = "Remove link",
}: {
  /** The address now, to change; empty for a new link. */
  url?: string;
  pages?: readonly LinkPage[];
  toAddress: (typed: string) => string | null;
  /** The address, and the words for a new link: the page's title, or what was typed. */
  onApply: (url: string, text: string) => void;
  /** Takes the address away, for a link or button that has one. */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const [value, setValue] = useState(url);
  const [error, setError] = useState<string>();
  const errorId = useId();

  const apply = (typed: string, text = typed.trim()) => {
    const address = typed.trim() ? toAddress(typed) : null;

    if (address) onApply(address, text);
    else
      setError(
        typed.trim()
          ? "Enter a relative link or a supported address, such as https, email or telephone."
          : "Enter a link destination.",
      );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply(value);
      }}
      className="flex w-90 max-w-[calc(100vw-2rem)] flex-wrap items-start gap-2 p-2"
    >
      <LinkPicker
        size="sm"
        autoFocus
        aria-label="Link"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        value={value}
        pages={pages}
        onValueChange={(next) => {
          setValue(next);
          setError(undefined);
        }}
        onPick={(page) => apply(page.url, page.title)}
        className="min-w-0 flex-1"
        // Under the field and its buttons, as wide as the form
        listClassName="order-last mt-0 basis-full"
      />
      <Button type="submit" variant="accent">
        Apply
      </Button>
      {onRemove && <Button onClick={onRemove}>{removeLabel}</Button>}
      {error && (
        <p id={errorId} role="alert" className="order-last w-full text-14 text-error">
          {error}
        </p>
      )}
    </form>
  );
}
