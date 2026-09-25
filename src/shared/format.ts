/** Human-readable file size. Safe to import from the renderer. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function fileKind(name: string): 'mail' | 'video' | 'image' | 'pdf' | 'file' {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'eml' || ext === 'msg') return 'mail'
  if (['mp4', 'mov', 'm4v', 'webm', 'ogv', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'tif', 'tiff'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'file'
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : ''
}
