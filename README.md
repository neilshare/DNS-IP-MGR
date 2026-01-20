# DNS IP 管理器

一个基于 Cloudflare Workers 的 DNS IP 管理系统，支持通过 Web 界面管理 IP 列表，并自动将 IP 分配到 Cloudflare DNS 记录。

## 功能特点

- 📝 **Web 界面管理**：提供简洁直观的 Web 界面，方便管理 IP 列表
- 🔒 **安全认证**：基于 Cookie 的登录认证机制
- 🔄 **自动同步**：支持手动触发和定时自动同步 DNS 记录
- 🎯 **智能分配**：
  - 第一个 IP 固定分配给第一个域名
  - 其余域名随机分配剩余 IP
  - 支持域名数量多于 IP 数量的情况
- ✅ **格式验证**：自动过滤无效 IP 地址和重复 IP
- 🌐 **多格式支持**：支持逗号、空格、分号或换行分隔的 IP 列表

## 系统架构

本项目由两个 Cloudflare Workers 组成：

1. **IPmanager.js**：提供 Web 界面，用于管理 IP 列表和触发同步
2. **IPsync.js**：负责实际的 DNS 记录更新工作

## 安装部署

### 前置要求

- Cloudflare 账户
- Cloudflare API Token（具有 DNS 编辑权限）
- Cloudflare Zone ID

### 部署步骤

1. **创建 KV 命名空间**
   - 登录 Cloudflare Dashboard
   - 导航到 Workers & Pages > KV
   - 创建一个新的 KV 命名空间（例如：`DNS_IP_MANAGER`）

2. **部署 IPmanager.js**
   - 在 Cloudflare Dashboard 中创建一个新的 Worker
   - 将 `IPmanager.js` 的内容复制到 Worker 编辑器中
   - 配置以下环境变量：
     - `ADMIN_PASSWORD`：管理员登录密码
   - 绑定 KV 命名空间：
     - 变量名：`IP_KV`
     - KV 命名空间：选择刚才创建的 KV 命名空间
   - 绑定 Service Worker：
     - 变量名：`SYNC_WORKER`
     - Worker：选择即将创建的 IPsync Worker

3. **部署 IPsync.js**
   - 创建另一个 Worker
   - 将 `IPsync.js` 的内容复制到 Worker 编辑器中
   - 配置以下环境变量：
     - `CF_API_TOKEN`：Cloudflare API Token
     - `ZONE_ID`：你的 Cloudflare Zone ID
     - `RECORD_NAMES`：需要管理的 DNS 记录名称，用逗号分隔（例如：`sub1.example.com,sub2.example.com`）
   - 绑定 KV 命名空间：
     - 变量名：`IP_KV`
     - KV 命名空间：选择与 IPmanager 相同的 KV 命名空间
   - 设置 Cron Trigger（定时任务）：
     - 在 Worker 设置中添加 Cron Trigger
     - 例如：`*/30 * * * *` 表示每 30 分钟执行一次

### 获取 Cloudflare API Token 和 Zone ID

1. **获取 API Token**
   - 访问 https://dash.cloudflare.com/profile/api-tokens
   - 点击 "Create Token"
   - 选择 "Edit zone DNS" 模板
   - 设置适当的权限和资源范围
   - 创建并复制 Token

2. **获取 Zone ID**
   - 访问 https://dash.cloudflare.com
   - 选择你的域名
   - 在右侧边栏可以找到 Zone ID

## 使用方法

### 登录系统

1. 访问部署的 IPmanager Worker URL
2. 输入管理员密码登录

### 管理 IP 列表

1. 登录后，在文本框中输入或粘贴 IP 地址
2. 支持以下格式：
   - 每行一个 IP
   - 用逗号分隔：`1.1.1.1,2.2.2.2`
   - 用空格分隔：`1.1.1.1 2.2.2.2`
   - 用分号分隔：`1.1.1.1;2.2.2.2`
3. 点击"保存并立即同步 DNS"按钮
4. 系统会自动验证 IP 格式，过滤重复和无效 IP
5. 保存后立即触发 DNS 同步

### IP 分配规则

- 列表中的第一个 IP 将始终分配给第一个域名
- 其余域名随机分配剩余 IP
- 如果域名数量多于 IP 数量，系统会循环使用可用的 IP

### 自动同步

系统每 30 分钟自动执行一次 DNS 同步，确保 DNS 记录保持最新状态。

## 技术栈

- Cloudflare Workers
- Cloudflare KV 存储
- Cloudflare DNS API
- JavaScript (ES6+)

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 作者

neilshare

## 贡献

欢迎提交 Issue 和 Pull Request！

## 注意事项

1. 确保你的 Cloudflare API Token 具有适当的 DNS 编辑权限
2. 首次使用前，请确保已在 Cloudflare DNS 中创建了相应的 A 记录
3. 建议定期备份 KV 中的 IP 列表
4. 修改 ADMIN_PASSWORD 后，需要重新登录
