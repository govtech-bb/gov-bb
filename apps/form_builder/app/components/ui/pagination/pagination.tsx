import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { InputGroup } from "../input-group";
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { cn } from "../utils/cn";
import { Select } from "../select";
const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
// ============================================================================
// i18n Labels
// ============================================================================
export interface PaginationLabels {
  /** Aria label for the navigation landmark. @default "Pagination" */
  navigation?: string;
  /** Aria label for the first page button. @default "First page" */
  firstPage?: string;
  /** Aria label for the previous page button. @default "Previous page" */
  previousPage?: string;
  /** Aria label for the next page button. @default "Next page" */
  nextPage?: string;
  /** Aria label for the last page button. @default "Last page" */
  lastPage?: string;
  /** Aria label for the page number input/select. @default "Page number" */
  pageNumber?: string;
  /** Aria label for the page size select. @default "Page size" */
  pageSize?: string;
}
const DEFAULT_LABELS: Required<PaginationLabels> = {
  navigation: "Pagination",
  firstPage: "First page",
  previousPage: "Previous page",
  nextPage: "Next page",
  lastPage: "Last page",
  pageNumber: "Page number",
  pageSize: "Page size",
};
/** Pagination controls variant definitions. */
const paginationStyles = {
  controls: {
    full: "",
    simple: "",
  },
} as const;
export type PaginationControls = keyof typeof paginationStyles.controls;
export interface PaginationVariantsProps {
  controls?: PaginationControls;
}
export function paginationVariants({
  controls = "full",
}: PaginationVariantsProps = {}) {
  return cn(
    "flex items-center justify-between gap-2",
    paginationStyles.controls[controls] ?? paginationStyles.controls["full"],
  );
}
// ============================================================================
// Pagination Context
// ============================================================================
interface PaginationContextValue {
  page: number;
  perPage?: number;
  totalCount?: number;
  hasNextPage?: boolean;
  maxPage: number;
  pageShowingRange: string;
  setPage: (page: number) => void;
  editingPage: number;
  setEditingPage: (page: number) => void;
  labels: Required<PaginationLabels>;
}
const PaginationContext = createContext<PaginationContextValue | null>(null);
function usePaginationContext() {
  const context = useContext(PaginationContext);
  if (!context) {
    throw new Error(
      "Pagination compound components must be used within a Pagination component",
    );
  }
  return context;
}
// ============================================================================
// Pagination.Info
// ============================================================================
export interface PaginationInfoProps {
  /** Custom render function for the info text */
  children?: (props: {
    page: number;
    perPage?: number;
    totalCount?: number;
    pageShowingRange: string;
  }) => ReactNode;
  /** Additional CSS classes */
  className?: string;
}
function PaginationInfo({ children, className }: PaginationInfoProps) {
  const { page, perPage, totalCount, pageShowingRange } =
    usePaginationContext();
  const content = children ? (
    children({ page, perPage, totalCount, pageShowingRange })
  ) : totalCount && totalCount > 0 ? (
    <>
      Showing <span className="tabular-nums">{pageShowingRange}</span> of{" "}
      <span className="tabular-nums">{totalCount}</span>
    </>
  ) : null;
  return (
    <div
      data-slot="pagination-info"
      className={cn("text-sm text-ui-subtle", className)}
    >
      {content}
    </div>
  );
}
PaginationInfo.displayName = "Pagination.Info";
// ============================================================================
// Pagination.PageSize
// ============================================================================
export interface PaginationPageSizeProps {
  /** Current page size value */
  value: number;
  /** Callback when page size changes */
  onChange: (size: number) => void;
  /** Available page size options */
  options?: number[];
  /**
   * Label text shown before the selector.
   * @default "Per page:"
   */
  label?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}
function PaginationPageSize({
  value,
  onChange,
  options = DEFAULT_PAGE_SIZE_OPTIONS as unknown as number[],
  label = "Per page:",
  className,
}: PaginationPageSizeProps) {
  const { labels } = usePaginationContext();
  return (
    <div
      data-slot="pagination-page-size"
      className={cn("flex items-center gap-2", className)}
    >
      {label && <span className="text-sm text-ui-subtle">{label}</span>}
      <Select
        aria-label={labels.pageSize}
        value={value}
        onValueChange={(v) => onChange(v as number)}
      >
        {options.map((size) => (
          <Select.Option key={size} value={size}>
            {size}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}
PaginationPageSize.displayName = "Pagination.PageSize";
// ============================================================================
// Pagination.Controls
// ============================================================================
export interface PaginationControlsProps extends PaginationVariantsProps {
  pageSelector?: "input" | "dropdown";
  /** Additional CSS classes */
  className?: string;
}
function PaginationControls({
  controls = "full",
  pageSelector = "input",
  className,
}: PaginationControlsProps) {
  const {
    page,
    totalCount,
    hasNextPage,
    maxPage,
    setPage,
    editingPage,
    setEditingPage,
    labels,
  } = usePaginationContext();
  const hasKnownTotal = totalCount != null;
  const isUnknownTotal = !hasKnownTotal && hasNextPage !== undefined;
  const showFullControls = controls === "full" && !isUnknownTotal;
  const isNextDisabled = hasKnownTotal
    ? page === maxPage
    : hasNextPage !== true;
  return (
    <div
      data-slot="pagination-controls"
      className={cn("flex grow flex-col items-end", className)}
    >
      <nav aria-label={labels.navigation}>
        <InputGroup>
          {showFullControls && (
            <InputGroup.Button
              shape="square"
              variant="secondary"
              aria-label={labels.firstPage}
              disabled={page <= 1}
              onClick={() => {
                setPage(1);
                setEditingPage(1);
              }}
            >
              <CaretDoubleLeftIcon size={16} />
            </InputGroup.Button>
          )}
          <InputGroup.Button
            shape="square"
            variant="secondary"
            aria-label={labels.previousPage}
            disabled={page <= 1}
            onClick={() => {
              const previousPage = Math.max(page - 1, 1);
              setPage(previousPage);
              setEditingPage(previousPage);
            }}
          >
            <CaretLeftIcon size={16} />
          </InputGroup.Button>
          {showFullControls &&
            (pageSelector === "dropdown" ? (
              <Select
                aria-label={labels.pageNumber}
                className="rounded-none ring-ui-hairline"
                value={page}
                onValueChange={(value) => {
                  const num = value as number;
                  setPage(num);
                  setEditingPage(num);
                }}
              >
                {Array.from({ length: maxPage }, (_, i) => i + 1).map((p) => (
                  <Select.Option key={p} value={p}>
                    {p}
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <InputGroup.Input
                style={{ width: 50 }}
                className="text-center"
                aria-label={labels.pageNumber}
                value={editingPage}
                onValueChange={(value: string) => {
                  setEditingPage(Number(value));
                }}
                onBlur={() => {
                  const clamped = clamp(editingPage, 1, maxPage);
                  setPage(clamped);
                  setEditingPage(clamped);
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    const clamped = clamp(editingPage, 1, maxPage);
                    setPage(clamped);
                    setEditingPage(clamped);
                  }
                }}
                // Prevent password managers from auto-filling
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            ))}
          <InputGroup.Button
            shape="square"
            variant="secondary"
            aria-label={labels.nextPage}
            disabled={isNextDisabled}
            onClick={() => {
              const nextPage = hasKnownTotal
                ? Math.min(page + 1, maxPage)
                : page + 1;
              setPage(nextPage);
              setEditingPage(nextPage);
            }}
          >
            <CaretRightIcon size={16} />
          </InputGroup.Button>
          {showFullControls && (
            <InputGroup.Button
              shape="square"
              variant="secondary"
              aria-label={labels.lastPage}
              disabled={page === maxPage}
              onClick={() => {
                setPage(maxPage);
                setEditingPage(maxPage);
              }}
            >
              <CaretDoubleRightIcon size={16} />
            </InputGroup.Button>
          )}
        </InputGroup>
      </nav>
    </div>
  );
}

// ============================================================================
// Pagination.Separator
// ============================================================================
export interface PaginationSeparatorProps {
  /** Additional CSS classes */
  className?: string;
}
function PaginationSeparator({ className }: PaginationSeparatorProps) {
  return (
    <div
      data-slot="pagination-separator"
      className={cn("mx-2 h-6 border-l border-ui-hairline", className)}
    />
  );
}
PaginationSeparator.displayName = "Pagination.Separator";
// ============================================================================
// Pagination Root
// ============================================================================
/** Base props shared by both compound and legacy Pagination APIs */
interface PaginationBaseProps {
  /** Callback fired when the current page changes. */
  setPage: (page: number) => void;
  /**
   * Current page number (1-indexed).
   * @default 1
   */
  page?: number;
  /** Number of items displayed per page. */
  perPage?: number;
  /** Total number of items across all pages. */
  totalCount?: number;
  /**
   * Whether another page exists when the total count is unknown. Ignored when
   * `totalCount` is provided. Unknown totals use sequential controls only.
   */
  hasNextPage?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
  labels?: PaginationLabels;
}
export interface PaginationCompoundProps extends PaginationBaseProps {
  /**
   * Compound component children for custom layouts.
   * Use Pagination.Info, Pagination.PageSize, Pagination.Controls, and Pagination.Separator.
   */
  children: ReactNode;
  controls?: never;
  text?: never;
}
export interface PaginationLegacyProps
  extends PaginationBaseProps, PaginationVariantsProps {
  children?: never;
  text?: (props: {
    page?: number;
    perPage?: number;
    totalCount?: number;
    pageShowingRange: string;
  }) => ReactNode;
}
export type PaginationProps = PaginationCompoundProps | PaginationLegacyProps;
function PaginationRoot(props: PaginationProps) {
  const {
    page = 1,
    perPage,
    totalCount,
    hasNextPage,
    setPage,
    children,
    className,
    labels: labelsProp,
  } = props;
  // Extract legacy props (only present when children is not provided)
  const text = "text" in props ? props.text : undefined;
  const controls = "controls" in props ? (props.controls ?? "full") : "full";
  const [editingPage, setEditingPage] = useState<number>(1);
  // Merge provided labels with defaults
  const labels = useMemo<Required<PaginationLabels>>(
    () => ({ ...DEFAULT_LABELS, ...labelsProp }),
    [labelsProp],
  );
  useEffect(() => {
    setEditingPage(page);
  }, [page]);
  const pageShowingRange = useMemo(() => {
    let lower = page * (perPage ?? 1) - (perPage ?? 0) + 1;
    let upper = Math.min(page * (perPage ?? 0), totalCount ?? 0);
    if (Number.isNaN(lower)) lower = 0;
    if (Number.isNaN(upper)) upper = 0;
    return `${lower}-${upper}`;
  }, [page, perPage, totalCount]);
  const maxPage = useMemo(() => {
    return Math.ceil((totalCount ?? 1) / (perPage ?? 1));
  }, [totalCount, perPage]);
  const contextValue: PaginationContextValue = {
    page,
    perPage,
    totalCount,
    hasNextPage,
    maxPage,
    pageShowingRange,
    setPage,
    editingPage,
    setEditingPage,
    labels,
  };
  // Compound component mode: render children within context
  if (children) {
    return (
      <PaginationContext.Provider value={contextValue}>
        <div
          data-slot="pagination"
          className={cn("flex w-full items-center gap-2", className)}
        >
          {children}
        </div>
      </PaginationContext.Provider>
    );
  }
  // Legacy mode: render default layout for backwards compatibility
  const getPaginationText = () => {
    if (text) {
      return text({ page, perPage, totalCount, pageShowingRange });
    } else if (totalCount && totalCount > 0) {
      return (
        <>
          Showing <span className="tabular-nums">{pageShowingRange}</span> of{" "}
          <span className="tabular-nums">{totalCount}</span>
        </>
      );
    }
    return null;
  };
  return (
    <PaginationContext.Provider value={contextValue}>
      <div
        data-slot="pagination"
        className={cn("flex w-full items-center gap-2", className)}
      >
        <div
          aria-live="polite"
          aria-atomic="true"
          data-slot="pagination-info"
          className="grow text-sm text-ui-subtle"
        >
          {getPaginationText()}
        </div>
        <PaginationControls controls={controls} />
      </div>
    </PaginationContext.Provider>
  );
}
PaginationRoot.displayName = "Pagination";
// ============================================================================
// Compound Component Export
// ============================================================================
export const Pagination = Object.assign(PaginationRoot, {
  Info: PaginationInfo,
  PageSize: PaginationPageSize,
  Controls: PaginationControls,
  Separator: PaginationSeparator,
});
export {
  PaginationInfo,
  PaginationPageSize,
  PaginationControls,
  PaginationSeparator,
};
