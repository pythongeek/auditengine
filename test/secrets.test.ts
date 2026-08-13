import { describe, it, expect } from 'vitest'
import { findSecrets, redactForLLM, redactForStorage } from '../src/lib/secrets'

describe('secrets', () => {
  describe('findSecrets', () => {
    it('finds AWS access keys', () => {
      const text = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE'
      const matches = findSecrets(text)
      expect(matches.some(m => m.name === 'aws_access_key')).toBe(true)
    })

    it('finds assignment-style secrets', () => {
      const text = 'api_key = "sk_live_51Hx9J3ExampleValueForTestingOnly"'
      const matches = findSecrets(text)
      expect(matches.some(m => m.name === 'assignment_secret')).toBe(true)
    })

    it('finds password assignments', () => {
      const text = 'password = "ExampleP@ssw0rd12345!"'
      const matches = findSecrets(text)
      expect(matches.some(m => m.name === 'assignment_secret')).toBe(true)
    })

    it('finds connection strings', () => {
      const text = 'connection_string = "postgres://user:examplepass@db.example.com:5432/app"'
      const matches = findSecrets(text)
      expect(matches.some(m => m.name === 'connection_string')).toBe(true)
    })

    it('finds private key blocks', () => {
      const text = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----'
      const matches = findSecrets(text)
      expect(matches.some(m => m.name === 'private_key')).toBe(true)
    })

    it('does not flag ordinary code as secrets', () => {
      const text = 'const x = 42\nif (enabled) { return true }\nfunction add(a, b) { return a + b }'
      const matches = findSecrets(text)
      expect(matches).toEqual([])
    })
  })

  describe('redactForLLM', () => {
    it('replaces all secrets with [REDACTED]', () => {
      const text = 'api_key = "sk_live_51Hx9J3ExampleValueForTestingOnly"\naws_access_key_id = AKIAIOSFODNN7EXAMPLE'
      const redacted = redactForLLM(text)
      expect(redacted).not.toContain('sk_live_51Hx9J3ExampleValueForTestingOnly')
      expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
      expect(redacted).toContain('[REDACTED]')
    })

    it('leaves non-secret text unchanged', () => {
      const text = 'const user = await db.user.findById(id)'
      expect(redactForLLM(text)).toBe(text)
    })
  })

  describe('redactForStorage', () => {
    it('replaces secrets with [REDACTED:hash] placeholders', async () => {
      const text = 'password = "ExampleP@ssw0rd12345!"'
      const redacted = await redactForStorage(text)
      expect(redacted).not.toContain('ExampleP@ssw0rd12345!')
      expect(redacted).toMatch(/\[REDACTED:[a-f0-9]{64}\]/)
    })

    it('produces deterministic hashes for the same secret', async () => {
      const text = 'api_key = "sk_live_51Hx9J3ExampleValueForTestingOnly"'
      const a = await redactForStorage(text)
      const b = await redactForStorage(text)
      expect(a).toBe(b)
    })
  })
})
