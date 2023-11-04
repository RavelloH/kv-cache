// 导入所需的库
const { createClient } = require("@vercel/ncc");
const { KVNamespace } = require("@vercel/client");

// 初始化 KV 缓存命名空间
const kvCacheNamespace = new KVNamespace("my-cache-namespace");

// 验证 IP 地址
const verifyIP = async (req, ip) => {
  // 从 KV 缓存中获取存储的 IP 地址
  const storedIP = await kvCacheNamespace.get("ip");

  // 如果未找到存储的 IP 地址或与当前 IP 不匹配，则返回 false
  if (!storedIP || storedIP !== ip) {
    return false;
  }

  return true;
};

// 写入数据到 KV 缓存
const writeData = async (req) => {
  const { data, verifyIP = false, password, safeIP, expiredTime = 7 * 24 * 60 * 60 * 1000, uuid } = req.body;

  // 检查数据是否超过大小限制
  if (data.length > 1024 * 1024) {
    return { code: 400, message: "数据大小超过 1MB 的限制" };
  }

  // 检查是否启用了 IP 验证
  if (verifyIP) {
    const isVerified = await verifyIP(req, req.headers["x-real-ip"]);

    // 如果 IP 验证失败，则返回错误
    if (!isVerified) {
      return { code: 401, message: "未授权的 IP 地址" };
    }
  }

  // 将 IP 地址存储到 KV 缓存中
  await kvCacheNamespace.put("ip", req.headers["x-real-ip"]);

  // 使用指定的 UUID 或随机生成的 UUID 将数据存储到 KV 缓存中
  const storedUUID = uuid || generateUUID();
  await kvCacheNamespace.put(storedUUID, data, { expirationTtl: expiredTime });

  // 获取性能信息和数据库剩余空间
  const performance = await kvCacheNamespace.performance();
  const remainingSpace = performance.remainingPercentage;

  return { code: 200, message: "数据成功存储", uuid: storedUUID, performance, remainingSpace };
};

// 从 KV 缓存中读取数据
const readData = async (req) => {
  const { uuid, password, delete: shouldDelete } = req.body;

  // 检查 UUID 是否存在于 KV 缓存中
  const storedData = await kvCacheNamespace.get(uuid);

  // 如果 UUID 不存在，则返回错误
  if (!storedData) {
    return { code: 404, message: "未找到数据" };
  }

  // 检查是否需要密码，并验证密码是否与存储的密码匹配
  if (password && password !== storedData.password) {
    return { code: 401, message: "无效的密码" };
  }

  // 如果设置了删除标志，从 KV 缓存中删除数据
  if (shouldDelete) {
    await kvCacheNamespace.delete(uuid);
  }

  // 获取性能信息和数据库剩余空间
  const performance = await kvCacheNamespace.performance();
  const remainingSpace = performance.remainingPercentage;

  return { code: 200, message: "成功检索到数据", data: storedData, performance, remainingSpace };
};

// 生成随机 UUID
const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
        v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 处理 API 请求
module.exports = async (req, res) => {
  try {
    // 检查请求方法
    if (req.method === "POST") {
      // 检查 API 端点
      if (req.url === "/api/write") {
        const response = await writeData(req);
        res.status(response.code).json(response);
      } else if (req.url === "/api/get") {
        const response = await readData(req);
        res.status(response.code).json(response);
      } else {
        res.status(404).json({ code: 404, message: "API 端点未找到" });
      }
    } else {
      res.status(405).json({ code: 405, message: "不允许的请求方法" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: "内部服务器错误" });
  }
};
