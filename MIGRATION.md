# 数据迁移指南：Vercel KV → Cloudflare KV

本指南将帮助你将数据从 Vercel KV (Redis) 迁移到 Cloudflare KV。

---

## 迁移前准备

### 1. 获取 Vercel KV 凭证

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 进入你的项目
3. 点击 **Storage** 标签
4. 选择你的 KV Store
5. 点击 **Settings** / **.env.local** 标签
6. 复制以下信息：
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

### 2. 获取 Cloudflare 凭证

#### A. Account ID

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 在右侧可以看到你的 **Account ID**

#### B. KV Namespace ID

如果还没有创建 KV 命名空间：

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 KV 命名空间
npx wrangler kv:namespace create "KV_CACHE"
```

输出示例：
```
✨ Success!
Add the following to your configuration file:
{ binding = "KV_CACHE", id = "abc123def456..." }
```

复制 `id` 的值（这就是你的 Namespace ID）。

#### C. API Token

1. 前往 [API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Custom Token** 模板
4. 配置权限：
   - **Account** → **Workers KV Storage** → **Edit**
5. 点击 **Continue to summary**
6. 点击 **Create Token**
7. **立即复制 Token**（只显示一次！）

---

## 🔧 配置迁移脚本

### 1. 安装依赖

```bash
npm install
```

### 2. 创建环境变量文件

复制模板文件：

```bash
cp .env.example .env
```

### 3. 编辑 .env 文件

```bash
# Windows
notepad .env

# Linux/Mac
nano .env
# 或
vim .env
```

填写实际的值：

```env
# Vercel KV 配置
KV_REST_API_URL=https://your-kv-name.kv.vercel-storage.com
KV_REST_API_TOKEN=Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cloudflare 配置
CF_ACCOUNT_ID=1234567890abcdef1234567890abcdef
CF_NAMESPACE_ID=abc123def456ghi789jkl012mno345pq
CF_API_TOKEN=your_cloudflare_api_token_here
```

---

## 运行迁移

### 方式一：使用 npm script（推荐）

```bash
npm run migrate
```

### 方式二：直接运行脚本

```bash
node scripts/migrate.js
```

---

## 迁移过程

脚本会执行以下步骤：

1. **验证环境变量** - 确保所有必需的配置都已设置
2. **连接数据库** - 连接到 Vercel KV 和 Cloudflare KV
3. **扫描数据** - 获取 Vercel KV 中的所有键
4. **批量迁移** - 每批处理 10 条数据（可配置）
5. **保留 TTL** - 自动计算并保留剩余过期时间
6. **错误处理** - 失败重试 3 次（可配置）
7. **生成报告** - 保存迁移统计和错误日志

---

## 📈 输出示例

```
============================================================
  数据迁移工具: Vercel Redis -> Cloudflare KV
============================================================

ℹ 正在连接到 Vercel KV...
✓ Vercel KV 连接成功
ℹ 正在连接到 Cloudflare KV...
✓ Cloudflare KV 连接成功
ℹ 正在扫描 Vercel KV 数据库...

找到 50 条数据

ℹ 处理批次 1/5...
✓ 已迁移: 12345678-1234-1234-1234-123456789abc (TTL: 3600s)
✓ 已迁移: 87654321-4321-4321-4321-cba987654321 (TTL: 永久)
⚠ 跳过已过期数据: expired-uuid
进度: 20.00%

...

============================================================
  迁移完成！
============================================================

ℹ 总数据量: 50
✓ 成功迁移: 48
⚠ 跳过数据: 0
⚠ 已过期: 2
✗ 失败数量: 0
ℹ 总耗时: 5.23s

✓ 迁移报告已保存到: migration-report.json
```

---

## 迁移报告

迁移完成后，会生成两个文件：

### 1. migration-report.json

包含完整的迁移统计：

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "duration": "5.23s",
  "stats": {
    "total": 50,
    "migrated": 48,
    "skipped": 0,
    "expired": 2,
    "failed": 0
  },
  "errors": []
}
```

### 2. migration-errors.json

如果有失败的数据，会记录错误详情：

```json
[
  {
    "key": "problematic-uuid",
    "error": "Cloudflare API Error: 500 - Internal Server Error"
  }
]
```

---

## 配置选项

你可以编辑 `scripts/migrate.js` 来调整迁移参数：

```javascript
const config = {
  batchSize: 10,        // 每批处理的数据量（1-100）
  retryAttempts: 3,     // 失败重试次数
  retryDelay: 1000,     // 重试延迟（毫秒）
};
```

---

## 注意事项

### 1. 数据一致性

- **Cloudflare KV 是最终一致性**：写入后可能需要 60 秒才能在全球传播
- **迁移期间不会删除源数据**：Vercel KV 中的数据保持不变
- **建议在低峰期迁移**：避免影响正在使用的服务

### 2. TTL 处理

- 脚本会自动计算剩余 TTL（过期时间）
- 已过期的数据会被跳过
- TTL 从毫秒转换为秒（向上取整）

### 3. 速率限制

- **Vercel KV**: 无明确限制
- **Cloudflare KV**:
  - 免费计划：1000 写入/天
  - Workers Paid：无限制（收费）

如果你有大量数据，建议：
- 调整 `batchSize` 为较小值（如 5）
- 增加 `retryDelay`（如 2000ms）

### 4. 数据大小限制

- **Vercel KV**: Key 最大 1KB，Value 最大 1MB
- **Cloudflare KV**: Key 最大 512B，Value 最大 25MB

如果 Key 超过 512 字节，迁移会失败。

---

## 故障排查

### 错误：缺少环境变量

```
✗ 缺少必需的环境变量: KV_REST_API_URL, KV_REST_API_TOKEN
```

**解决方案**：检查 `.env` 文件是否存在并正确填写。

---

### 错误：Vercel KV 连接失败

```
✗ 迁移过程中发生错误: Unauthorized
```

**解决方案**：
- 检查 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN` 是否正确
- 确保 Token 没有过期

---

### 错误：Cloudflare API 401

```
Cloudflare API Error: 401 - Unauthorized
```

**解决方案**：
- 检查 `CF_API_TOKEN` 是否正确
- 确保 API Token 有 **Workers KV Storage (Edit)** 权限

---

### 错误：Cloudflare API 404

```
Cloudflare API Error: 404 - Not Found
```

**解决方案**：
- 检查 `CF_ACCOUNT_ID` 是否正确
- 检查 `CF_NAMESPACE_ID` 是否正确
- 确保 KV 命名空间已创建

---

### 错误：Cloudflare API 429

```
Cloudflare API Error: 429 - Too Many Requests
```

**解决方案**：
- 你可能触发了速率限制
- 调整 `batchSize` 为较小值（如 3）
- 增加 `retryDelay`（如 3000ms）
- 考虑升级 Cloudflare 计划

---

## 重新迁移

如果迁移失败或需要重新迁移：

1. **Cloudflare KV 会覆盖同名键**：重复迁移会更新数据
2. **检查错误日志**：查看 `migration-errors.json` 了解失败原因
3. **修复问题后重新运行**：`npm run migrate`

---

## 验证迁移

迁移完成后，验证数据是否正确：

### 1. 检查数据量

**Vercel KV**:
```bash
curl "https://your-vercel-app.vercel.app"
```

**Cloudflare Workers**:
```bash
curl "https://kv-cache.your-subdomain.workers.dev"
```

比较返回的 `active` 数量。

> **注意**：Cloudflare 不支持 `dbsize()`，会返回 `-1`

### 2. 测试读取数据

从迁移报告中选择一个成功迁移的 UUID：

```bash
# Vercel
curl "https://your-vercel-app.vercel.app?uuid=xxx&password=xxx"

# Cloudflare
curl "https://kv-cache.your-subdomain.workers.dev?uuid=xxx&password=xxx"
```

两者应返回相同的数据。

### 3. 测试写入/删除

在 Cloudflare 上测试新数据的写入和删除，确保功能正常。

---

## 安全建议

1. **不要提交 .env 文件到 Git**
   - `.env` 已添加到 `.gitignore`
   - 只提交 `.env.example` 模板

2. **迁移后删除 API Token**
   - 迁移完成后，建议撤销 Cloudflare API Token
   - 前往 API Tokens 页面，点击 **Revoke**

3. **限制 Token 权限**
   - 只授予必需的最小权限
   - 设置 Token 过期时间（如 24 小时）

---

## 获取帮助

如果遇到问题：

1. 检查 `migration-errors.json` 了解详细错误
2. 阅读上面的故障排查部分
3. 提交 Issue 到 [GitHub](https://github.com/RavelloH/kv-cache/issues)

---

## 相关文档

- [Vercel KV 文档](https://vercel.com/docs/storage/vercel-kv)
- [Cloudflare KV 文档](https://developers.cloudflare.com/kv/)
- [Cloudflare API 文档](https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-key-value-pair)
