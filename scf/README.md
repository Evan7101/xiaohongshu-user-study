# 腾讯云云函数 SCF 部署指南

## 为什么需要腾讯云SCF？

Vercel 的 Edge Function 跑在境外节点（美国/欧洲），调用飞书 API 时被拒绝（Forbidden）。
腾讯云 SCF 跑在国内，访问飞书无网络限制。

**架构**：
- 前端（HTML/CSS/JS）→ 继续部署在 Vercel
- 后端（数据提交到飞书）→ 部署在腾讯云 SCF

---

## 部署步骤（5分钟）

### 第 1 步：创建云函数

1. 打开 [cloud.tencent.com](https://cloud.tencent.com)，登录账号
2. 搜索 **「云函数 SCF」** 并进入控制台
3. 点击 **「新建」** 或 **「创建函数」**
4. 基础配置：
   - **函数名称**：`xiaohongshu-submit`
   - **运行环境**：`Node.js 18.15`
   - **内存**：`128MB`（够用）
   - **超时时间**：`10秒`
   - 其他保持默认
5. 点击 **「下一步」**

### 第 2 步：上传代码

1. 在函数代码编辑区，把默认代码全部删掉
2. 把 `scf/index.js` 的内容粘贴进去
3. 点击 **「保存」**

### 第 3 步：配置环境变量

1. 左侧菜单 → **「函数配置」** → **「编辑」**
2. 找到 **「环境变量」** 区域，添加以下 4 个：

| 变量名 | 值 |
|:---|:---|
| `FEISHU_APP_ID` | `cli_a975d7c0ea781bb3` |
| `FEISHU_APP_SECRET` | `Su4dhhmiMbIg6T0aoWjZiftDgqNgW1qF` |
| `FEISHU_APP_TOKEN` | `RQErbrmbFarvAKsF0SHcfySUnKh` |
| `FEISHU_TABLE_ID` | `tblnSLp6LpbVrUM9` |

3. 点击 **「保存」**

### 第 4 步：创建 HTTP 触发器

1. 左侧菜单 → **「触发管理」**
2. 点击 **「创建触发器」**
3. 配置：
   - **触发方式**：`API网关触发`
   - **触发版本**：`默认流量`
   - **请求方法**：`ANY`（或选 `POST`）
   - **启用 CORS**：**勾选 ✅**（关键！前端在 Vercel 跨域调用）
   - **发布环境**：`发布`
4. 点击 **「提交」**

### 第 5 步：获取访问地址

创建成功后，触发器列表会显示一个 **访问路径（URL）**，类似：

```
https://service-xxx.gz.apigw.tencentcs.com/release/xiaohongshu-submit
```

**复制这个 URL**，下一步要填到前端代码里。

---

## 前端配置

拿到腾讯云 SCF 的 URL 后，修改前端代码 `js/app.js`：

找到这一行：
```javascript
const CONFIG = {
  dataUrl: 'data/data.json',
  submitUrl: '/api/submit',  // ← 改成腾讯云SCF的URL
  storageKey: 'xhsc_userstudy_state',
};
```

改成：
```javascript
const CONFIG = {
  dataUrl: 'data/data.json',
  submitUrl: 'https://service-xxx.gz.apigw.tencentcs.com/release/xiaohongshu-submit',
  storageKey: 'xhsc_userstudy_state',
};
```

保存 → git add → git commit → git push → Vercel 自动重新部署。

---

## 常见问题

**Q: 腾讯云SCF收费吗？**
> 每月有 **100万次免费调用** + **40万GB-秒免费运行时间**。你的 30-50 人样本完全在免费额度内。

**Q: 前端还是部署在 Vercel 吗？**
> 是的。只有数据提交的后端换到了腾讯云。前端继续享受 Vercel 的 CDN 加速。

**Q: 触发器创建后没有显示 URL？**
> 点击触发器名称，进入 API 网关详情页，「基础配置」里找「公网访问地址」。

**Q: 提交后还是报错？**
> 检查云函数的「日志查询」，看具体错误信息。通常是飞书权限问题（不是网络问题了）。
