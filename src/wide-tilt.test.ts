import { describe, expect, it } from 'vitest'
import { nextWideSide, wideFrame } from './wide-tilt.ts'

describe('locked landscape hold', () => {
  it('keeps the landscape side when the phone is only a little upright', () => {
    expect(nextWideSide(10, 'left')).toBe('left')
    expect(nextWideSide(null, 'right')).toBe('right')
    expect(nextWideSide(40, 'right')).toBe('left')
    expect(nextWideSide(-40, 'left')).toBe('right')
  })

  it('turns a portrait screen sideways and leaves a landscape screen alone', () => {
    expect(wideFrame('left', { width: 844, height: 390 })).toBeNull()
    expect(wideFrame('left', { width: 390, height: 844 })).toEqual({
      width: 844,
      height: 390,
      transform: 'rotate(-90deg)',
      top: 844,
      left: 0,
    })
    expect(wideFrame('right', { width: 390, height: 844 })).toMatchObject({
      transform: 'rotate(90deg)',
      top: 0,
      left: 390,
    })
  })
})
