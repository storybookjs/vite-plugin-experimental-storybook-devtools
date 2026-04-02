import { argsToString, wrapInQuotes } from './args-to-string'
import type { ElementQuery, Interaction } from './types'

const EVENT_TO_USER_EVENT: Record<string, string> = {
  click: 'click',
  dblclick: 'dblClick',
  keydown: 'keyboard',
  type: 'type',
  select: 'selectOptions',
  upload: 'upload',
  focus: 'focus',
}

export type GeneratedCodeLine = {
  text: string
}

export type GeneratedCode = {
  imports: GeneratedCodeLine[]
  play: GeneratedCodeLine[]
}

export const convertInteractionsToCode = (
  interactions: Interaction[],
): GeneratedCode => {
  const codeLines: GeneratedCodeLine[] = []
  let usesBody = false
  let usesCanvas = false
  let needsExpect = false

  for (const interaction of interactions) {
    const { event } = interaction
    if (
      event.type === 'keyup' ||
      (event.type === 'keydown' && ['shift', 'tab'].includes(event.key))
    ) {
      continue
    }

    if (event.type === 'assertion') {
      needsExpect = true

      const { queryString, asElementPostfix } = getQueryString(
        interaction.elementQuery,
      )

      let assertCode = `expect(${queryString.replace(asElementPostfix, '')})`
        .replace('await ', '')
        .replace('canvas.find', 'canvas.query')

      if (event.args && event.args.length > 0) {
        assertCode += `.${event.assertionType}(${argsToString(event.args)})`
      } else {
        assertCode += `.${event.assertionType}()`
      }

      if (interaction.elementQuery.object === 'body') {
        usesBody = true
      }

      if (interaction.elementQuery.object === 'canvas') {
        usesCanvas = true
      }

      codeLines.push({
        text: `await waitFor(() => ${assertCode})`,
      })

      continue
    }

    let beginning = `await userEvent.${EVENT_TO_USER_EVENT[event.type]}`
    let { queryString, assertion } = getQueryString(interaction.elementQuery)
    let valueStr = ''

    if (event.type === 'type') {
      if (event.value === '') {
        beginning = beginning.replace(EVENT_TO_USER_EVENT[event.type]!, 'clear')
        valueStr = ''
      } else {
        valueStr = `, ${wrapInQuotes(event.value)}`
      }
    } else if (event.type === 'keydown') {
      queryString = ''
      assertion = null

      valueStr = `'${event.key}'`
    } else if (event.type === 'select') {
      valueStr = `, [${event.options.map((option) => `'${option}'`).join(', ')}]`
    } else if (event.type === 'upload') {
      valueStr = `, [${event.files.map((file) => `new File(['${file}'], '${file}')`).join(', ')}]`
    } else if (event.type === 'focus') {
      beginning = beginning.replace('focus', 'tab')
      queryString = ''
      assertion = null
      valueStr = event.shift ? '{ shift: true }' : ''
    }

    if (queryString) {
      if (interaction.elementQuery.object === 'body') {
        usesBody = true
      } else {
        usesCanvas = true
      }
    }

    if (assertion) {
      codeLines.push({ text: assertion })
      needsExpect = true
    }
    codeLines.push({
      text: `${beginning}(${queryString}${valueStr});`,
    })
  }

  if (!codeLines.length) {
    return {
      imports: [],
      play: [],
    }
  }

  const importNames = ['userEvent']

  if (usesCanvas) {
    importNames.push('within')
  }

  if (needsExpect || usesBody) {
    importNames.push('waitFor', 'expect')
  }

  const play: GeneratedCodeLine[] = [
    {
      text: 'play: async ({ canvasElement }) => {',
    },
  ]

  if (usesBody) {
    play.push({
      text: tab('const body = canvasElement.ownerDocument.body;'),
    })
  }

  if (usesCanvas) {
    if (usesBody) {
      play.push({
        text: tab('const canvas = within(body);'),
      })
    } else {
      play.push({
        text: tab('const canvas = within(canvasElement.ownerDocument.body);'),
      })
    }
  }

  play.push(
    ...codeLines.map((codeLine) => ({
      text: tab(codeLine.text),
    })),
    { text: '}' },
  )

  return {
    imports: [
      {
        text: `import { ${importNames.join(', ')} } from 'storybook/test';`,
      },
    ],
    play,
  }
}

export const tab = (str: string) => `  ${str}`

const getQueryString = (query: ElementQuery) => {
  const asElementPostfix = ' as HTMLElement'

  const beginning = `${query.object === 'canvas' ? 'await ' : ''}${query.object}.${query.method}`
  const args = argsToString(query.args)

  const queryString = `${beginning}(${args})`

  const result =
    query.nth === null ? queryString : `(${queryString})[${query.nth}]`

  const queryStringWithoutAsElement = result.replace(asElementPostfix, '')

  const assertion =
    query.object === 'body'
      ? `await waitFor(() => expect(${queryStringWithoutAsElement}).toBeInTheDocument());`
      : null

  return {
    assertion,
    queryString: result,
    asElementPostfix,
  }
}
