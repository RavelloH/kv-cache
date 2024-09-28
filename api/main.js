import { kv } from "@vercel/kv";

// 检查IP是否符合
function checkIP(safeIP, realIP) {
  const ipParts = realIP.split(".");
  const safeIPParts = safeIP.split(".");

  for (let i = 0; i < 4; i++) {
    if (safeIPParts[i] === "*") {
      continue;
    } else if (safeIPParts[i].includes("-")) {
      const range = safeIPParts[i].split("-");
      const start = parseInt(range[0]);
      const end = parseInt(range[1]);
      const ipPart = parseInt(ipParts[i]);
      if (ipPart < start || ipPart > end) {
        return false;
      }
    } else if (safeIPParts[i] !== ipParts[i]) {
      return false;
    }
  }

  return true;
}

// 检查uuid有效性
function checkUUIDFormat(uuid) {
  const pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return pattern.test(uuid);
}

// 检查IP格式有效性
function checkIPFormat(ip) {
  const pattern = /^(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)$/;
  if (!pattern.test(ip)) {
    return false;
  }
  const segments = ip.split(".");
  for (let segment of segments) {
    if (segment !== "*" && (parseInt(segment) < 0 || parseInt(segment) > 255)) {
      return false;
    }
  }

  return true;
}

// 时间戳转换
function getISOTimeAfterMilliseconds(x) {
  // x是字符串，转数字
  x = parseInt(x);
  let currentTime = new Date().getTime();
  let newTime = currentTime + x;
  return new Date(newTime).toISOString();
}

// 写入数据
const writeData = async (req) => {
  const {
    data,
    password,
    safeIP,
    expiredTime = 7 * 24 * 60 * 60 * 1000,
    uuid,
  } = req.body;

  if (!data) {
    return {
      code: 400,
      message: "请提供data字段",
    };
  }

  // 检查数据是否超过大小限制
  if (data.length > 1024 * 1024) {
    return {
      code: 400,
      message: "数据大小超过 1MB 的限制",
    };
  }

  // 检查密码长度是否超出限制
  if (password) {
    if (password.length > 128) {
      return {
        code: 400,
        message: "密码大小超过 128 的限制",
      };
    }
  }

  // 检查IP规则是否正确
  if (safeIP) {
    if (!checkIPFormat(safeIP)) {
      return {
        code: 400,
        message: "IP规则不正确，有效示例: 1.2-3.*.4",
      };
    }
  }

  // 存储到 KV 缓存中
  const storedUUID = checkUUIDFormat(uuid || "")
    ? uuid.toLowerCase()
    : generateUUID().toLowerCase();
  await kv.set(
    storedUUID,
    {
      data: data,
      ip: safeIP || "*.*.*.*",
      password: password,
      expiredTime: expiredTime+Date.now() % 1000,
    },
    {
      px: expiredTime,
    }
  );

  return {
    code: 200,
    message: "数据成功存储",
    uuid: storedUUID,
    expiredAt: getISOTimeAfterMilliseconds(expiredTime),
    password: password,
    safeIP: safeIP || "*.*.*.*",
  };
};

// 读取数据
const readDataByGet = async (uuid, password, ip, shouldDelete) => {
  if (!uuid) {
    return {
      code: 400,
      message: "请提供查询的uuid",
    };
  }

  if (!checkUUIDFormat(uuid)) {
    return {
      code: 400,
      message: "uuid格式错误",
    };
  }
  const storedData = await kv.get(uuid.toLowerCase());
  if (!storedData) {
    return {
      code: 404,
      message: "未找到数据",
    };
  }
  if (!checkIP(storedData.ip, ip)) {
    return {
      code: 403,
      message: "当前访问IP无此数据的访问权限",
    };
  }
  if (storedData.password) {
    if (password !== storedData.password) {
      return {
        code: 401,
        message: "无效的密码",
      };
    }
  }
  if (shouldDelete) {
    await kv.del(uuid);
  }
  return storedData.data;
};

const readData = async (req) => {
  const { uuid, password, shouldDelete } = req.body;

  if (!uuid) {
    return {
      code: 400,
      message: "请提供查询的uuid",
    };
  }

  if (!checkUUIDFormat(uuid)) {
    return {
      code: 400,
      message: "uuid格式错误",
    };
  }

  // 检查 UUID 是否存在于 KV 缓存中
  const storedData = await kv.get(uuid.toLowerCase());

  // 如果 UUID 不存在，则返回错误
  if (!storedData) {
    return {
      code: 404,
      message: "未找到数据",
    };
  }

  // 检测IP验证
  if (
    !checkIP(
      storedData.ip,
      req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"] ||
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress
    )
  ) {
    return {
      code: 403,
      message: "当前访问IP无此数据的访问权限",
    };
  }

  // 检查是否需要密码，并验证密码是否与存储的密码匹配
  if (storedData.password) {
    if (password !== storedData.password) {
      return {
        code: 401,
        message: "无效的密码",
      };
    }
  }

  // 如果设置了删除标志，从 KV 缓存中删除数据
  if (shouldDelete) {
    await kv.del(uuid);
  }

  return {
    code: 200,
    message: `查询成功${shouldDelete ? ",已删除此记录" : ""}`,
    data: storedData.data,
    uuid: uuid,
    expiredAt: msToIso(storedData.expiredTime),
    password: storedData.password,
    safeIP: storedData.ip,
  };
};

function msToIso(timestamp) {
  timestamp = parseInt(timestamp);
  const date = new Date(timestamp);
  const iso = date.toISOString();
  return iso;
}

// 删除数据
const deleteData = async (req) => {
  const { uuid } = req.body;

  if (!uuid) {
    return {
      code: 400,
      message: "请提供删除的uuid",
    };
  }

  if (!checkUUIDFormat(uuid)) {
    return {
      code: 400,
      message: "uuid格式错误",
    };
  }
  const storedData = await kv.get(uuid.toLowerCase());

  if (!storedData) {
    return {
      code: 404,
      message: "未找到数据",
    };
  }

  // 检测IP验证
  if (
    !checkIP(
      storedData.ip,
      req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"] ||
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress
    )
  ) {
    return {
      code: 403,
      message: "当前访问IP无此数据的访问权限",
    };
  }

  // 验证密码保护
  if (storedData.password) {
    if (password !== storedData.password) {
      return {
        code: 401,
        message: "无效的密码",
      };
    }
  }

  const state = await kv.del(uuid.toLowerCase());

  return {
    code: state == 1 ? 200 : 400,
    message: `${state == 1 ? "删除成功" : "删除失败"}`,
  };
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
export default async function handler(req, res) {
  try {
    // 检查请求方法
    if (req.method === "POST") {
      if (req.query.mode == "set") {
        const response = await writeData(req);
        res.status(response.code).json(response);
      } else if (req.query.mode == "get") {
        const response = await readData(req);
        res.status(response.code).json(response);
      } else if (req.query.mode == "del") {
        const response = await deleteData(req);
        res.status(response.code).json(response);
      } else {
        res.status(400).json({
          code: 400,
          message: "无效的请求模式",
        });
      }
    } else if (req.method === "GET") {
      if (req.query.uuid) {
        // get查询模式
        res
          .status(200)
          .send(
            await readDataByGet(
              req.query.uuid,
              req.query.password || "",
              req.headers["x-real-ip"] ||
                req.headers["x-forwarded-for"] ||
                req.ip ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                req.connection.socket.remoteAddress,
              req.query.shouldDelete == "true" ? true : false
            )
          );
      } else {
        let dbsize = await kv.dbsize();
        res.status(200).json({
          code: 200,
          message: "服务运行正常",
          version: "1.1.0",
          active: dbsize,
        });
      }
    } else if (req.method === "OPTIONS") {
      res.status(200).json({
        code: 200,
      });
    } else {
      res.status(405).json({
        code: 405,
        message: "不允许的请求方式",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      code: 500,
      message: "内部服务器错误",
      error: error,
    });
  }
}
