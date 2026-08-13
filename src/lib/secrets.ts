export interface SecretMatch {
  name: string
  value: string
  index: number
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hash)
}

export const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'private_key',
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: 'aws_access_key',
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: 'assignment_secret',
    regex: /(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token|auth[_-]?token|bearer|client[_-]?secret|app[_-]?secret|password|passwd|pwd|secret|token)\s*[:=]\s*["']?[a-zA-Z0-9_\-./+=!@#$%^&*]{16,}["']?/gi,
  },
  {
    name: 'connection_string',
    regex: /(?:connection[_-]?string|conn[_-]?string|database[_-]?url|db[_-]?url)\s*[:=]\s*["']?[^"'\s]+["']?/gi,
  },
]

export function findSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.replace('g', '') + 'g')
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      matches.push({ name: pattern.name, value: match[0], index: match.index })
    }
  }
  return matches
}

export function redactForLLM(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern.regex, '[REDACTED]')
  }
  return result
}

export async function redactForStorage(text: string): Promise<string> {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    const matches = Array.from(text.matchAll(pattern.regex))
    for (const match of matches.reverse()) {
      const hash = await sha256Hex(match[0])
      const start = match.index ?? 0
      result = result.slice(0, start) + `[REDACTED:${hash}]` + result.slice(start + match[0].length)
    }
  }
  return result
}
