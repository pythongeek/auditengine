import type { Env, AgentPersistentState, SalvationResearchSource } from '../types/index'

export interface ResearchAdapter {
  name: string
  search(query: string): Promise<SalvationResearchSource[]>
}

const DEFAULT_TIMEOUT_MS = 6_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Research request timed out: ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export class NvdAdapter implements ResearchAdapter {
  name = 'nvd'

  async search(query: string): Promise<SalvationResearchSource[]> {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(query)}&resultsPerPage=3`
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 8_000)
      if (!res.ok) return []
      const data = await res.json() as {
        vulnerabilities?: Array<{
          cve?: {
            id?: string
            descriptions?: Array<{ lang: string; value: string }>
          }
        }>
      }
      return (data.vulnerabilities ?? []).slice(0, 3).map(v => {
        const cve = v.cve ?? {}
        const description =
          cve.descriptions?.find(d => d.lang === 'en')?.value ??
          `CVE ${cve.id ?? 'unknown'}`
        return {
          source_type: 'nvd' as const,
          url: `https://nvd.nist.gov/vuln/detail/${cve.id ?? 'unknown'}`,
          relevant_finding: description.slice(0, 240),
          proposed_solution: `Review ${cve.id ?? 'the CVE'} details and apply the vendor patch or recommended workaround.`,
        }
      })
    } catch {
      return []
    }
  }
}

export class GitHubIssueAdapter implements ResearchAdapter {
  constructor(private token: string) {}

  name = 'github_issue'

  async search(query: string): Promise<SalvationResearchSource[]> {
    if (!this.token) return []
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}+is:issue&per_page=3`
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.token}`,
          },
        },
        8_000
      )
      if (!res.ok) return []
      const data = await res.json() as {
        items?: Array<{ html_url: string; title: string; body: string | null }>
      }
      return (data.items ?? []).slice(0, 3).map(item => ({
        source_type: 'github_issue' as const,
        url: item.html_url,
        relevant_finding: item.title,
        proposed_solution: (item.body ?? 'See issue discussion for community workarounds.').slice(0, 300),
      }))
    } catch {
      return []
    }
  }
}

export class WebSearchAdapter implements ResearchAdapter {
  constructor(
    private apiKey: string,
    private provider = 'brave'
  ) {}

  name = 'web_search'

  async search(query: string): Promise<SalvationResearchSource[]> {
    if (!this.apiKey) return []
    try {
      const provider = this.provider.toLowerCase()
      let results: Array<{ title: string; url: string; description: string }> = []

      if (provider === 'brave') {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`
        const res = await fetchWithTimeout(
          url,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-Subscription-Token': this.apiKey,
            },
          },
          8_000
        )
        if (!res.ok) return []
        const data = await res.json() as {
          web?: { results?: Array<{ title: string; url: string; description: string }> }
        }
        results = data.web?.results ?? []
      } else if (provider === 'bing') {
        const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=3`
        const res = await fetchWithTimeout(
          url,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Ocp-Apim-Subscription-Key': this.apiKey,
            },
          },
          8_000
        )
        if (!res.ok) return []
        const data = await res.json() as {
          webPages?: { value?: Array<{ name: string; url: string; snippet: string }> }
        }
        results = (data.webPages?.value ?? []).map(r => ({
          title: r.name,
          url: r.url,
          description: r.snippet,
        }))
      } else {
        return []
      }

      return results.slice(0, 3).map(r => {
        const isStackOverflow =
          r.url.includes('stackoverflow.com') || r.url.includes('stackexchange.com')
        return {
          source_type: isStackOverflow ? ('stackoverflow' as const) : ('framework_docs' as const),
          url: r.url,
          relevant_finding: r.title,
          proposed_solution: r.description.slice(0, 300),
        }
      })
    } catch {
      return []
    }
  }
}

export function createResearchAdapters(env: Env): ResearchAdapter[] {
  return [
    new NvdAdapter(),
    new GitHubIssueAdapter(env.GITHUB_TOKEN ?? ''),
    new WebSearchAdapter(env.SEARCH_API_KEY ?? '', env.SEARCH_PROVIDER ?? 'brave'),
  ]
}

function deriveResearchQueries(state: AgentPersistentState): string[] {
  const queries: string[] = []
  const rejection = state.gateRejectionHistory[0] ?? ''
  const agent = state.agentType
  const file = state.currentFile ?? ''
  const extension = file.split('.').pop() ?? ''

  if (rejection) {
    queries.push(`${rejection} ${agent} ${extension}`)
  }
  queries.push(`${agent} security best practices ${extension}`)
  if (file) {
    queries.push(`${file} ${agent} vulnerability`)
  }
  return queries.slice(0, 3)
}

async function getCachedResearch(
  db: D1Database,
  auditRunId: string,
  filePath: string
): Promise<SalvationResearchSource[] | null> {
  const rows = await db
    .prepare(
      'SELECT content FROM knowledge_ledger WHERE audit_run_id = ? AND file_path = ? AND knowledge_type = ?'
    )
    .bind(auditRunId, filePath, 'research')
    .all<{ content: string }>()

  const sources = (rows.results ?? [])
    .map(r => {
      try {
        return JSON.parse(r.content) as SalvationResearchSource
      } catch {
        return null
      }
    })
    .filter((s): s is SalvationResearchSource => s !== null)

  return sources.length > 0 ? sources : null
}

async function cacheResearch(
  db: D1Database,
  tenantId: string,
  state: AgentPersistentState,
  sources: SalvationResearchSource[]
): Promise<void> {
  for (const source of sources) {
    await db
      .prepare(
        'INSERT INTO knowledge_ledger (tenant_id, audit_run_id, agent_id, agent_type, file_path, knowledge_type, content) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        tenantId,
        state.auditRunId,
        state.agentId,
        state.agentType,
        state.currentFile ?? '',
        'research',
        JSON.stringify(source)
      )
      .run()
  }
}

export async function researchSalvation(
  state: AgentPersistentState,
  env: Env,
  db: D1Database
): Promise<SalvationResearchSource[]> {
  const cached = await getCachedResearch(db, state.auditRunId, state.currentFile ?? '')
  if (cached && cached.length > 0) {
    return cached
  }

  const queries = deriveResearchQueries(state)
  const adapters = createResearchAdapters(env)
  const seen = new Set<string>()
  const sources: SalvationResearchSource[] = []

  for (const query of queries) {
    const results = await Promise.all(adapters.map(adapter => adapter.search(query)))
    for (const adapterSources of results) {
      for (const source of adapterSources) {
        if (!source.url || seen.has(source.url)) continue
        seen.add(source.url)
        sources.push(source)
      }
    }
  }

  const limited = sources.slice(0, 5)
  const tenantId = state.tenantId ?? ''
  if (limited.length > 0) {
    await cacheResearch(db, tenantId, state, limited)
  }
  return limited
}
