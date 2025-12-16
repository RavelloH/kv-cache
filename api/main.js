import { kv } from "@vercel/kv";
import { VercelKVAdapter } from "../lib/kv-adapter.js";
import {
  writeData as coreWriteData,
  readData as coreReadData,
  readDataByGet as coreReadDataByGet,
  deleteData as coreDeleteData,
  getServiceStatus,
} from "../lib/core.js";

// 创建 Vercel KV 适配器实例
const kvAdapter = new VercelKVAdapter(kv);

// 获取客户端 IP 地址
function getClientIP(req) {
  return (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    "0.0.0.0"
  );
}

// 写入数据
const writeData = async (req) => {
  return await coreWriteData(kvAdapter, req.body);
};

// 读取数据（GET 方式）
const readDataByGet = async (uuid, password, ip, shouldDelete) => {
  return await coreReadDataByGet(kvAdapter, uuid, password, ip, shouldDelete);
};

// 读取数据（POST 方式）
const readData = async (req) => {
  const ip = getClientIP(req);
  return await coreReadData(kvAdapter, req.body, ip);
};

// 删除数据
const deleteData = async (req) => {
  const ip = getClientIP(req);
  return await coreDeleteData(kvAdapter, req.body, ip);
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
        res.setHeader("Content-Type", 
          req.query.type ? "text/"+req.query.type : "text/plain"
        );
        res
          .status(200)
          .send(
            await readDataByGet(
              req.query.uuid,
              req.query.password || "",
              getClientIP(req),
              req.query.shouldDelete == "true" ? true : false
            )
          );
      } else {
        const status = await getServiceStatus(kvAdapter);
        res.status(200).json(status);
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
