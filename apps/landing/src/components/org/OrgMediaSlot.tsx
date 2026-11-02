/** Wall-40 tint captioned with what will go there, until the organisation supplies photography. */
export function OrgMediaSlot({
  caption,
  className = '',
}: {
  caption: string
  className?: string
}) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded bg-(--org-wall-40) ${className}`}
    >
      {/* Masked so the glyph takes each organisation's link colour from one asset. */}
      <span
        aria-hidden="true"
        className="size-10 bg-(--org-link) [mask:url(/images/org/photo-glyph.svg)_center/contain_no-repeat]"
      />
      <p className="absolute inset-x-0 bottom-0 bg-white-00/90 px-2.5 py-xxs text-body-sm text-grey-70">
        {caption}
      </p>
    </div>
  )
}
