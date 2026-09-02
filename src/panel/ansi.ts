/**
 * ANSI rendering for the Terminal tab, backed by `ansi_up`. Class mode maps
 * the 16-color palette to `.ansi-*-fg/-bg` rules in panel.css (tuned for the
 * dark terminal background); extended colors come out as inline rgb styles.
 * Output is HTML-escaped by ansi_up, so log content can't inject markup.
 */
import { AnsiUp } from 'ansi_up'

const ansiUp = new AnsiUp()
ansiUp.use_classes = true

/** One log line as safe HTML with `ansi-*` class styling. */
export function ansiLineToHtml(line: string): string {
  return ansiUp.ansi_to_html(line)
}

/** The line's plain text, for pattern matching and fallbacks. */
export function stripAnsi(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
}
