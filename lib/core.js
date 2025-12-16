// 核心业务逻辑 - 平台无关的数据操作

import {
  checkIP,
  checkUUIDFormat,
  checkIPFormat,
  getISOTimeAfterMilliseconds,
  msToIso,
  generateUUID,
} from "./utils.js";

/**
 * 写入数据
 * @param {Object} kvAdapter - KV 适配器实例
 * @param {Object} data - 请求数据
 * @returns {Object} 响应对象
 */
export async function writeData(kvAdapter, data) {
  const {
    data: content,
    password,
    safeIP,
    expiredTime = 7 * 24 * 60 * 60 * 1000,
    uuid,
  } = data;

  if (!content) {
    return {
      code: 400,
      message: "请提供data字段",
    };
  }

  // 检查数据是否超过大小限制
  if (content.length > 1024 * 1024) {
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
  await kvAdapter.set(
    storedUUID,
    {
      data: content,
      ip: safeIP || "*.*.*.*",
      password: password,
      expiredTime: parseInt(expiredTime) + Date.now(),
    },
    {
      px: parseInt(expiredTime),
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
}

/**
 * 读取数据（GET 方式）
 * @param {Object} kvAdapter - KV 适配器实例
 * @param {string} uuid - 数据 UUID
 * @param {string} password - 密码
 * @param {string} ip - 客户端 IP
 * @param {boolean} shouldDelete - 是否读后删除
 * @returns {string|Object} 数据内容或错误对象
 */
export async function readDataByGet(kvAdapter, uuid, password, ip, shouldDelete) {
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

  const storedData = await kvAdapter.get(uuid.toLowerCase());
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
    await kvAdapter.del(uuid);
  }

  return storedData.data;
}

/**
 * 读取数据（POST 方式）
 * @param {Object} kvAdapter - KV 适配器实例
 * @param {Object} data - 请求数据
 * @param {string} ip - 客户端 IP
 * @returns {Object} 响应对象
 */
export async function readData(kvAdapter, data, ip) {
  const { uuid, password, shouldDelete } = data;

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
  const storedData = await kvAdapter.get(uuid.toLowerCase());

  // 如果 UUID 不存在，则返回错误
  if (!storedData) {
    return {
      code: 404,
      message: "未找到数据",
    };
  }

  // 检测IP验证
  if (!checkIP(storedData.ip, ip)) {
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
    await kvAdapter.del(uuid);
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
}

/**
 * 删除数据
 * @param {Object} kvAdapter - KV 适配器实例
 * @param {Object} data - 请求数据
 * @param {string} ip - 客户端 IP
 * @returns {Object} 响应对象
 */
export async function deleteData(kvAdapter, data, ip) {
  const { uuid, password } = data;

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

  const storedData = await kvAdapter.get(uuid.toLowerCase());

  if (!storedData) {
    return {
      code: 404,
      message: "未找到数据",
    };
  }

  // 检测IP验证
  if (!checkIP(storedData.ip, ip)) {
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

  const state = await kvAdapter.del(uuid.toLowerCase());

  return {
    code: state == 1 ? 200 : 400,
    message: `${state == 1 ? "删除成功" : "删除失败"}`,
  };
}

/**
 * 获取服务状态
 * @param {Object} kvAdapter - KV 适配器实例
 * @returns {Object} 服务状态对象
 */
export async function getServiceStatus(kvAdapter) {
  let dbsize = await kvAdapter.dbsize();
  return {
    code: 200,
    message: "服务运行正常",
    version: "1.2.0",
    active: dbsize,
  };
}
