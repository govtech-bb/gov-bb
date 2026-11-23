/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from './analytics'
import { installTallySubmitListener } from './tally-submit'

vi.mock('./analytics', () => ({ trackEvent: vi.fn() }))

const SUBMIT = JSON.stringify({
  event: 'Tally.FormSubmitted',
  payload: {
    formId: 'Pd1ele',
    fields: [{ title: 'Email', answer: { value: 'jane@example.com' } }],
  },
})

function post(data: unknown, origin = 'https://tally.so') {
  window.dispatchEvent(new MessageEvent('message', { data, origin }))
}

let remove: () => void

beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
  remove = installTallySubmitListener()
})

afterEach(() => remove())

describe('installTallySubmitListener', () => {
  it('counts a Tally submit once, with no data', () => {
    post(SUBMIT)

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('tell-us-submit')
  })

  it('ignores a submit from another site', () => {
    post(SUBMIT, 'https://evil.example')

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('ignores a look-alike origin that starts with tally.so', () => {
    post(SUBMIT, 'https://tally.so.evil.example')

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it("ignores Tally's other events", () => {
    post(JSON.stringify({ event: 'Tally.FormLoaded' }))
    post(JSON.stringify({ event: 'Tally.FormPageView' }))

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('ignores data that is an object, not a string', () => {
    post({ event: 'Tally.FormSubmitted' })

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('ignores data that is not JSON, without throwing', () => {
    expect(() => post('not json {')).not.toThrow()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('forwards nothing from the answers', () => {
    post(SUBMIT)

    expect(vi.mocked(trackEvent).mock.calls[0]).toEqual(['tell-us-submit'])
  })

  it('stops counting once removed', () => {
    remove()
    post(SUBMIT)

    expect(trackEvent).not.toHaveBeenCalled()
  })
})
