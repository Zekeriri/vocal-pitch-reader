import { describe, expect, it } from 'vitest'
import { nextWideTilt, wideFrame } from './wide-tilt.ts'

describe('landscape hold', () => {
  it('waits until the phone is clearly sideways, then stays there', () => {
    expect(nextWideTilt(10, 'portrait')).toBe('portrait')
    expect(nextWideTilt(40, 'portrait')).toBe('left')
    expect(nextWideTilt(20, 'left')).toBe('left')
    expect(nextWideTilt(10, 'left')).toBe('portrait')
    expect(nextWideTilt(-40, 'portrait')).toBe('right')
    expect(nextWideTilt(-20, 'right')).toBe('right')
    expect(nextWideTilt(null, 'left')).toBe('left')
  })

  it('rotates only a portrait screen that is being held sideways', () => {
    expect(wideFrame('portrait', { width: 390, height: 844 })).toBeNull()
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