import type { JSX } from 'react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'

interface ActiveEditor {
  editor: Editor | null
  setEditor: (e: Editor | null) => void
}

const Ctx = createContext<ActiveEditor>({ editor: null, setEditor: () => {} })

export function ActiveEditorProvider({ children }: { children: ReactNode }): JSX.Element {
  const [editor, setEditor] = useState<Editor | null>(null)
  return <Ctx.Provider value={{ editor, setEditor }}>{children}</Ctx.Provider>
}

export function useActiveEditor(): ActiveEditor {
  return useContext(Ctx)
}
