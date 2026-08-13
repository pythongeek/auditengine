import { unzip, type AsyncZipOptions } from 'fflate'

export interface RepoFile {
  path: string
  content: string
  lastModified: number
}

function sanitizePath(path: string): string | null {
  // Skip directories and macOS metadata
  if (path.endsWith('/')) return null
  if (path.startsWith('__MACOSX/')) return null
  if (path.includes('/.DS_Store')) return null
  return path
}

export async function extractZipFiles(buffer: ArrayBuffer): Promise<RepoFile[]> {
  const data = new Uint8Array(buffer)
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, {}, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  const out: RepoFile[] = []
  for (const [rawPath, bytes] of Object.entries(files)) {
    const path = sanitizePath(rawPath)
    if (!path) continue
    const content = new TextDecoder().decode(bytes)
    // fflate does not expose per-entry mtimes; use ingestion time as fallback.
    out.push({ path, content, lastModified: Date.now() })
  }

  return out
}
