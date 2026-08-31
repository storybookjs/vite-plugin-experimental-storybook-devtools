import * as fs from 'fs'
import * as path from 'path'
import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const checkStory = defineRpcFunction({
  name: 'check-story',
  type: 'query',
  setup: (ctx) => {
    const { storiesDir } = getStorybookDevframeContext(ctx)
    return {
      handler: (arg: { componentPath: string }) => {
        const componentPath = arg?.componentPath
        if (!componentPath) {
          return { hasStory: false, storyPath: null }
        }

        const componentDir = path.dirname(componentPath)
        const componentFileName = path.basename(
          componentPath,
          path.extname(componentPath),
        )

        const possiblePaths = [
          path.join(componentDir, `${componentFileName}.stories.tsx`),
          path.join(componentDir, `${componentFileName}.stories.ts`),
          path.join(componentDir, `${componentFileName}.stories.jsx`),
          path.join(componentDir, `${componentFileName}.stories.js`),
        ]

        if (storiesDir) {
          possiblePaths.push(
            path.join(
              componentDir,
              storiesDir,
              `${componentFileName}.stories.tsx`,
            ),
            path.join(
              componentDir,
              storiesDir,
              `${componentFileName}.stories.ts`,
            ),
            path.join(
              componentDir,
              storiesDir,
              `${componentFileName}.stories.jsx`,
            ),
            path.join(
              componentDir,
              storiesDir,
              `${componentFileName}.stories.js`,
            ),
          )
        }

        let storyPath: string | null = null
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            storyPath = p
            break
          }
        }

        return { hasStory: !!storyPath, storyPath }
      },
    }
  },
})
