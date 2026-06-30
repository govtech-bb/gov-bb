/**
 * StormReady Barbados — household preparation checklist
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/stormready/checklist. Progress
 * is saved to localStorage so it survives a refresh, and the page prints to a
 * clean PDF — site chrome carries `print:hidden`, so only content is printed.
 */

import { Button, Checkbox, Heading, Text } from '@govtech-bb/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  STORMREADY_CHECKLIST,
  STORMREADY_CHECKLIST_TOTAL,
} from '../-data/stormready-checklist'

export const TITLE = 'Household preparation checklist'
export const DESCRIPTION =
  'Tick off water, food, documents, first aid, communication and pre-storm tasks to make sure your household is ready for a hurricane. Save your progress or print a copy.'

const STORAGE_KEY = 'stormready-checklist-v1'

type ChecklistState = Record<string, boolean>

function loadState(): ChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChecklistState) : {}
  } catch {
    return {}
  }
}

function saveState(state: ChecklistState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore — storage may be unavailable (private mode, quota).
  }
}

export function StormReadyChecklistPage() {
  const [state, setState] = useState<ChecklistState>({})
  const [hydrated, setHydrated] = useState(false)
  const [autoPrint, setAutoPrint] = useState(false)

  // Restore saved progress after mount to keep server and client markup in
  // sync, and read the print intent from the URL (?print=1 or ?format=pdf).
  useEffect(() => {
    setState(loadState())
    const params = new URLSearchParams(window.location.search)
    setAutoPrint(params.has('print') || params.get('format') === 'pdf')
    setHydrated(true)
  }, [])

  const setItem = useCallback((id: string, checked: boolean) => {
    setState((prev) => {
      const next = { ...prev, [id]: checked }
      saveState(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setState({})
    saveState({})
  }, [])

  const doneCount = useMemo(
    () => Object.values(state).filter(Boolean).length,
    [state],
  )

  const percent = STORMREADY_CHECKLIST_TOTAL
    ? Math.round((doneCount / STORMREADY_CHECKLIST_TOTAL) * 100)
    : 0

  // Auto-open the print dialog when arriving from the "Save checklist as PDF"
  // link. Wait for paint, then print.
  useEffect(() => {
    if (!(autoPrint && hydrated)) {
      return
    }
    const timer = setTimeout(() => window.print(), 350)
    return () => clearTimeout(timer)
  }, [autoPrint, hydrated])

  return (
    <div className="mb-l flex max-w-176 flex-col gap-m print:mb-0 print:block">
      {/* Print-only sheet header. */}
      <div className="hidden border-black-00 border-b-2 pb-xs print:block">
        <Heading as="h1" size="h2">
          {TITLE}
        </Heading>
        <Text as="p" size="caption">
          StormReady Barbados — Government of Barbados
        </Text>
        <Text as="p" className="text-mid-grey-00" size="caption">
          Name: _______________________ Date: ______________
        </Text>
      </div>

      <div className="flex flex-col gap-xs print:hidden">
        <Heading as="h1">{TITLE}</Heading>
        <Text as="p" className="text-mid-grey-00">
          Tick items as you get ready. Save as PDF or print to keep a copy at
          home. Your progress is saved on this device.
        </Text>
      </div>

      <div className="flex flex-col gap-s sm:flex-row print:hidden">
        <Button onClick={() => window.print()} type="button">
          Save as PDF or print
        </Button>
        <Button onClick={reset} type="button" variant="secondary">
          Reset
        </Button>
      </div>

      <div className="flex flex-col gap-xs bg-teal-10 p-s print:hidden">
        <div className="flex justify-between gap-s font-bold text-teal-00">
          <span>Your progress</span>
          <span>
            {doneCount} of {STORMREADY_CHECKLIST_TOTAL} items
          </span>
        </div>
        <div
          aria-label="Checklist progress"
          aria-valuemax={STORMREADY_CHECKLIST_TOTAL}
          aria-valuemin={0}
          aria-valuenow={doneCount}
          className="h-2 overflow-hidden rounded-full bg-grey-00"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-teal-00 transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Block flow in print so each section's break-inside-avoid is honored —
          Chrome ignores break-inside on flex items, so the wrapper is a plain
          block, not the flex fieldset. */}
      <div className="flex flex-col gap-m print:block">
        {STORMREADY_CHECKLIST.map((section) => (
          <div
            className="print:mb-m print:break-inside-avoid"
            key={section.id}
          >
            <fieldset className="flex flex-col gap-s border-0 p-0">
              <legend className="w-full border-grey-00 border-b pb-xs">
                <Heading as="h2">{section.title}</Heading>
              </legend>
              {section.hint && (
                <Text as="p" className="text-mid-grey-00">
                  {section.hint}
                </Text>
              )}
              <div className="mt-xs flex flex-col gap-s">
                {section.items.map((item) => (
                  <Checkbox
                    checked={state[item.id] ?? false}
                    id={item.id}
                    key={item.id}
                    label={item.label}
                    onCheckedChange={(checked) =>
                      setItem(item.id, checked === true)
                    }
                  />
                ))}
              </div>
            </fieldset>
          </div>
        ))}
      </div>
    </div>
  )
}
