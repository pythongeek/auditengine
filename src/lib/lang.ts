export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase()
  const extMatch = lower.match(/\.([a-z0-9]+)$/)
  const ext = extMatch?.[1] ?? ''

  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    scala: 'scala',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    fs: 'fsharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    swift: 'swift',
    sql: 'sql',
    prisma: 'prisma',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    mdx: 'markdown',
    dockerfile: 'dockerfile',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    tf: 'terraform',
    hcl: 'hcl',
    sol: 'solidity',
  }

  if (lower.endsWith('dockerfile') || lower.includes('/dockerfile')) return 'dockerfile'
  if (lower.includes('/makefile') || lower === 'makefile') return 'makefile'

  return map[ext] || 'unknown'
}
