import type { NotebookTree, TreeChild, SectionNode, GroupNode } from '@shared/types'

/** Children of the notebook root ('') or of the group at `groupRel`. */
export function childrenOf(tree: NotebookTree, groupRel: string): TreeChild[] {
  if (!groupRel) return tree.children
  const group = findNode(tree.children, groupRel)
  return group && group.kind === 'group' ? group.children : []
}

export function findNode(children: TreeChild[], rel: string): TreeChild | undefined {
  for (const child of children) {
    if (child.relPath === rel) return child
    if (child.kind === 'group') {
      const inner = findNode(child.children, rel)
      if (inner) return inner
    }
  }
  return undefined
}

export function findSection(tree: NotebookTree, rel: string | null): SectionNode | undefined {
  if (!rel) return undefined
  const node = findNode(tree.children, rel)
  return node && node.kind === 'section' ? node : undefined
}

/** Group nodes from the root down to `groupRel`, for the breadcrumb. */
export function groupPath(tree: NotebookTree, groupRel: string): GroupNode[] {
  const path: GroupNode[] = []
  if (!groupRel) return path
  let children = tree.children
  const parts = groupRel.split('/')
  let acc = ''
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part
    const node = children.find((c) => c.relPath === acc)
    if (!node || node.kind !== 'group') break
    path.push(node)
    children = node.children
  }
  return path
}

export function parentGroupRel(groupRel: string): string {
  const i = groupRel.lastIndexOf('/')
  return i < 0 ? '' : groupRel.slice(0, i)
}

export function firstSection(children: TreeChild[]): SectionNode | undefined {
  return children.find((c): c is SectionNode => c.kind === 'section')
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
