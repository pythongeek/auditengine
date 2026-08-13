export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hash)
}

export function makeChunkKey(
  tenantId: string,
  auditRunId: string,
  filePathHash: string,
  chunkIndex: number
): string {
  const safeTenant = tenantId || 'default'
  return `${safeTenant}/${auditRunId}/${filePathHash}/${chunkIndex}`
}

export async function uploadChunk(
  tenantId: string,
  auditRunId: string,
  filePath: string,
  chunkIndex: number,
  content: string,
  r2: R2Bucket
): Promise<string> {
  const filePathHash = await sha256Hex(filePath)
  const key = makeChunkKey(tenantId, auditRunId, filePathHash, chunkIndex)
  await r2.put(key, content)
  return key
}

export async function getChunk(
  tenantId: string,
  auditRunId: string,
  filePath: string,
  chunkIndex: number,
  r2: R2Bucket
): Promise<R2ObjectBody | null> {
  const filePathHash = await sha256Hex(filePath)
  const key = makeChunkKey(tenantId, auditRunId, filePathHash, chunkIndex)
  return r2.get(key)
}

export async function listChunks(
  tenantId: string,
  auditRunId: string,
  r2: R2Bucket
): Promise<string[]> {
  const prefix = `${tenantId || 'default'}/${auditRunId}/`
  const listed = await r2.list({ prefix })
  return listed.objects?.map(obj => obj.key) ?? []
}

export async function deleteChunk(
  tenantId: string,
  auditRunId: string,
  filePath: string,
  chunkIndex: number,
  r2: R2Bucket
): Promise<void> {
  const filePathHash = await sha256Hex(filePath)
  const key = makeChunkKey(tenantId, auditRunId, filePathHash, chunkIndex)
  await r2.delete(key)
}
