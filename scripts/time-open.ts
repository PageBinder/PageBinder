import { openNotebook } from '../src/main/storage/notebook'
const root = process.argv[2]!
const t0 = Date.now()
openNotebook(root).then((tree) => {
  const count = (c: typeof tree.children): number => c.reduce((n, x) => n + (x.kind === 'group' ? count(x.children) : x.pages.length), 0)
  console.log(`opened ${tree.meta.name}: ${tree.children.length} top-level entries, ${count(tree.children)} pages in ${Date.now() - t0} ms`)
})
