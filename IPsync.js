export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateDnsTask(env));
  },

  async fetch(request, env) {
    // 触发同步任务
    await updateDnsTask(env);
    return new Response("✅ 强制首位分配任务已执行");
  }
};

async function updateDnsTask(env) {
  const { CF_API_TOKEN, ZONE_ID, RECORD_NAMES, IP_KV } = env;

  // --- 1. 同步锁：防止并发冲突 ---
  const lockKey = "sync_running_lock";
  const isRunning = await IP_KV.get(lockKey);
  if (isRunning) {
    console.log("[跳过] 任务正在运行中...");
    return;
  }
  await IP_KV.put(lockKey, "true", { expirationTtl: 60 });

  try {
    // --- 2. 基础数据准备 ---
    const domainList = RECORD_NAMES.split(',').map(d => d.trim()).filter(d => d);
    const rawIps = await IP_KV.get("ips_list");
    if (!rawIps || domainList.length === 0) return;

    const allIps = JSON.parse(rawIps);
    if (allIps.length === 0) return;

    console.log(`[开始任务] IP库: ${allIps.length}个, 域名数: ${domainList.length}个`);

    // --- 3. 核心分配逻辑 ---
    
    // A. 强制：第一个域名使用第一个 IP
    const firstDomain = domainList[0];
    const firstIp = allIps[0];
    
    // B. 其余域名分配：从第二个 IP 开始洗牌
    let remainingIps = allIps.slice(1); 
    const otherDomains = domainList.slice(1);

    // 洗牌算法
    const shuffle = (array) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    // 如果还有剩余域名，准备打乱后的 IP 池
    let ipPool = [];
    if (otherDomains.length > 0) {
      // 如果除了第一个 IP 外没别的 IP 了，就只能复用第一个 IP
      const sourceForPool = remainingIps.length > 0 ? remainingIps : [firstIp];
      ipPool = shuffle([...sourceForPool]);
    }

    // --- 4. 执行 DNS 更新 ---

    // 记录分配方案，方便一次性处理
    const assignments = [];
    assignments.push({ domain: firstDomain, ip: firstIp }); // 首位强制匹配

    for (const d of otherDomains) {
      if (ipPool.length === 0) {
        // 如果池子空了（域名多于可用IP），重新装填
        ipPool = shuffle(remainingIps.length > 0 ? [...remainingIps] : [firstIp]);
      }
      assignments.push({ domain: d, ip: ipPool.pop() });
    }

    // 逐个更新 Cloudflare DNS
    for (const item of assignments) {
      await updateDnsRecord(env, item.domain, item.ip);
    }

  } catch (e) {
    console.error("同步失败:", e.message);
  } finally {
    // --- 5. 释放锁 ---
    await IP_KV.delete(lockKey);
    console.log("[任务结束] 锁已释放。");
  }
}

// 抽取更新函数，减少重复代码
async function updateDnsRecord(env, domain, targetIP) {
  const { CF_API_TOKEN, ZONE_ID } = env;
  const baseUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;

  try {
    const res = await fetch(`${baseUrl}?name=${domain}&type=A`, {
      headers: { "Authorization": `Bearer ${CF_API_TOKEN}` }
    });
    const data = await res.json();

    if (data.result && data.result.length > 0) {
      const record = data.result[0];
      if (record.content !== targetIP) {
        const updateRes = await fetch(`${baseUrl}/${record.id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content: targetIP, ttl: 60 })
        });
        const updateData = await updateRes.json();
        if (updateData.success) {
          console.log(`[更新] ${domain} -> ${targetIP}`);
        } else {
          console.error(`[失败] ${domain} 更新响应错误`);
        }
      } else {
        console.log(`[跳过] ${domain} 已经是 ${targetIP}`);
      }
    } else {
      console.error(`[不存在] 域名 ${domain} 没找到 A 记录`);
    }
  } catch (err) {
    console.error(`[异常] 请求 ${domain} 失败: ${err.message}`);
  }
}