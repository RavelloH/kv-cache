// KV 数据库适配器 - 统一 Vercel KV 和 Cloudflare KV 的接口

/**
 * Vercel KV 适配器
 */
export class VercelKVAdapter {
  constructor(kvClient) {
    this.kv = kvClient;
  }

  async get(key) {
    return await this.kv.get(key);
  }

  async set(key, value, options = {}) {
    // Vercel KV 使用 px 选项设置过期时间（毫秒）
    return await this.kv.set(key, value, options);
  }

  async del(key) {
    return await this.kv.del(key);
  }

  async dbsize() {
    return await this.kv.dbsize();
  }
}

/**
 * Cloudflare KV 适配器
 */
export class CloudflareKVAdapter {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
  }

  async get(key) {
    const value = await this.kv.get(key, { type: "json" });
    return value;
  }

  async set(key, value, options = {}) {
    // Cloudflare KV 使用 expirationTtl 设置过期时间（秒）
    const cfOptions = {};
    if (options.px) {
      // 将毫秒转换为秒
      cfOptions.expirationTtl = Math.floor(options.px / 1000);
    }
    await this.kv.put(key, JSON.stringify(value), cfOptions);
    return "OK";
  }

  async del(key) {
    await this.kv.delete(key);
    // Cloudflare KV 的 delete 方法不返回删除计数，我们假设成功删除返回 1
    return 1;
  }

  async dbsize() {
    // Cloudflare KV 不支持 dbsize 操作
    // 返回 -1 表示不可用
    return -1;
  }
}
