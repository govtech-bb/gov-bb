import { describe, expect, it } from 'vitest'
import { shouldHideStartLink } from './hide-start-link'

describe('shouldHideStartLink', () => {
  it('keeps the start link when the form is in the available list', () => {
    expect(
      shouldHideStartLink({
        startSubPageVisible: true,
        formId: 'apply-for-conductor-licence',
        availableForms: ['apply-for-conductor-licence'],
      }),
    ).toBe(false)
  })

  it('hides the start link when a non-public form is absent from the available list', () => {
    // A preview/maintenance recipe is excluded from the public available list,
    // so its online-application method must be stripped for the public — the
    // same way a maintenance form is, just without the notice.
    expect(
      shouldHideStartLink({
        startSubPageVisible: true,
        formId: 'apply-for-conductor-licence',
        availableForms: [],
      }),
    ).toBe(true)
  })

  it('hides the start link when the /start sub-page is gated above the viewer', () => {
    expect(
      shouldHideStartLink({
        startSubPageVisible: false,
        formId: 'apply-for-conductor-licence',
        availableForms: ['apply-for-conductor-licence'],
      }),
    ).toBe(true)
  })

  it('keeps the start link for a page that has no form_id', () => {
    expect(
      shouldHideStartLink({
        startSubPageVisible: true,
        formId: undefined,
        availableForms: [],
      }),
    ).toBe(false)
  })
})
