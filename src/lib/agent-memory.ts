// Managed Cloudflare Agent Memory binding wrapper
//
// TODO: VERIFY CLOUDFLARE API — DO NOT GUESS.
// The Cloudflare "Agent Memory" managed binding is not confirmed to be available
// in the target Workers runtime, and its read/write RPC surface is not verified.
// Until it is confirmed, AuditEngine continues to use the custom
// SharedMemoryDurableObject implementation as the runtime fallback.

export { SharedMemoryDurableObject as AgentMemoryDurableObject } from '../workers/shared-memory'
