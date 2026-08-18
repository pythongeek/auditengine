export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'AuditEngine API',
      version: '1.0.0',
      description: 'Multi-agent codebase audit platform REST API',
    },
    servers: [
      { url: 'https://auditengine.tsnion.workers.dev', description: 'Production' },
    ],
    tags: [
      { name: 'Admin' },
      { name: 'Tenants' },
      { name: 'Audits' },
      { name: 'Tasks' },
      { name: 'Findings' },
      { name: 'Repo Groups' },
      { name: 'Ingestion' },
      { name: 'Webhooks' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        basicAuth: {
          type: 'http',
          scheme: 'basic',
        },
      },
      schemas: {
        Tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            plan: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
        AuditSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            repo_url: { type: 'string' },
            repo_branch: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'running', 'complete', 'failed'] },
            readiness_score: { type: 'number' },
            total_files: { type: 'integer' },
            files_analyzed: { type: 'integer' },
            findings_count: { type: 'integer' },
            created_at: { type: 'integer' },
            completed_at: { type: 'integer', nullable: true },
          },
        },
        Task: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            audit_run_id: { type: 'string' },
            title: { type: 'string' },
            finding_ids: { type: 'string' },
            priority_score: { type: 'number' },
            multipliers: { type: 'string' },
            status: { type: 'string', enum: ['backlog', 'in_progress', 'in_review', 'done'] },
            assigned_agent: { type: 'string', nullable: true },
            commit_sha: { type: 'string', nullable: true },
            lock_expires_at: { type: 'integer', nullable: true },
            created_at: { type: 'integer' },
            updated_at: { type: 'integer' },
          },
        },
        Finding: {
          type: 'object',
          properties: {
            finding_id: { type: 'string' },
            audit_run_id: { type: 'string' },
            agent_id: { type: 'string' },
            agent_type: { type: 'string' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
            category: { type: 'string' },
            file: { type: 'string' },
            line_range: { type: 'array', items: { type: 'integer' }, nullable: true },
            evidence_quote: { type: 'string' },
            description: { type: 'string' },
            impact: { type: 'string', nullable: true },
            source: { type: 'string' },
            status: { type: 'string' },
            is_regression: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/v1/tenants': {
        get: {
          tags: ['Admin'],
          summary: 'List tenants (admin only)',
          security: [{ basicAuth: [] }],
          responses: {
            '200': {
              description: 'List of tenants',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tenants: { type: 'array', items: { $ref: '#/components/schemas/Tenant' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits': {
        get: {
          tags: ['Audits'],
          summary: 'List audits for a tenant',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of audits',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tenant_id: { type: 'string' },
                      audits: { type: 'array', items: { $ref: '#/components/schemas/AuditSession' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}': {
        get: {
          tags: ['Audits'],
          summary: 'Get audit details',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Audit details with findings counts',
            },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/score': {
        get: {
          tags: ['Tenants'],
          summary: 'Get tenant readiness score summary',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Score summary' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/config': {
        get: {
          tags: ['Tenants'],
          summary: 'Get tenant agent configuration',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Agent configs' },
          },
        },
        patch: {
          tags: ['Tenants'],
          summary: 'Update tenant agent configuration',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agent_id: { type: 'string' },
                    updates: { type: 'object' },
                  },
                  required: ['agent_id', 'updates'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated config' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}/tasks': {
        get: {
          tags: ['Tasks'],
          summary: 'List tasks for an audit run',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of tasks',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}/tasks/{taskId}': {
        patch: {
          tags: ['Tasks'],
          summary: 'Update a task status',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['backlog', 'in_progress', 'in_review', 'done'] },
                    assigned_agent: { type: 'string' },
                    commit_sha: { type: 'string' },
                  },
                  required: ['status'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated task' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}/tasks/{taskId}/verify': {
        post: {
          tags: ['Tasks'],
          summary: 'Verify a task against its commit',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    human_approved: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Verification result' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}/findings': {
        get: {
          tags: ['Findings'],
          summary: 'List findings for an audit run',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'severity', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of findings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/audits/{auditRunId}/findings/{findingId}': {
        patch: {
          tags: ['Findings'],
          summary: 'Update a finding status',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'auditRunId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'findingId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['status'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated finding' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/dependencies': {
        post: {
          tags: ['Repo Groups'],
          summary: 'Create a cross-repo dependency',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    group_id: { type: 'string' },
                    dependency_path: { type: 'string' },
                    consumer_run_id: { type: 'string' },
                    provider_run_id: { type: 'string' },
                  },
                  required: ['group_id', 'dependency_path', 'consumer_run_id', 'provider_run_id'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Dependency created' },
          },
        },
      },
      '/api/v1/tenants/{tenantId}/groups/{groupId}': {
        get: {
          tags: ['Repo Groups'],
          summary: 'Get a repo group and its audits',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'groupId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Repo group details' },
          },
        },
      },
      '/ingest': {
        post: {
          tags: ['Ingestion'],
          summary: 'Ingest files for an audit run',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    audit_run_id: { type: 'string' },
                    files: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          content: { type: 'string' },
                        },
                        required: ['path', 'content'],
                      },
                    },
                    repo_url: { type: 'string' },
                    branch: { type: 'string' },
                    commit_sha: { type: 'string' },
                    repo_group_id: { type: 'string' },
                  },
                  required: ['audit_run_id', 'files'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Files ingested' },
          },
        },
      },
      '/audit/start': {
        post: {
          tags: ['Ingestion'],
          summary: 'Ingest files and start an audit',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    audit_run_id: { type: 'string' },
                    files: { type: 'array' },
                    repo_url: { type: 'string' },
                    branch: { type: 'string' },
                    commit_sha: { type: 'string' },
                    repo_group_id: { type: 'string' },
                  },
                  required: ['audit_run_id', 'files'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Audit started' },
          },
        },
      },
      '/webhooks/github': {
        post: {
          tags: ['Webhooks'],
          summary: 'GitHub push webhook',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook processed' },
          },
        },
      },
      '/webhooks/gitlab': {
        post: {
          tags: ['Webhooks'],
          summary: 'GitLab push webhook',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook processed' },
          },
        },
      },
      '/webhooks/bitbucket': {
        post: {
          tags: ['Webhooks'],
          summary: 'Bitbucket push webhook',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook processed' },
          },
        },
      },
      '/api/v1/settings/keys': {
        get: {
          tags: ['Admin'],
          summary: 'List masked provider API keys',
          security: [{ basicAuth: [] }],
          responses: {
            '200': {
              description: 'Masked API key settings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      keys: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            value: { type: 'string' },
                            updated_at: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Store provider API keys',
          security: [{ basicAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    kimi_api_key: { type: 'string' },
                    minimax_api_key: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Keys saved' },
          },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          tags: ['Admin'],
          summary: 'OpenAPI specification',
          security: [],
          responses: {
            '200': {
              description: 'OpenAPI JSON',
            },
          },
        },
      },
    },
  }
}
