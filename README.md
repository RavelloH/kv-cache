# kv-cache
基于api进行操作的缓存系统

## 部署  

可以使用Vercel一键部署。  
转到你的Vercel，在此页面中创建一个KV Database. [vercel/stores](https://vercel.com/dashboard/stores)  
尽量选择离你更近的服务地区，名称随意。如果切换了服务地区，你可稍后在下方的部署按钮部署结束后，在项目设置中更改你的项目serverless地区为服务器所在地区以提高性能。  
转到你的数据库页面，切换至`.env.local`，如图。记录如下两项的值:  
- `KV_REST_API_TOKEN`
- `KV_REST_API_URL`
![Screenshot_20231118_232043](https://github.com/RavelloH/kv-cache/assets/68409330/31f676d0-d5be-4897-a696-bebdebf2b815)

之后，单击下方部署按钮，填入上方值即可一键部署。  
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRavelloH%2Fkv-cache&env=KV_REST_API_TOKEN,KV_REST_API_URL&demo-title=kv-cache&demo-url=https%3A%2F%2Fcache.ravelloh.top)

## API使用说明

此API提供了数据的读写和删除功能。请求方法包括POST和GET。

### 写入数据

- 请求方法：POST
- 请求路径：`/api?mode=set`
- 请求参数：
  - data：要存储的数据（必选）
  - password：访问数据时的密码（可选）
  - safeIP：允许访问数据的IP地址范围（可选，示例：1.2-3.*.4）
  - expiredTime：数据过期时间（可选，默认为7天）
  - uuid：数据的唯一标识（可选，如果不提供则自动生成，输入已存在的uuid可覆盖原数据）

### 读取数据

- 请求方法：POST
- 请求路径：`/api?mode=get`
- 请求参数：
  - uuid：要读取的数据的唯一标识（必选）
  - password：访问数据时的密码（可选）
  - shouldDelete：是否在读取数据后删除数据（可选，默认为false）

### 删除数据

- 请求方法：POST
- 请求路径：`/api?mode=del`
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
