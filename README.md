# kv-cache
基于api进行操作的缓存系统，支持 Vercel 和 Cloudflare Workers 部署

## 部署

### 方式一：Vercel 部署（一键部署）

可以使用Vercel一键部署。
转到你的Vercel，在此页面中创建一个KV Database. [vercel/stores](https://vercel.com/dashboard/stores)
尽量选择离你更近的服务地区，名称随意。如果切换了服务地区，你可稍后在下方的部署按钮部署结束后，在项目设置中更改你的项目serverless地区为服务器所在地区以提高性能。
转到你的数据库页面，切换至`.env.local`，如图。记录如下两项的值:
- `KV_REST_API_TOKEN`
- `KV_REST_API_URL`
![Screenshot_20231118_232043](https://github.com/RavelloH/kv-cache/assets/68409330/31f676d0-d5be-4897-a696-bebdebf2b815)

之后，单击下方部署按钮，填入上方值即可一键部署。
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRavelloH%2Fkv-cache&env=KV_REST_API_TOKEN,KV_REST_API_URL&demo-title=kv-cache&demo-url=https%3A%2F%2Fcache.ravelloh.top)

### 方式二：Cloudflare Workers 部署

#### 1. 安装依赖

```bash
npm install
```

#### 2. 登录 Cloudflare

```bash
npx wrangler login
```

浏览器会打开授权页面，登录你的 Cloudflare 账户并授权。

#### 3. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create "KV_CACHE"
```

你会看到类似输出：

```
✨ Success!
Add the following to your configuration file:
{ binding = "KV_CACHE", id = "abc123def456..." }
```

复制 `id` 的值。

#### 4. 配置 wrangler.toml

编辑项目根目录的 `wrangler.toml` 文件，将第 10 行的 `your_kv_namespace_id_here` 替换为上一步获得的 ID：

```toml
[[kv_namespaces]]
binding = "KV_CACHE"
id = "your_actual_kv_namespace_id"  # 替换这里
```

#### 5. 部署到 Cloudflare

```bash
npm run deploy:cloudflare
```

部署成功后会显示你的 Worker URL：

```
Published kv-cache (1.23 sec)
  https://kv-cache.your-subdomain.workers.dev
```

现在你可以通过这个 URL 访问你的缓存 API 了！

#### 6. 本地开发（可选）

```bash
npm run dev:cloudflare
```

本地开发服务器会在 `http://localhost:8787` 启动。

### 详细部署文档

更多部署选项和配置，请参考：
- [完整部署指南](./DEPLOYMENT.md)
- [数据迁移文档](./MIGRATION.md)

## 数据迁移

如果你已经在 Vercel 上有数据，想要迁移到 Cloudflare，可以使用内置的迁移脚本。

### 迁移步骤

#### 1. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下信息：

```env
# Vercel KV 配置（从 Vercel Dashboard > Storage > KV > Settings 获取）
KV_REST_API_URL=https://your-kv-name.kv.vercel-storage.com
KV_REST_API_TOKEN=your_vercel_kv_token

# Cloudflare 配置
CF_ACCOUNT_ID=your_account_id          # Cloudflare Dashboard 右侧可见
CF_NAMESPACE_ID=your_namespace_id      # 运行 wrangler kv:namespace create 后获取
CF_API_TOKEN=your_api_token            # 创建 API Token（需要 Workers KV Storage 编辑权限）
```

#### 2. 获取 Cloudflare API Token

1. 访问 [Cloudflare API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Custom Token**
4. 配置权限：**Account** → **Workers KV Storage** → **Edit**
5. 创建并复制 Token

#### 3. 运行迁移

```bash
npm run migrate
```

迁移脚本会：
- 扫描 Vercel KV 中的所有数据
- 自动保留剩余过期时间
- 批量迁移到 Cloudflare KV
- 生成详细的迁移报告

#### 4. 查看迁移报告

迁移完成后会生成 `migration-report.json` 文件，包含：
- 总数据量
- 成功迁移数量
- 跳过/失败数量
- 错误详情（如有）

### 详细迁移文档

完整的迁移指南请参考：[MIGRATION.md](./MIGRATION.md)

## API使用说明

此API提供了数据的读写和删除功能。请求方法包括POST和GET。

### 写入数据

- 请求方法：POST
- 请求路径：`/api?mode=set`或`/set`
- 请求参数：
  - data：要存储的数据（必选）
  - password：访问数据时的密码（可选）
  - safeIP：允许访问数据的IP地址范围（可选，示例：1.2-3.*.4）
  - expiredTime：数据过期时间（可选，默认为7天）
  - uuid：数据的唯一标识（可选，如果不提供则自动生成，输入已存在的uuid可覆盖原数据）

### 读取数据

> 请求数据有两种方法，可以以POST的方式请求，返回json格式的数据，或者以GET的方式请求，返回文本格式的数据

- 请求方法：POST
- 请求路径：`/api?mode=get`或`/get`
- 请求参数：
  - uuid：要读取的数据的唯一标识（必选）
  - password：访问数据时的密码（可选）
  - shouldDelete：是否在读取数据后删除数据（可选，默认为false）

- 请求方法：GET
- 请求路径：`/api` 或  `/`
- 查询参数：
  - uuid：要读取的数据的唯一标识（必选）
  - password：访问数据时的密码（可选）
  - shouldDelete：是否在读取数据后删除数据（可选，默认为false）
- 例子：`https://cache.ravelloh.top/?uuid=xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx&password=123456&shouldDelete=true`

### 删除数据

- 请求方法：POST
- 请求路径：`/api?mode=del`或`/del`
- 请求参数：
  - uuid：要删除的数据的唯一标识（必选）

### 检查服务状态

- 请求方法：GET
- 请求路径：`/api`
- 响应参数：
  - code：状态码（200表示正常）
  - message：状态信息
  - version：API版本号
  - active：当前活动的数据数量

## 浏览器fetch请求示例

写入数据：

```javascript
fetch('https://cache.ravelloh.top/api?mode=set', {
  method: 'POST',
  headers: {
        'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    data: 'Hello, World!',
    password: '123456',
    safeIP: '*.*.*.*',
    expiredTime: 24 * 60 * 60 * 1000,
    uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  })
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

读取数据：

```javascript
fetch('https://cache.ravelloh.top/api?mode=get', {
  method: 'POST',
  headers: {
        'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
    password: '123456',
    shouldDelete: false
  })
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

删除数据：

```javascript
fetch('https://cache.ravelloh.top/api?mode=del', {
  method: 'POST',
  headers: {
        'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  })
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

## 提醒信息

- 数据大小超过1MB的限制会返回错误。
- 密码长度超过128的限制会返回错误。
- IP规则不正确会返回错误，正确示例为：1.2-3.*.4。
- UUID格式错误会自动生成。
- 读取数据时，如果访问IP与存储数据的IP不匹配，会返回无权限错误。
- 读取数据时，如果提供的密码与存储数据的密码不匹配，会返回无效密码错误。
- 删除数据时，如果提供的UUID不存在，会返回删除失败错误。
