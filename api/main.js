import {
    kv
} from '@vercel/kv';

// 检查IP是否符合
function checkIP(safeIP, realIP) {
    if (safeIP.includes('-')) {
        const rangePattern = safeIP.replace(/\./g, '\\.').replace(/(\d+)-(\d+)/, function(match, start, end) {
            start = parseInt(start);
            end = parseInt(end);
            return '(' + Array.from({
                length: end - start + 1
            }, (_, i) => start + i).join('|') + ')';
        });
        const regex = new RegExp('^' + rangePattern + '$');
        return regex.test(realIP);
    } else {
        const pattern = safeIP.replace(/\*/g, '\\d{1,3}');
        const regex = new RegExp('^' + pattern + '$');
        return regex.test(realIP);
    }
}

// 检查uuid有效性
function checkUUIDFormat(uuid) {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return pattern.test(uuid);
}

// 检查IP格式有效性
function checkIPFormat(ip) {
    const pattern = /^(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)$/;
    if (!pattern.test(ip)) {
        return false;
    }
    const segments = ip.split('.');
    for (let segment of segments) {
        if (segment !== '*' && (parseInt(segment) < 0 || parseInt(segment) > 255)) {
            return false;
        }
    }

    return true;
}

// 时间戳转换
function getISOTimeAfterMilliseconds(x) {
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
        uuid
    } = req.body;

    if (!data) {
        return {
            code: 400,
            message: "请提供data字段"
        };
    }

    // 检查数据是否超过大小限制
    if (data.length > 1024 * 1024) {
        return {
            code: 400,
            message: "数据大小超过 1MB 的限制"
        };
    }

    // 检查密码长度是否超出限制
    if (password) {
        if (password.length > 128) {
            return {
                code: 400,
                message: "密码大小超过 128 的限制"
            };
        }
    }

    // 检查IP规则是否正确
    if (safeIP) {
        if (!checkIPFormat(safeIP)) {
            return {
                code: 400,
                message: "IP规则不正确，有效示例: 1.2-3.*.4"
            }
        }
    }

    // 存储到 KV 缓存中
    const storedUUID = checkUUIDFormat(uuid || '') ? uuid: generateUUID();
    await kv.set(storedUUID, {
        data: data,
        ip: safeIP || '*.*.*.*',
        password: password
    }, {
        px: expiredTime
    });

    return {
        code: 200,
        message: "数据成功存储",
        uuid: storedUUID,
        expiredAt: getISOTimeAfterMilliseconds(expiredTime),
        password: password,
        safeIP: safeIP || '*.*.*.*'
    };
};

// 读取数据
const readData = async (req) => {
    const {
        uuid,
        password,
        shouldDelete: shouldDelete
    } = req.body;

    // 检查 UUID 是否存在于 KV 缓存中
    const storedData = await kv.get(uuid);

    // 如果 UUID 不存在，则返回错误
    if (!storedData) {
        return {
            code: 404,
            message: "未找到数据"
        };
    }

    // 检测IP验证
    if (!checkIP(storedData.safeIP, req.headers["x-real-ip"])) {
        return {
            code: 403,
            message: "当前访问IP无此数据的访问权限"
        }
    }

    // 检查是否需要密码，并验证密码是否与存储的密码匹配
    if (password && password !== storedData.password) {
        return {
            code: 401,
            message: "无效的密码"
        };
    }

    // 如果设置了删除标志，从 KV 缓存中删除数据
    if (shouldDelete) {
        await kv.del(uuid);
    }
    
    return {
        code: 200,
        message: `查询成功${shouldDelete ? ',已删除此记录' : ''}`,
        data: storedData.data,
    };
};

// 生成随机 UUID
const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
        v = c == "x" ? r: (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

// 处理 API 请求
export default async function handler(req, res) {
    try {
        // 检查请求方法
        if (req.method === "POST") {
            const response = await writeData(req);
            res.status(response.code).json(response);
        } else if (req.method === "GET") {
            const response = await readData(req);
            res.status(response.code).json(response);
        } else {
            res.status(405).json({
                code: 405,
                message: "不允许的请求方法"
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            code: 500,
            message: "内部服务器错误",
            error: error
        });
    }
};