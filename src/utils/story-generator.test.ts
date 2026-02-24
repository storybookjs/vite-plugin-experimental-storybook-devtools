import { describe, it, expect } from 'vitest'
import { generateStory } from '../frameworks/react/story-generator'
import { generateStoryName } from './story-generator'

describe('generateStory', () => {
  const baseMeta = {
    componentName: 'Button',
    filePath: '/project/src/components/Button.tsx',
    relativeFilePath: 'src/components/Button.tsx',
    sourceId: 'abc123',
    isDefaultExport: false,
  }

  describe('basic story generation', () => {
    it('should generate a basic story file', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          label: 'Click me',
          disabled: false,
        },
      })

      expect(result.content).toContain(
        "import type { Meta, StoryObj } from '@storybook/react-vite'",
      )
      expect(result.content).toContain("import { Button } from './Button'")
      expect(result.content).toContain('component: Button')
      expect(result.content).toContain('export default meta')
      expect(result.content).toContain('label: "Click me"')
      expect(result.content).toContain('disabled: false')
    })

    it('should use default export import syntax for default exports', () => {
      const result = generateStory({
        meta: { ...baseMeta, isDefaultExport: true },
        props: { label: 'Test' },
      })

      expect(result.content).toContain("import Button from './Button'")
    })

    it('should use named export import syntax for named exports', () => {
      const result = generateStory({
        meta: { ...baseMeta, isDefaultExport: false },
        props: { label: 'Test' },
      })

      expect(result.content).toContain("import { Button } from './Button'")
    })
  })

  describe('story naming', () => {
    it('should use custom story name when provided', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { label: 'Test' },
        storyName: 'CustomName',
      })

      // Note: toValidStoryName converts to lowercase then capitalizes each word
      expect(result.content).toContain('export const Customname: Story')
      expect(result.storyName).toBe('Customname')
    })

    it('should generate story name from variant prop', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { variant: 'primary' },
      })

      expect(result.content).toContain('export const Primary: Story')
    })

    it('should generate story name from type prop', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { type: 'submit' },
      })

      expect(result.content).toContain('export const Submit: Story')
    })

    it('should fallback to Default when no meaningful props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { someRandomProp: 'value' },
      })

      expect(result.content).toContain('export const Default: Story')
    })

    it('should convert story name to valid identifier', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {},
        storyName: 'my cool story!',
      })

      expect(result.content).toContain('export const MyCoolStory: Story')
    })

    it('should use Default for invalid story names starting with numbers', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {},
        storyName: '#2C2C2C',
      })

      expect(result.content).toContain('export const Default: Story')
    })
  })

  describe('props serialization', () => {
    it('should handle string props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { label: 'Hello World' },
      })

      expect(result.content).toContain('label: "Hello World"')
    })

    it('should handle number props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { count: 42 },
      })

      expect(result.content).toContain('count: 42')
    })

    it('should handle boolean props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { disabled: true, loading: false },
      })

      expect(result.content).toContain('disabled: true')
      expect(result.content).toContain('loading: false')
    })

    it('should handle null props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { value: null },
      })

      expect(result.content).toContain('value: null')
    })

    it('should handle object props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          config: {
            theme: 'dark',
            size: 'large',
          },
        },
      })

      expect(result.content).toContain('config: {')
      expect(result.content).toContain('theme: "dark"')
      expect(result.content).toContain('size: "large"')
    })

    it('should handle array props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          items: ['a', 'b', 'c'],
        },
      })

      expect(result.content).toContain('items: [')
      expect(result.content).toContain('"a"')
      expect(result.content).toContain('"b"')
      expect(result.content).toContain('"c"')
    })

    it('should handle JSX props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          icon: {
            __isJSX: true,
            source: '<Icon name="star" />',
            componentRefs: ['Icon'],
          },
        },
      })

      expect(result.content).toContain('icon: <Icon name="star" />')
    })

    it('should replace function handlers in JSX with fn()', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source: '<TaskCard onAction={() => alert("test")} task={task} />',
            componentRefs: ['TaskCard'],
          },
        },
      })

      expect(result.content).toContain('onAction={fn()}')
      expect(result.content).not.toContain('() => alert("test")')
      expect(result.content).toContain("import { fn } from 'storybook/test'")
    })

    it('should handle multiple function handlers in JSX', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source:
              '<><Button onClick={() => {}} onHover={function() {}} /></>',
            componentRefs: ['Button'],
          },
        },
      })

      expect(result.content).toContain('onClick={fn()}')
      expect(result.content).toContain('onHover={fn()}')
      expect(result.content).toContain("import { fn } from 'storybook/test'")
    })

    it('should replace function handlers with template literals in JSX', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source:
              '<TaskCard onAction={() => alert(`Viewing: ${task.title}`)} task={task} />',
            componentRefs: ['TaskCard'],
          },
        },
      })

      expect(result.content).toContain('onAction={fn()}')
      expect(result.content).not.toContain('() => alert')
      expect(result.content).toContain("import { fn } from 'storybook/test'")
    })

    it('should handle function props with fn()', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          onClick: {
            __isFunction: true,
            name: 'onClick',
          },
        },
      })

      expect(result.content).toContain('onClick: fn()')
      expect(result.content).toContain("import { fn } from 'storybook/test'")
    })

    it('should handle multiple function props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          onClick: { __isFunction: true, name: 'onClick' },
          onHover: { __isFunction: true, name: 'onHover' },
          onChange: { __isFunction: true, name: 'onChange' },
        },
      })

      expect(result.content).toContain('onClick: fn()')
      expect(result.content).toContain('onHover: fn()')
      expect(result.content).toContain('onChange: fn()')
      // Should only have one fn import
      expect(result.content.match(/import \{ fn \}/g)?.length).toBe(1)
    })

    it('should replace styled component references with div elements', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source:
              '<styled.div className="spacing"><styled.button>Click me</styled.button></styled.div>',
            componentRefs: [],
          },
        },
      })

      expect(result.content).toContain(
        'children: <div className="spacing"><div>Click me</div></div>',
      )
    })

    it('should replace unknown component references with div elements', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source: '<Spacing /><UnknownComponent prop="value" />',
            componentRefs: ['Spacing', 'UnknownComponent'],
          },
        },
        componentRegistry: new Map([
          // Spacing and UnknownComponent are not in registry, so should be replaced with div
        ]),
      })

      expect(result.content).toContain(
        'children: <div data-important-read-this="The component Spacing could not be used as it is not exported, so a simple div was used instead. Please fix this." /><div data-important-read-this="The component UnknownComponent could not be used as it is not exported, so a simple div was used instead. Please replace it." prop="value" />',
      )
    })

    it('should keep known component references unchanged', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source: '<KnownComponent /><UnknownComponent />',
            componentRefs: ['KnownComponent', 'UnknownComponent'],
          },
        },
        componentRegistry: new Map([
          ['KnownComponent', '/project/src/components/KnownComponent.tsx'],
          // UnknownComponent is not in registry
        ]),
      })

      expect(result.content).toContain(
        'children: <KnownComponent /><div data-important-read-this="The component UnknownComponent could not be used as it is not exported, so a simple div was used instead. Please fix this." />',
      )
      expect(result.content).toContain(
        "import { KnownComponent } from './KnownComponent'",
      )
      // Should not try to import UnknownComponent
    })
  })

  describe('import resolution', () => {
    it('should add imports for JSX component references', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          icon: {
            __isJSX: true,
            source: '<Icon name="star" />',
            componentRefs: ['Icon'],
          },
        },
        componentRegistry: new Map([
          ['Icon', '/project/src/components/Icon.tsx'],
        ]),
      })

      expect(result.content).toContain("import { Icon } from './Icon'")
    })

    it('should extract component names from JSX source even if componentRefs is empty', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source: '<><TaskCard onAction={fn()} /><Button /></>',
            componentRefs: [], // Empty refs, but source contains components
          },
        },
        componentRegistry: new Map([
          ['TaskCard', '/project/src/components/TaskCard.tsx'],
          ['Button', '/project/src/components/Button.tsx'],
        ]),
      })

      expect(result.content).toContain("import { TaskCard } from './TaskCard'")
      expect(result.content).toContain("import { Button } from './Button'")
    })

    it('should normalize styled-wrapper names in JSX source for imports and output', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          children: {
            __isJSX: true,
            source:
              '<MyComponent><Styled(Link) to="/categories">Visit page</Styled(Link)></MyComponent>',
            componentRefs: ['Styled(Link)', 'MyComponent'],
          },
        },
        componentRegistry: new Map([
          ['MyComponent', '/project/src/components/MyComponent.tsx'],
          ['StyledLink', '/project/src/components/StyledLink.tsx'],
        ]),
      })

      expect(result.content).toContain(
        'children: <MyComponent><StyledLink to="/categories">Visit page</StyledLink></MyComponent>',
      )
      expect(result.content).toContain(
        "import { StyledLink } from './StyledLink'",
      )
    })

    it('should handle relative imports from different directories', () => {
      const result = generateStory({
        meta: {
          ...baseMeta,
          filePath: '/project/src/pages/Home.tsx',
        },
        props: {
          header: {
            __isJSX: true,
            source: '<Header />',
            componentRefs: ['Header'],
          },
        },
        componentRegistry: new Map([
          ['Header', '/project/src/components/Header.tsx'],
        ]),
      })

      expect(result.content).toContain(
        "import { Header } from '../components/Header'",
      )
    })

    it('should not import self-references', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          child: {
            __isJSX: true,
            source: '<Button />',
            componentRefs: ['Button'],
          },
        },
        componentRegistry: new Map([
          ['Button', '/project/src/components/Button.tsx'],
        ]),
      })

      // Should only have one Button import (the main component)
      const buttonImports = result.content.match(/import.*Button/g)
      expect(buttonImports?.length).toBe(1)
    })
  })

  describe('appending to existing files', () => {
    const existingContent = `import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    label: "Primary",
  },
};
`

    it('should append a new story to existing file', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { label: 'Secondary' },
        storyName: 'Secondary',
        existingContent,
      })

      expect(result.content).toContain('export const Primary: Story')
      expect(result.content).toContain('export const Secondary: Story')
      expect(result.content).toContain('label: "Secondary"')
    })

    it('should generate unique story name if already exists', () => {
      const result = generateStory({
        meta: baseMeta,
        props: { label: 'Another Primary' },
        storyName: 'Primary',
        existingContent,
      })

      expect(result.content).toContain('export const Primary: Story')
      expect(result.content).toContain('export const Primary2: Story')
    })

    it('should increment suffix for multiple duplicates', () => {
      const contentWithTwoStories =
        existingContent +
        `
export const Primary2: Story = {
  args: {
    label: "Primary 2",
  },
};
`
      const result = generateStory({
        meta: baseMeta,
        props: { label: 'Another' },
        storyName: 'Primary',
        existingContent: contentWithTwoStories,
      })

      expect(result.content).toContain('export const Primary3: Story')
    })

    it('should add fn import when appending story with function props', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {
          onClick: { __isFunction: true, name: 'onClick' },
        },
        storyName: 'WithClick',
        existingContent,
      })

      expect(result.content).toContain("import { fn } from 'storybook/test'")
      expect(result.content).toContain('onClick: fn()')
    })

    it('should not duplicate fn import if already exists', () => {
      const contentWithFn = `import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    onClick: fn(),
  },
};
`
      const result = generateStory({
        meta: baseMeta,
        props: {
          onClick: { __isFunction: true, name: 'onClick' },
        },
        storyName: 'Secondary',
        existingContent: contentWithFn,
      })

      // Should only have one fn import
      const fnImports = result.content.match(
        /import.*fn.*from.*storybook\/test/g,
      )
      expect(fnImports?.length).toBe(1)
    })
  })

  describe('file path generation', () => {
    it('should generate correct story file path', () => {
      const result = generateStory({
        meta: baseMeta,
        props: {},
      })

      expect(result.filePath).toBe('/project/src/components/Button.stories.tsx')
    })
  })
})

describe('generateStoryName', () => {
  it('should use variant prop', () => {
    expect(generateStoryName({ variant: 'primary' })).toBe('Primary')
  })

  it('should use type prop', () => {
    expect(generateStoryName({ type: 'submit' })).toBe('Submit')
  })

  it('should use size prop', () => {
    expect(generateStoryName({ size: 'large' })).toBe('Large')
  })

  it('should use mode prop', () => {
    expect(generateStoryName({ mode: 'dark' })).toBe('Dark')
  })

  it('should use status prop', () => {
    expect(generateStoryName({ status: 'error' })).toBe('Error')
  })

  it('should use kind prop', () => {
    expect(generateStoryName({ kind: 'ghost' })).toBe('Ghost')
  })

  it('should prioritize variant over other props', () => {
    expect(generateStoryName({ variant: 'primary', type: 'submit' })).toBe(
      'Primary',
    )
  })

  it('should return Default for empty props', () => {
    expect(generateStoryName({})).toBe('Default')
  })

  it('should return Default for non-meaningful props', () => {
    expect(generateStoryName({ children: 'text', className: 'btn' })).toBe(
      'Default',
    )
  })

  it('should handle invalid prop values that result in invalid identifiers', () => {
    // This would generate an invalid name, but generateStoryName only looks for specific props
    // The invalid name handling is tested in the story generation tests above
    expect(generateStoryName({ variant: '123invalid' })).toBe('123invalid')
  })
})
