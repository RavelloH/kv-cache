// 通用工具函数

// 检查IP是否符合
export function checkIP(safeIP, realIP) {
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
export function checkUUIDFormat(uuid) {
  const pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return pattern.test(uuid);
}

// 检查IP格式有效性
export function checkIPFormat(ip) {
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
export function getISOTimeAfterMilliseconds(x) {
  // x是字符串，转数字
  x = parseInt(x);
  let currentTime = new Date().getTime();
  let newTime = currentTime + x;
  return new Date(newTime).toISOString();
}

// 毫秒时间戳转ISO字符串
export function msToIso(timestamp) {
  timestamp = parseInt(timestamp);
  const date = new Date(timestamp);
  const iso = date.toISOString();
  return iso;
}

// 生成随机 UUID
export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
