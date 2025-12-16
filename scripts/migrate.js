#!/usr/bin/env node

/**
 * 数据迁移脚本：Vercel Redis -> Cloudflare KV
 *
 * 用途：将 Vercel KV (Redis) 中的所有数据迁移到 Cloudflare KV
 *
 * 使用方法：
 *   node scripts/migrate.js
 *
 * 环境变量要求：
 *   - KV_REST_API_URL: Vercel KV REST API URL
 *   - KV_REST_API_TOKEN: Vercel KV REST API Token
 *   - CF_ACCOUNT_ID: Cloudflare Account ID
 *   - CF_NAMESPACE_ID: Cloudflare KV Namespace ID
 *   - CF_API_TOKEN: Cloudflare API Token
 */

import { createClient } from "@vercel/kv";
import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

// 加载 .env 文件
loadEnv();

// 配置
const config = {
  vercel: {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  },
  cloudflare: {
    accountId: process.env.CF_ACCOUNT_ID,
    namespaceId: process.env.CF_NAMESPACE_ID,
    apiToken: process.env.CF_API_TOKEN,
  },
  batchSize: 10, // 每批处理的数据量
  retryAttempts: 3, // 失败重试次数
  retryDelay: 1000, // 重试延迟（毫秒）
};

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.cyan);
}

// 验证环境变量
function validateConfig() {
  const required = [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "CF_ACCOUNT_ID",
    "CF_NAMESPACE_ID",
    "CF_API_TOKEN",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logError(`缺少必需的环境变量: ${missing.join(", ")}`);
    logInfo("请创建 .env 文件并设置所有必需的环境变量");
    process.exit(1);
  }
}

// Cloudflare KV API 封装
class CloudflareKV {
  constructor(accountId, namespaceId, apiToken) {
    this.accountId = accountId;
    this.namespaceId = namespaceId;
    this.apiToken = apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
  }

  async put(key, value, expirationTtl = null) {
    const url = `${this.baseUrl}/values/${encodeURIComponent(key)}`;
    const body = typeof value === "string" ? value : JSON.stringify(value);

    const options = {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body,
    };

    // 添加过期时间参数
    if (expirationTtl && expirationTtl > 0) {
      const urlWithTtl = `${url}?expiration_ttl=${expirationTtl}`;
      const response = await fetch(urlWithTtl, options);
      return this.handleResponse(response);
    }

    const response = await fetch(url, options);
    return this.handleResponse(response);
  }

  async handleResponse(response) {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare API Error: ${response.status} - ${error}`);
    }
    return await response.json();
  }
}

// 计算剩余 TTL（秒）
function calculateTTL(expiredTime) {
  if (!expiredTime) return null;

  const now = Date.now();
  const expiredTimestamp = parseInt(expiredTime);

  if (expiredTimestamp <= now) {
    return 0; // 已过期
  }

  // 转换为秒，向上取整
  return Math.ceil((expiredTimestamp - now) / 1000);
}

// 重试逻辑
async function retry(fn, attempts = 3, delay = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) throw error;
      logWarning(`重试 ${i + 1}/${attempts}...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// 迁移单个键值对
async function migrateKey(vercelKV, cloudflareKV, key, stats) {
  try {
    // 从 Vercel KV 读取数据
    const data = await vercelKV.get(key);

    if (!data) {
      logWarning(`跳过空数据: ${key}`);
      stats.skipped++;
      return;
    }

    // 计算剩余 TTL
    const ttl = calculateTTL(data.expiredTime);

    if (ttl === 0) {
      logWarning(`跳过已过期数据: ${key}`);
      stats.expired++;
      return;
    }

    // 写入到 Cloudflare KV
    await retry(
      () => cloudflareKV.put(key, data, ttl),
      config.retryAttempts,
      config.retryDelay
    );

    stats.migrated++;
    logSuccess(`已迁移: ${key} (TTL: ${ttl ? ttl + "s" : "永久"})`);
  } catch (error) {
    stats.failed++;
    logError(`迁移失败: ${key} - ${error.message}`);
    stats.errors.push({ key, error: error.message });
  }
}

// 获取所有键（Vercel KV 没有直接的 keys() 方法，需要使用 scan）
async function getAllKeys(vercelKV) {
  const keys = [];
  let cursor = 0;

  logInfo("正在扫描 Vercel KV 数据库...");

  do {
    try {
      // 使用 scan 方法扫描键
      const result = await vercelKV.scan(cursor, { count: 100 });

      if (Array.isArray(result)) {
        // 格式: [cursor, keys]
        cursor = result[0];
        const batchKeys = result[1] || [];
        keys.push(...batchKeys);
      } else {
        break;
      }
    } catch (error) {
      logError(`扫描失败: ${error.message}`);
      break;
    }
  } while (cursor !== 0);

  return keys;
}

// 主迁移函数
async function migrate() {
  log("\n" + "=".repeat(60), colors.bright);
  log("  数据迁移工具: Vercel Redis -> Cloudflare KV", colors.bright);
  log("=".repeat(60) + "\n", colors.bright);

  // 验证配置
  validateConfig();

  // 统计信息
  const stats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    expired: 0,
    failed: 0,
    errors: [],
    startTime: Date.now(),
  };

  try {
    // 初始化客户端
    logInfo("正在连接到 Vercel KV...");
    const vercelKV = createClient({
      url: config.vercel.url,
      token: config.vercel.token,
    });
    logSuccess("Vercel KV 连接成功");

    logInfo("正在连接到 Cloudflare KV...");
    const cloudflareKV = new CloudflareKV(
      config.cloudflare.accountId,
      config.cloudflare.namespaceId,
      config.cloudflare.apiToken
    );
    logSuccess("Cloudflare KV 连接成功");

    // 获取所有键
    const keys = await getAllKeys(vercelKV);
    stats.total = keys.length;

    if (stats.total === 0) {
      logWarning("Vercel KV 中没有数据需要迁移");
      return;
    }

    log(`\n找到 ${stats.total} 条数据\n`, colors.bright);

    // 分批处理
    for (let i = 0; i < keys.length; i += config.batchSize) {
      const batch = keys.slice(i, i + config.batchSize);
      const batchNum = Math.floor(i / config.batchSize) + 1;
      const totalBatches = Math.ceil(keys.length / config.batchSize);

      logInfo(`\n处理批次 ${batchNum}/${totalBatches}...`);

      // 并发处理批次中的键
      await Promise.all(
        batch.map((key) => migrateKey(vercelKV, cloudflareKV, key, stats))
      );

      // 进度显示
      const progress = ((i + batch.length) / keys.length * 100).toFixed(2);
      log(`进度: ${progress}%`, colors.blue);
    }

    // 计算耗时
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);

    // 显示统计信息
    log("\n" + "=".repeat(60), colors.bright);
    log("  迁移完成！", colors.bright);
    log("=".repeat(60) + "\n", colors.bright);

    logInfo(`总数据量: ${stats.total}`);
    logSuccess(`成功迁移: ${stats.migrated}`);
    logWarning(`跳过数据: ${stats.skipped}`);
    logWarning(`已过期: ${stats.expired}`);
    logError(`失败数量: ${stats.failed}`);
    logInfo(`总耗时: ${duration}s`);

    // 保存错误日志
    if (stats.errors.length > 0) {
      const errorLogPath = path.join(process.cwd(), "migration-errors.json");
      fs.writeFileSync(errorLogPath, JSON.stringify(stats.errors, null, 2));
      logWarning(`\n错误详情已保存到: ${errorLogPath}`);
    }

    // 保存迁移报告
    const reportPath = path.join(process.cwd(), "migration-report.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          duration: `${duration}s`,
          stats: {
            total: stats.total,
            migrated: stats.migrated,
            skipped: stats.skipped,
            expired: stats.expired,
            failed: stats.failed,
          },
          errors: stats.errors,
        },
        null,
        2
      )
    );
    logSuccess(`迁移报告已保存到: ${reportPath}\n`);

  } catch (error) {
    logError(`\n迁移过程中发生错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行迁移
migrate().catch((error) => {
  logError(`未捕获的错误: ${error.message}`);
  console.error(error);
  process.exit(1);
});
