/**
 * Saves a page in a tight loop, printing the counter after each completed
 * save, until killed. Used by crash-test.ts.
 */
import { loadPage, savePage } from '../src/main/storage/page'
import type { PageDoc, TextContainer } from '../src/shared/types'

const [root, rel, startAt] = process.argv.slice(2)
if (!root || !rel) throw new Error('usage: crash-worker <root> <pageRel> [start]')

function withCounter(doc: PageDoc, n: number): PageDoc {
  const obj = doc.objects[0] as TextContainer
  const filler = 'x'.repeat(2000 + (n % 7) * 500)
  return {
    ...doc,
    title: `Crash test ${n}`,
    objects: [
      {
        ...obj,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: `counter=${n}` }] },
            { type: 'paragraph', content: [{ type: 'text', text: filler }] }
          ]
        }
      }
    ]
  }
}

async function main(): Promise<void> {
  let current = await loadPage(root!, rel!)
  let n = Number(startAt ?? '0')
  let currentRel = current.relPath
  for (;;) {
    n += 1
    const result = await savePage(root!, currentRel, withCounter(current.doc, n))
    currentRel = result.relPath
    current = { ...current, doc: result.doc }
    process.stdout.write(`saved ${n} ${currentRel}\n`)
  }
}

void main()
