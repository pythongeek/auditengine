import { DurableObject } from 'cloudflare:workers'
import type { Env, DashboardEvent } from '../types/index'

export class DashboardDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
      this.ctx.acceptWebSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (request.method === 'POST') {
      try {
        const event = (await request.json()) as DashboardEvent
        this.broadcast(event)
        return new Response('Broadcasted', { status: 200 })
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
    }

    return new Response('Bad request', { status: 400 })
  }

  broadcast(event: DashboardEvent): void {
    const sockets = this.ctx.getWebSockets()
    const message = JSON.stringify(event)
    for (const ws of sockets) {
      try {
        ws.send(message)
      } catch {
        // ignore stale sockets
      }
    }
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Dashboard is broadcast-only; client messages are ignored.
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    try {
      ws.close()
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close()
    } catch {
      // already closed
    }
  }
}
