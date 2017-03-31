export class CacheAdapter {
  /**
   * Get a value in the cache
   * @param key Cache key to get
   * @return Promise that will eventually resolve to the value in the cache.
   */
  get(key) {}

  /**
   * Get values in the cache
   * @param keys Cache key to get
   * @return Promise that will eventually resolve to the values in the cache.
   */
  getMany(keys) {}

  /**
   * Set a value in the cache
   * @param key Cache key to set
   * @param value Value to set the key
   * @param ttl Optional TTL
   */
  put(key, value, ttl) {}

  /**
   * Set values in the cache
   * @param items Items to set in the cache
   * @param ttl Optional TTL
   */
  putMany(items, ttl) {}

  /**
   * Remove a value from the cache.
   * @param key Cache key to remove
   */
  del(key) {}

  /**
   * Empty a cache
   */
  clear() {}
}
