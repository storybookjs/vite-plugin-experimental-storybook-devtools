import { describe, expect, it } from 'vitest'
import { ansiLineToHtml, stripAnsi } from './ansi'

describe('ansiLineToHtml', () => {
  it('renders 16-color output with palette classes', () => {
    expect(ansiLineToHtml('\x1b[32mready\x1b[0m in 300ms')).toBe(
      '<span class="ansi-green-fg">ready</span> in 300ms',
    )
  })

  it('renders bright colors with their own classes', () => {
    expect(ansiLineToHtml('\x1b[91merror\x1b[0m')).toBe(
      '<span class="ansi-bright-red-fg">error</span>',
    )
  })

  it('escapes HTML in log content', () => {
    expect(ansiLineToHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('renders extended colors as inline rgb', () => {
    expect(ansiLineToHtml('\x1b[38;5;208mx\x1b[0m')).toBe(
      '<span style="color:rgb(255,135,0)">x</span>',
    )
  })
})

describe('stripAnsi', () => {
  it('flattens a styled line to its plain text', () => {
    expect(stripAnsi('\x1b[1m\x1b[36minfo\x1b[0m => started')).toBe(
      'info => started',
    )
  })

  it('drops non-SGR sequences (cursor moves, erases, OSC links)', () => {
    expect(stripAnsi('\x1b[2K\x1b[1Gspinner')).toBe('spinner')
    expect(stripAnsi('\x1b]8;;https://x\x07link\x1b]8;;\x07')).toBe('link')
  })
})
