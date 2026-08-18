export class LRUCache<K, V> extends Map<K, V> {
  constructor(private capacity: number) {
    super()
  }

  get(key: K): V | undefined {
    const value = super.get(key)
    if (value === undefined) {
      return undefined
    }
    // Move to most-recent position.
    super.delete(key)
    super.set(key, value)
    return value
  }

  set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key)
    } else if (super.size >= this.capacity) {
      const oldest = super.keys().next().value
      if (oldest !== undefined) {
        super.delete(oldest)
      }
    }
    super.set(key, value)
    return this
  }
}
