import { describe, it, expect } from 'vitest'
import { writeStoryIntoCsf } from './csf-writer'

const story = `export const Primary: Story = {
  args: {
    label: "Second",
  },
};
`

const csf3 = `import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
`

const base = {
  fileName: '/project/src/Button.stories.tsx',
  storyExportSource: story,
  desiredExportName: 'Primary',
  requiredImports: [],
}

describe('writeStoryIntoCsf', () => {
  it('appends through the CSF AST, not the fallback', async () => {
    const result = await writeStoryIntoCsf({ ...base, existingCode: csf3 })

    expect(result.fallbackReason).toBeUndefined()
    expect(result.exportName).toBe('Primary')
    expect(result.code).toContain('export const Primary: Story = {')
  })

  it('dedupes against non-story top-level bindings too', async () => {
    const existingCode = csf3.replace(
      'export default meta;',
      'export default meta;\nconst Primary = 1;\nvoid Primary;',
    )
    const result = await writeStoryIntoCsf({ ...base, existingCode })

    expect(result.exportName).toBe('Primary2')
    expect(result.fallbackReason).toBeUndefined()
  })

  it('extends an existing import rather than adding a second one', async () => {
    const result = await writeStoryIntoCsf({
      ...base,
      existingCode: csf3.replace(
        "import { Button } from './Button';",
        "import { Button } from './Button';\nimport { within } from 'storybook/test';",
      ),
      requiredImports: [{ source: 'storybook/test', specifiers: ['fn'] }],
    })

    expect(result.code).toContain(
      "import { within, fn } from 'storybook/test';",
    )
  })

  it('falls back to a text splice when the file is not CSF', async () => {
    const existingCode = `import { Button } from './Button';

export const Default = { args: { label: 'Hello' } };
`
    const result = await writeStoryIntoCsf({ ...base, existingCode })

    expect(result.fallbackReason).toBeTruthy()
    expect(result.code).toContain('export const Primary: Story = {')
    expect(result.code).toContain("import { Button } from './Button';")
  })

  it('dedupes in the fallback path as well', async () => {
    const existingCode = `import { Button } from './Button';

export const Primary = { args: { label: 'Hello' } };
`
    const result = await writeStoryIntoCsf({ ...base, existingCode })

    expect(result.fallbackReason).toBeTruthy()
    expect(result.exportName).toBe('Primary2')
    expect(result.code).toContain('export const Primary2: Story = {')
  })
})

