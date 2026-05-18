/**
 * React Transform
 *
 * Non-intrusive instrumentation. Instead of wrapping components in an HOC
 * (which pollutes the fiber/DOM tree and forces every component into a client
 * boundary — breaking RSC), this only appends a single idempotent metadata
 * tag per exported component:
 *
 *   __chRegisterMeta(Button, { componentName, filePath, ... })
 *
 * The tag attaches a non-enumerable symbol to the component function. The
 * runtime reads it off the live fiber tree via the React DevTools global hook.
 * The rendered tree is left completely untouched.
 */

// @ts-nocheck
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import generatorModule from '@babel/generator'
import * as t from '@babel/types'
import * as path from 'path'
import type { TransformFunction } from '../types'

const traverse = (traverseModule as any).default ?? traverseModule
const generate = (generatorModule as any).default ?? generatorModule

function createHash(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/** Virtual module ID for React runtime */
export const VIRTUAL_MODULE_ID = 'virtual:component-highlighter/runtime'

const TAG_FN = '__chRegisterMeta'

function isComponentName(name: string | undefined | null): boolean {
  return (
    !!name &&
    name[0] === name[0].toUpperCase() &&
    name[0] !== name[0].toLowerCase()
  )
}

function isMemoOrForwardRef(node: t.Expression | null | undefined): boolean {
  if (!node || node.type !== 'CallExpression') return false
  const callee = node.callee
  // Bare form: memo(...) / forwardRef(...)
  if (
    callee.type === 'Identifier' &&
    (callee.name === 'memo' || callee.name === 'forwardRef')
  ) {
    return true
  }
  // Member form: React.memo(...) / React.forwardRef(...)
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    (callee.property.name === 'memo' || callee.property.name === 'forwardRef')
  ) {
    return true
  }
  return false
}

function isComponentInit(node: t.Expression | null | undefined): boolean {
  if (!node) return false
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    isMemoOrForwardRef(node)
  )
}

/**
 * Transform React JSX/TSX files: collect exported component bindings and
 * append metadata tags. The component declarations themselves are never
 * modified.
 */
export const transform: TransformFunction = (
  code: string,
  id: string,
): string | undefined => {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        ['decorators', { decoratorsBeforeExport: true }],
      ],
      sourceFilename: id,
    })

    let hasJsx = false
    traverse(ast, {
      JSXElement() {
        hasJsx = true
      },
      JSXFragment() {
        hasJsx = true
      },
    })

    // Top-level component declarations by name, the set of names that are
    // exported (inline, via specifier, or as default), and the default name.
    const topLevelComponents = new Set<string>()
    const exportedNames = new Set<string>()
    let defaultExportName: string | null = null

    const considerFunction = (decl: t.FunctionDeclaration) => {
      const name = decl.id?.name
      if (name && isComponentName(name)) topLevelComponents.add(name)
    }
    const considerVariable = (varDecl: t.VariableDeclaration) => {
      for (const d of varDecl.declarations) {
        if (
          d.id.type === 'Identifier' &&
          isComponentName(d.id.name) &&
          isComponentInit(d.init)
        ) {
          topLevelComponents.add(d.id.name)
        }
      }
    }
    const considerClass = (decl: t.ClassDeclaration) => {
      const name = decl.id?.name
      if (name && isComponentName(name)) topLevelComponents.add(name)
    }

    for (const stmt of ast.program.body) {
      if (stmt.type === 'FunctionDeclaration') {
        considerFunction(stmt)
      } else if (stmt.type === 'VariableDeclaration') {
        considerVariable(stmt)
      } else if (stmt.type === 'ClassDeclaration') {
        considerClass(stmt)
      } else if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.declaration?.type === 'FunctionDeclaration') {
          considerFunction(stmt.declaration)
          if (stmt.declaration.id) exportedNames.add(stmt.declaration.id.name)
        } else if (stmt.declaration?.type === 'ClassDeclaration') {
          considerClass(stmt.declaration)
          if (stmt.declaration.id) exportedNames.add(stmt.declaration.id.name)
        } else if (stmt.declaration?.type === 'VariableDeclaration') {
          considerVariable(stmt.declaration)
          for (const d of stmt.declaration.declarations) {
            if (d.id.type === 'Identifier') exportedNames.add(d.id.name)
          }
        }
        for (const spec of stmt.specifiers ?? []) {
          if (spec.type === 'ExportSpecifier' && spec.local) {
            exportedNames.add(spec.local.name)
          }
        }
      } else if (stmt.type === 'ExportDefaultDeclaration') {
        const decl = stmt.declaration
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          considerFunction(decl)
          defaultExportName = decl.id.name
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          considerClass(decl)
          defaultExportName = decl.id.name
        } else if (decl.type === 'Identifier') {
          defaultExportName = decl.name
        }
        // Anonymous default expressions are skipped: no stable binding to tag.
      }
    }

    if (defaultExportName) exportedNames.add(defaultExportName)

    // name -> isDefaultExport
    const componentBindings = new Map<string, boolean>()
    for (const name of topLevelComponents) {
      if (exportedNames.has(name)) {
        componentBindings.set(name, name === defaultExportName)
      }
    }

    if (!hasJsx || componentBindings.size === 0) {
      return undefined
    }

    const relativeFilePath = path.relative(process.cwd(), id)

    // import { __chRegisterMeta } from 'virtual:...'
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(TAG_FN), t.identifier(TAG_FN))],
        t.stringLiteral(VIRTUAL_MODULE_ID),
      ),
    )

    // Append tag statements at the end so const bindings are initialized.
    for (const [name, isDefaultExport] of componentBindings) {
      const sourceId = createHash(id + ':' + name)
      const meta = t.objectExpression([
        t.objectProperty(
          t.identifier('componentName'),
          t.stringLiteral(name),
        ),
        t.objectProperty(t.identifier('filePath'), t.stringLiteral(id)),
        t.objectProperty(
          t.identifier('relativeFilePath'),
          t.stringLiteral(relativeFilePath),
        ),
        t.objectProperty(
          t.identifier('sourceId'),
          t.stringLiteral(sourceId),
        ),
        t.objectProperty(
          t.identifier('isDefaultExport'),
          t.booleanLiteral(isDefaultExport),
        ),
      ])
      ast.program.body.push(
        t.expressionStatement(
          t.callExpression(t.identifier(TAG_FN), [
            t.identifier(name),
            meta,
          ]),
        ),
      )
    }

    const output = generate(ast, {
      sourceMaps: true,
      sourceFileName: id,
    })

    return output.code
  } catch (error) {
    console.warn(`[component-highlighter] Failed to transform ${id}:`, error)
    return undefined
  }
}

/** Detect if a file is a React file */
export function detectReact(code: string, id: string): boolean {
  if (!id.match(/\.(tsx|jsx)$/)) {
    return false
  }
  const hasReactImport =
    /import\s+(?:React|\{[^}]*\})\s+from\s+['"]react['"]/.test(code)
  const hasJSX = /<[A-Z][a-zA-Z]*|<[a-z]+[^>]*>/.test(code)
  return hasReactImport || hasJSX
}
