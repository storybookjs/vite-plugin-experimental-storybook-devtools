import { describe, it, expect } from 'vitest'
import { transform, detectVue } from './transform'

describe('Vue transform', () => {
  describe('basic transformations', () => {
    it('should transform a simple SFC with script setup', () => {
      const code = `
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <div>{{ count }}</div>
</template>
`
      const result = transform(code, '/src/components/Counter.vue')

      expect(result).toBeDefined()
      expect(result).toContain('withComponentHighlighter')
      expect(result).toContain('Counter')
      expect(result).toContain('__componentMeta')
    })

    it('should transform an SFC with plain script block', () => {
      const code = `
<script>
export default {
  name: 'MyComponent',
  data() {
    return { msg: 'hello' }
  }
}
</script>

<template>
  <div>{{ msg }}</div>
</template>
`
      const result = transform(code, '/src/components/MyComponent.vue')

      expect(result).toBeDefined()
      expect(result).toContain('withComponentHighlighter')
      expect(result).toContain('MyComponent')
    })

    it('should not transform a file without script or script setup', () => {
      const code = `
<template>
  <div>static content</div>
</template>
`
      const result = transform(code, '/src/components/Static.vue')

      expect(result).toBeUndefined()
    })
  })

  describe('metadata injection', () => {
    it('should inject correct component name from filename', () => {
      const code = `
<script setup lang="ts">
const msg = 'hello'
</script>

<template>
  <div>{{ msg }}</div>
</template>
`
      const result = transform(code, '/src/components/TaskList.vue')

      expect(result).toBeDefined()
      expect(result).toContain('"componentName":"TaskList"')
    })

    it('should inject filePath in metadata', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>test</div>
</template>
`
      const result = transform(code, '/project/src/components/Button.vue')

      expect(result).toBeDefined()
      expect(result).toContain('"filePath":"/project/src/components/Button.vue"')
    })

    it('should set isDefaultExport to true', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>test</div>
</template>
`
      const result = transform(code, '/src/components/Widget.vue')

      expect(result).toBeDefined()
      expect(result).toContain('"isDefaultExport":true')
    })

    it('should include a sourceId hash', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>test</div>
</template>
`
      const result = transform(code, '/src/components/TestComp.vue')

      expect(result).toBeDefined()
      expect(result).toContain('"sourceId":"')
    })

    it('should generate different sourceIds for different file paths', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>test</div>
</template>
`
      const result1 = transform(code, '/src/components/CompA.vue')
      const result2 = transform(code, '/src/components/CompB.vue')

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()

      // Extract sourceIds
      const sourceId1 = result1!.match(/"sourceId":"([^"]+)"/)?.[1]
      const sourceId2 = result2!.match(/"sourceId":"([^"]+)"/)?.[1]

      expect(sourceId1).toBeDefined()
      expect(sourceId2).toBeDefined()
      expect(sourceId1).not.toBe(sourceId2)
    })
  })

  describe('script setup handling', () => {
    it('should preserve existing script setup content', () => {
      const code = `
<script setup lang="ts">
import { ref, computed } from 'vue'
import MyChild from './MyChild.vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>

<template>
  <div>{{ doubled }}</div>
</template>
`
      const result = transform(code, '/src/components/Parent.vue')

      expect(result).toBeDefined()
      expect(result).toContain("import { ref, computed } from 'vue'")
      expect(result).toContain("import MyChild from './MyChild.vue'")
      expect(result).toContain('const count = ref(0)')
      expect(result).toContain('const doubled = computed')
    })

    it('should handle JavaScript (non-TS) script setup', () => {
      const code = `
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <div>{{ count }}</div>
</template>
`
      const result = transform(code, '/src/components/JsComp.vue')

      expect(result).toBeDefined()
      expect(result).toContain('withComponentHighlighter')
      // The transform defaults to lang="ts" when no lang is specified
      expect(result).toContain('lang="ts"')
    })
  })

  describe('template preservation', () => {
    it('should preserve the template content', () => {
      const code = `
<script setup lang="ts">
const msg = 'hello'
</script>

<template>
  <div class="container">
    <h1>{{ msg }}</h1>
    <slot />
  </div>
</template>
`
      const result = transform(code, '/src/components/Layout.vue')

      expect(result).toBeDefined()
      expect(result).toContain('<div class="container">')
      expect(result).toContain('<h1>{{ msg }}</h1>')
      expect(result).toContain('<slot />')
    })
  })

  describe('style preservation', () => {
    it('should preserve scoped styles', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div class="box">styled</div>
</template>

<style scoped>
.box { color: red; }
</style>
`
      const result = transform(code, '/src/components/Styled.vue')

      expect(result).toBeDefined()
      expect(result).toContain('<style scoped>')
      expect(result).toContain('.box { color: red; }')
    })

    it('should preserve style lang attribute', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>styled</div>
</template>

<style lang="scss" scoped>
.box { color: blue; }
</style>
`
      const result = transform(code, '/src/components/ScssStyled.vue')

      expect(result).toBeDefined()
      expect(result).toContain('<style scoped lang="scss">')
    })

    it('should preserve multiple style blocks', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>styled</div>
</template>

<style>
.global { color: red; }
</style>

<style scoped>
.local { color: blue; }
</style>
`
      const result = transform(code, '/src/components/MultiStyle.vue')

      expect(result).toBeDefined()
      expect(result).toContain('.global { color: red; }')
      expect(result).toContain('.local { color: blue; }')
    })
  })

  describe('virtual module import', () => {
    it('should import withComponentHighlighter from the virtual module', () => {
      const code = `
<script setup lang="ts">
const x = 1
</script>

<template>
  <div>test</div>
</template>
`
      const result = transform(code, '/src/components/TestImport.vue')

      expect(result).toBeDefined()
      expect(result).toContain(
        "import { withComponentHighlighter } from 'virtual:component-highlighter/vue-runtime'",
      )
    })
  })

  describe('error handling', () => {
    it('should return undefined for malformed SFC', () => {
      const code = 'this is not a valid vue file'
      // parseVue doesn't throw for non-SFC content, it just returns empty descriptors
      // so this should return undefined because there's no script/scriptSetup
      const result = transform(code, '/src/components/Invalid.vue')

      expect(result).toBeUndefined()
    })
  })
})

describe('detectVue', () => {
  it('should detect .vue files with template', () => {
    expect(detectVue('<template><div>test</div></template>', '/src/App.vue')).toBe(true)
  })

  it('should detect .vue files with script', () => {
    expect(detectVue('<script>export default {}</script>', '/src/App.vue')).toBe(true)
  })

  it('should not detect non-.vue files', () => {
    expect(detectVue('<template><div>test</div></template>', '/src/App.tsx')).toBe(false)
  })

  it('should not detect .vue files without template or script', () => {
    expect(detectVue('/* just a comment */', '/src/App.vue')).toBe(false)
  })
})
