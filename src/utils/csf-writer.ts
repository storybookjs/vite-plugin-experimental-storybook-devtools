/**
 * File-level mutation for generated stories: dedupes the export name against
 * what a story file already declares, merges the imports the new story needs,
 * and appends the story — on the CSF AST via `storybook/internal/csf-tools`
 * rather than by splicing strings.
 *
 * Only the *file* half lives here. Turning live props into story source
 * (`generateArgsContent`, `formatPropValue`, JSX/slot handling) stays in
 * `story-generator.ts`: csf-tools has no equivalent, its `save-story` flow
 * serialises already-typed args rather than arbitrary runtime values.
 *
 * `storybook/internal/csf-tools` is imported lazily so it never lands in
 * Next's server webpack bundle — see `src/story-index.ts` for the same
 * `webpackIgnore` reasoning.
 */
import { babelParse, types as t } from 'storybook/internal/babel'
import { escapeRegex } from './story-generator'

export interface CsfImportRequest {
  /** Module specifier, e.g. `storybook/test` or `./Button`. */
  source: string
  /** Named specifiers to ensure, e.g. `['fn', 'within']`. */
  specifiers?: string[]
  /** Default import binding, e.g. `Button`. */
  defaultSpecifier?: string
  typeOnly?: boolean
}

export interface CsfWriteRequest {
  /** Current content of the story file being appended to. */
  existingCode: string
  /** Path of the story file, used for CSF diagnostics and formatting. */
  fileName: string
  /** Rendered `export const <desiredExportName>: Story = { ... };` block. */
  storyExportSource: string
  desiredExportName: string
  requiredImports: CsfImportRequest[]
}

export interface CsfWriteResult {
  code: string
  /** The export name actually used, after deduplication. */
  exportName: string
  /**
   * Why the CSF AST path was abandoned for the regex splice. Absent when
   * the story was appended on the AST.
   */
  fallbackReason?: string
}

/** Pick the quote style recast should use for nodes it has to print fresh. */
function detectQuoteStyle(code: string): 'single' | 'double' {
  const single = (code.match(/from '[^']*'/g) ?? []).length
  const double = (code.match(/from "[^"]*"/g) ?? []).length
  return double > single ? 'double' : 'single'
}

function uniqueExportName(taken: Set<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  let counter = 2
  while (taken.has(`${desired}${counter}`)) counter++
  return `${desired}${counter}`
}

/** Every top-level binding a file already declares, imports included. */
function collectTopLevelBindings(program: t.Program): Set<string> {
  const names = new Set<string>()
  const addPattern = (node: t.Node): void => {
    if (t.isIdentifier(node)) names.add(node.name)
  }

  for (const statement of program.body) {
    const declaration = t.isExportNamedDeclaration(statement)
      ? statement.declaration
      : statement

    if (t.isVariableDeclaration(declaration)) {
      for (const declarator of declaration.declarations) addPattern(declarator.id)
    } else if (
      t.isFunctionDeclaration(declaration) ||
      t.isClassDeclaration(declaration) ||
      t.isTSTypeAliasDeclaration(declaration) ||
      t.isTSInterfaceDeclaration(declaration) ||
      t.isTSEnumDeclaration(declaration)
    ) {
      if (declaration.id) addPattern(declaration.id)
    } else if (t.isImportDeclaration(statement)) {
      for (const specifier of statement.specifiers) addPattern(specifier.local)
    }

    if (t.isExportNamedDeclaration(statement)) {
      for (const specifier of statement.specifiers) {
        if (t.isExportSpecifier(specifier)) addPattern(specifier.exported)
      }
    }
  }

  return names
}

/** Ensure `request`'s bindings exist, extending a matching import when there is one. */
function mergeImport(program: t.Program, request: CsfImportRequest): void {
  const wanted = request.specifiers ?? []
  const existing = program.body.filter(
    (node): node is t.ImportDeclaration =>
      t.isImportDeclaration(node) && node.source.value === request.source,
  )

  if (request.defaultSpecifier) {
    const hasDefault = existing.some((node) =>
      node.specifiers.some((s) => t.isImportDefaultSpecifier(s)),
    )
    if (!hasDefault) {
      insertImport(
        program,
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(request.defaultSpecifier))],
          t.stringLiteral(request.source),
        ),
      )
    }
  }

  if (wanted.length === 0) return

  const declared = new Set<string>()
  for (const node of existing) {
    for (const specifier of node.specifiers) {
      if (t.isImportSpecifier(specifier)) declared.add(specifier.local.name)
    }
  }
  const missing = wanted.filter((name) => !declared.has(name))
  if (missing.length === 0) return

  const target = existing.find((node) =>
    node.specifiers.some((s) => t.isImportSpecifier(s)),
  )
  if (target) {
    for (const name of missing) {
      target.specifiers.push(
        t.importSpecifier(t.identifier(name), t.identifier(name)),
      )
    }
    return
  }

  const declaration = t.importDeclaration(
    missing.map((name) =>
      t.importSpecifier(t.identifier(name), t.identifier(name)),
    ),
    t.stringLiteral(request.source),
  )
  if (request.typeOnly) declaration.importKind = 'type'
  insertImport(program, declaration)
}

function insertImport(program: t.Program, declaration: t.ImportDeclaration): void {
  let lastImport = -1
  program.body.forEach((node, index) => {
    if (t.isImportDeclaration(node)) lastImport = index
  })
  program.body.splice(lastImport + 1, 0, declaration)
}

/** Rename the single declarator/function the snippet exports. */
function renameExport(program: t.Program, from: string, to: string): void {
  if (from === to) return
  for (const statement of program.body) {
    if (!t.isExportNamedDeclaration(statement)) continue
    const declaration = statement.declaration
    if (t.isVariableDeclaration(declaration)) {
      for (const declarator of declaration.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.id.name === from) {
          // Renaming in place keeps the identifier's type annotation
          // (`: Story`); replacing the node would drop it. Recast reprints
          // only the identifier, so the initialiser's generated args/JSX
          // survive verbatim.
          declarator.id.name = to
          return
        }
      }
    }
  }
}

/**
 * Append `storyExportSource` to `existingCode`, returning the full file
 * content and the export name that was actually used.
 */
export async function writeStoryIntoCsf(
  request: CsfWriteRequest,
): Promise<CsfWriteResult> {
  const { existingCode, fileName, desiredExportName } = request

  try {
    const { loadCsf, printCsf } = await import(
      /* webpackIgnore: true */ 'storybook/internal/csf-tools'
    )
    const csf = loadCsf(existingCode, {
      makeTitle: (userTitle: string) => userTitle || 'Auto',
      fileName,
    }).parse()

    const program = csf._ast.program
    const taken = collectTopLevelBindings(program)
    for (const name of Object.keys(csf._storyExports)) taken.add(name)
    const exportName = uniqueExportName(taken, desiredExportName)

    for (const importRequest of request.requiredImports) {
      mergeImport(program, importRequest)
    }

    // Two leading newlines put exactly one blank line between the last
    // existing statement and the appended story; recast derives inter-node
    // spacing from the snippet's own line numbers.
    const snippet = babelParse(`\n\n${request.storyExportSource.trimStart()}`)
    renameExport(snippet.program, desiredExportName, exportName)
    program.body.push(...snippet.program.body)

    const { code } = printCsf(csf, { quote: detectQuoteStyle(existingCode) })
    return {
      code: code.endsWith('\n') ? code : `${code}\n`,
      exportName,
    }
  } catch (error) {
    const result = appendWithRegex(request)
    return {
      ...result,
      fallbackReason: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Text-splicing append, used when a story file can't be parsed as CSF (no
 * default export, syntax the CSF parser rejects). Keeps a partially valid file
 * appendable instead of failing the whole story creation.
 */
function appendWithRegex(
  request: CsfWriteRequest,
): Pick<CsfWriteResult, 'code' | 'exportName'> {
  const { existingCode: code, desiredExportName, storyExportSource } = request

  const taken = new Set<string>()
  const storyExportRegex = /export\s+const\s+(\w+)\s*[=:]/g
  let match
  while ((match = storyExportRegex.exec(code)) !== null) {
    if (match[1]) taken.add(match[1])
  }
  const exportName = uniqueExportName(taken, desiredExportName)

  let updated = code
  const insertAfterImports = (statement: string): void => {
    const lastImportMatch = updated.match(
      /^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m,
    )
    if (!lastImportMatch) return
    const insertPos = lastImportMatch.index! + lastImportMatch[0].length
    updated =
      updated.slice(0, insertPos) + statement + updated.slice(insertPos)
  }

  for (const importRequest of request.requiredImports) {
    const { source, specifiers = [], defaultSpecifier } = importRequest
    const namedRegex = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapeRegex(source)}['"]`,
    )
    const namedMatch = updated.match(namedRegex)

    if (specifiers.length > 0) {
      if (namedMatch && namedMatch[1]) {
        const declared = namedMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const merged = [...new Set([...declared, ...specifiers])]
        if (merged.length !== declared.length) {
          updated = updated.replace(
            namedMatch[0],
            `import { ${merged.join(', ')} } from '${source}'`,
          )
        }
      } else {
        insertAfterImports(
          `import ${importRequest.typeOnly ? 'type ' : ''}{ ${specifiers.join(', ')} } from '${source}';\n`,
        )
      }
    }

    if (defaultSpecifier && !new RegExp(
      `import\\s+${escapeRegex(defaultSpecifier)}\\s*(,|from)`,
    ).test(updated)) {
      insertAfterImports(`import ${defaultSpecifier} from '${source}';\n`)
    }
  }

  const story = storyExportSource.replace(
    `export const ${desiredExportName}`,
    `export const ${exportName}`,
  )

  return {
    code: `${updated.trimEnd()}\n\n${story.trim()}\n`,
    exportName,
  }
}

/**
 * Run the user project's prettier over generated story content. A no-op
 * returning `content` unchanged when prettier isn't installed or the project
 * has no prettier/editorconfig config.
 */
export async function formatStoryFile(
  filePath: string,
  content: string,
): Promise<string> {
  try {
    const { formatFileContent } = await import(
      /* webpackIgnore: true */ 'storybook/internal/common'
    )
    return await formatFileContent(filePath, content)
  } catch {
    return content
  }
}
