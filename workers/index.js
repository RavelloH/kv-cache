// Cloudflare Workers 入口文件

import { CloudflareKVAdapter } from "../lib/kv-adapter.js";
import {
  writeData as coreWriteData,
  readData as coreReadData,
  readDataByGet as coreReadDataByGet,
  deleteData as coreDeleteData,
  getServiceStatus,
} from "../lib/core.js";

// 获取客户端 IP 地址
function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

// 解析 JSON 请求体
async function parseJSONBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

// 创建 JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

// 创建文本响应
function textResponse(data, status = 200, contentType = "text/plain") {
  return new Response(data, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // 创建 Cloudflare KV 适配器实例
    const kvAdapter = new CloudflareKVAdapter(env.KV_CACHE);

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const method = request.method;

    try {
      // 处理 OPTIONS 请求（CORS 预检）
      if (method === "OPTIONS") {
        return jsonResponse({ code: 200 });
      }

      // 处理 POST 请求
      if (method === "POST") {
        const body = await parseJSONBody(request);

        if (!body) {
          return jsonResponse({
            code: 400,
            message: "无效的 JSON 请求体",
          }, 400);
        }

        // 写入数据
        if (mode === "set") {
          const response = await coreWriteData(kvAdapter, body);
          return jsonResponse(response, response.code);
        }

        // 读取数据
        if (mode === "get") {
          const ip = getClientIP(request);
          const response = await coreReadData(kvAdapter, body, ip);
          return jsonResponse(response, response.code);
        }

        // 删除数据
        if (mode === "del") {
          const ip = getClientIP(request);
          const response = await coreDeleteData(kvAdapter, body, ip);
          return jsonResponse(response, response.code);
        }

        return jsonResponse({
          code: 400,
          message: "无效的请求模式",
        }, 400);
      }

      // 处理 GET 请求
      if (method === "GET") {
        const uuid = url.searchParams.get("uuid");

        // 如果有 uuid，执行数据查询
        if (uuid) {
          const password = url.searchParams.get("password") || "";
          const shouldDelete = url.searchParams.get("shouldDelete") === "true";
          const type = url.searchParams.get("type");
          const ip = getClientIP(request);

          const result = await coreReadDataByGet(
            kvAdapter,
            uuid,
            password,
            ip,
            shouldDelete
          );

          // 如果返回的是错误对象，返回 JSON
          if (typeof result === "object" && result.code) {
            return jsonResponse(result, result.code);
          }

          // 否则返回原始数据
          const contentType = type ? `text/${type}` : "text/plain";
          return textResponse(result, 200, contentType);
        }

        // 返回服务状态
        const status = await getServiceStatus(kvAdapter);
        return jsonResponse(status);
      }

      // 不支持的请求方法
      return jsonResponse({
        code: 405,
        message: "不允许的请求方式",
      }, 405);

    } catch (error) {
      console.error(error);
      return jsonResponse({
        code: 500,
        message: "内部服务器错误",
        error: error.message,
      }, 500);
    }
  },
};
