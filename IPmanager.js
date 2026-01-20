/**
 * IP-MANAGER.JS
 * 功能：提供 Web 界面管理 IP 列表，并触发 DNS 同步
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cookie = request.headers.get("Cookie") || "";
    
    // 1. 验证登录状态 (使用环境变量中的密码)
    const isAuthed = cookie.includes(`auth=${env.ADMIN_PASSWORD}`);

    // --- 逻辑 A: 处理登录请求 ---
    if (url.pathname === "/login" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const password = formData.get("password");

        if (password === env.ADMIN_PASSWORD) {
          // 登录成功，设置 Cookie 有效期 24 小时
          return new Response("OK", {
            status: 302,
            headers: {
              "Location": "/",
              "Set-Cookie": `auth=${env.ADMIN_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`
            }
          });
        }
      } catch (e) {}
      return new Response("密码错误！", { status: 401 });
    }

    // --- 逻辑 B: 拦截未登录访问 ---
    if (!isAuthed) {
      return new Response(generateLoginHTML(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // --- 逻辑 C: 处理保存 IP 的请求 ---
    if (request.method === "POST") {
      try {
        const formData = await request.formData();
        const rawInput = formData.get("ips") || "";

        // 1. 解析 IP：支持 逗号、空格、分号、换行 分隔
        const splitIps = rawInput.split(/[,\s;]+/).map(i => i.trim()).filter(Boolean);

        // 2. IPv4 格式校验正则
        const ipv4Regex = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/;
        
        // 3. 过滤非法 IP 并去重 (保持输入顺序，因为第一个 IP 有特殊用途)
        const validIps = [];
        const seen = new Set();
        for (const ip of splitIps) {
          if (ipv4Regex.test(ip) && !seen.has(ip)) {
            validIps.push(ip);
            seen.add(ip);
          }
        }

        // 4. 存入 KV 数据中心
        await env.IP_KV.put("ips_list", JSON.stringify(validIps));

        // 5. 【核心】通过 Service Binding 立即触发 IP-SYNC
        let syncMsg = "IP 已保存。";
        if (env.SYNC_WORKER) {
          // 使用 ctx.waitUntil 确保异步触发同步任务，不阻塞当前页面返回
          ctx.waitUntil(
            env.SYNC_WORKER.fetch(new Request("http://internal-sync/trigger", { method: "GET" }))
          );
          syncMsg += " DNS 同步请求已实时发送到后台。";
        }

        return new Response(`
          <div style="text-align:center;margin-top:50px;font-family:sans-serif;">
            <h3 style="color:green;">${syncMsg}</h3>
            <p>有效 IP 数量: ${validIps.length}</p>
            <p style="color:red;font-size:14px;">提示：首位 IP 已强制锁定给第一个域名。</p>
            <a href="/" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;">返回管理页</a>
          </div>
        `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });

      } catch (e) {
        return new Response("系统处理出错: " + e.message, { status: 500 });
      }
    }

    // --- 逻辑 D: 显示管理主界面 (GET 请求) ---
    const rawIps = await env.IP_KV.get("ips_list") || "[]";
    const ipList = JSON.parse(rawIps).join('\n');

    return new Response(generateMainHTML(ipList), {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }
};

// --- HTML 模板生成函数 ---

function generateLoginHTML() {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>登录 - IP Manager</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;font-family:sans-serif;">
      <form action="/login" method="POST" style="background:#fff;padding:40px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
        <h2 style="margin-top:0;">管理员登录</h2>
        <input type="password" name="password" placeholder="请输入管理密码" required 
               style="width:100%;padding:12px;margin:20px 0;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;">
        <button type="submit" style="width:100%;padding:12px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px;">进入管理系统</button>
      </form>
    </body>
    </html>
  `;
}

function generateMainHTML(ipList) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>IP 管理中心</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #f9f9f9; padding: 20px; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        textarea { width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 14px; box-sizing: border-box; resize: vertical; }
        .btn { width: 100%; padding: 15px; background: #007bff; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.3s; }
        .btn:hover { background: #0056b3; }
        .tips { background: #fff8e1; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px; font-size: 13px; color: #666; }
        .info-tag { display: inline-block; background: #e1f5fe; color: #01579b; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>DNS IP 管理器</h2>
        <span class="info-tag">配置规则：首位强制，余位随机分配</span>
        <p style="font-size: 14px; color: #666;">支持粘贴原始列表，自动识别空格、逗号、分号或换行。</p>
        
        <form method="POST">
          <textarea name="ips" rows="12" placeholder="示例：&#10;1.1.1.1&#10;2.2.2.2, 3.3.3.3; 4.4.4.4">${ipList}</textarea>
          <p style="font-size:12px; color:#999;">* 列表中的第一行 IP 将永远分配给域名列表中的第一个域名。</p>
          <button type="submit" class="btn">保存并立即同步 DNS</button>
        </form>

        <div class="tips">
          <b>使用说明：</b>
          <ul>
            <li>系统会自动过滤重复 IP 和错误格式。</li>
            <li>点击保存后，会立即触发后台同步脚本。</li>
            <li>除了手动更新，系统每 30 分钟会自动执行一次巡检。</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;
}