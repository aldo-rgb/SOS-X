# 📦 MJCustomer API 集成手册 - EntregaX

**日期:** 2026年2月19日  
**版本:** 2.0  
**语言:** 中文

---

## 📋 概述

本手册介绍如何配置 **EntregaX** 与 **MJCustomer** API (api.mjcustomer.com) 之间的集成，以便从中国仓库同步发货数据。

### 集成模式: PULL（主动查询）
EntregaX 主动查询 MJCustomer API 获取订单数据，而不是等待 webhook 推送。

---

## 🔐 1. 凭证配置

### 选项 A: 环境变量 (.env)

编辑后端的 `.env` 文件：

```env
# ============================================
# MJCUSTOMER API - 中国集成
# ============================================
MJCUSTOMER_API_URL=http://api.mjcustomer.com
MJCUSTOMER_USERNAME=你的用户名
MJCUSTOMER_PASSWORD=你的密码
```

**如何获取凭证？**
- 联系 MJCustomer/墨杰供应商申请 API 访问权限
- 凭证与您登录其网页系统使用的相同

### 选项 B: 通过 API 手动登录

如果您不想将凭证保存在文件中，可以手动登录：

```bash
# 在请求体中发送凭证进行手动登录
curl -X POST http://localhost:3001/api/china/mjcustomer/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的ENTREGAX令牌" \
  -d '{
    "username": "你的mjcustomer用户名",
    "password": "你的mjcustomer密码"
  }'
```

**成功响应：**
```json
{
  "success": true,
  "message": "Login exitoso",
  "tokenPreview": "eyJhbGciOiJIUzI1N...",
  "expiresAt": "2026-02-20T21:16:51.055Z"
}
```

---

## 🔄 2. 可用接口

### 2.1 登录 MJCustomer
```
POST /api/china/mjcustomer/login
```

**请求头：**
- `Authorization: Bearer {entregax令牌}`
- `Content-Type: application/json`

**请求体（如果已在.env中配置则可选）：**
```json
{
  "username": "用户名",
  "password": "密码"
}
```

### 2.2 查询单个订单
```
GET /api/china/pull/{订单编号}
```

**示例：**
```bash
curl -X GET "http://localhost:3001/api/china/pull/SHIP2507438tkMW" \
  -H "Authorization: Bearer 你的ENTREGAX令牌"
```

**响应：**
```json
{
  "success": true,
  "message": "Datos sincronizados desde MJCustomer",
  "data": [{
    "fno": "AIR2609602vQvox",
    "receiptId": 15,
    "userId": 42,
    "shippingMark": "S3019",
    "packagesCreated": 3,
    "packagesUpdated": 0
  }]
}
```

### 2.3 批量同步
```
POST /api/china/pull-batch
```

**请求体：**
```json
{
  "orderCodes": [
    "SHIP2507438tkMW",
    "SHIP2507439abCd",
    "AIR2609602vQvox"
  ]
}
```

**响应：**
```json
{
  "success": true,
  "message": "Procesados 3 exitosos, 0 errores",
  "results": [...],
  "errors": []
}
```

### 2.4 手动更新令牌
```
PUT /api/china/config/token
```

**请求体：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5..."
}
```

> ⚠️ 需要总监或更高级别权限

---

## 📊 3. 数据格式 (JSON)

### MJCustomer API 响应结构

```json
{
  "code": 200,
  "type": "success",
  "message": "操作成功",
  "result": {
    "fno": "AIR2609602vQvox",
    "shippingMark": "S3019",
    "totalQty": 1,
    "totalWeight": 23.7,
    "totalVolume": 22.44,
    "totalCbm": 0.135,
    "file": ["http://api.mojiegrupo.com/order/..."],
    "data": [
      {
        "childNo": "AIR2609602vQvox-001",
        "trajecotryName": "广州 - 墨西哥城",
        "weight": 23.7,
        "long": 72,
        "width": 34,
        "height": 55,
        "proName": "汽车配件",
        "customsBno": "L I u7c7b",
        "singleVolume": 22.44,
        "singleCbm": 0.135,
        "billNo": null,
        "etd": null,
        "eta": null
      }
    ]
  },
  "extras": null,
  "time": "2026-02-19 10:30:45"
}
```

### 字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `fno` | string | 唯一订单号（例如：AIR2609602vQvox） |
| `shippingMark` | string | 客户代码 / Box ID |
| `totalQty` | number | 箱子总数 |
| `totalWeight` | number | 总重量（公斤） |
| `totalVolume` | number | 总体积（立方厘米） |
| `totalCbm` | number | 总CBM（立方米） |
| `file` | string[] | 照片/凭证URL |
| `data` | array | 单个箱子数组 |

#### 每个箱子的字段 (data[]):

| 字段 | 类型 | 描述 |
|------|------|------|
| `childNo` | string | 箱子唯一ID（例如：...-001） |
| `trajecotryName` | string | 路线名称 |
| `weight` | number | 重量（公斤） |
| `long` | number | 长度（厘米） |
| `width` | number | 宽度（厘米） |
| `height` | number | 高度（厘米） |
| `proName` | string | 产品描述 |
| `customsBno` | string | 海关编码 |
| `singleVolume` | number | 单位体积 |
| `singleCbm` | number | 单位CBM |
| `billNo` | string | 空运单号（可能为null） |
| `etd` | string | 预计出发日期 |
| `eta` | string | 预计到达日期 |

---

## 🔧 4. 认证流程

```
┌─────────────────────┐
│   1. 登录           │
│   POST /api/login   │
│   {用户名, 密码}    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   2. 获取令牌       │
│   JWT 有效期24小时  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   3. 查询API        │
│   Authorization:    │
│   Bearer {令牌}     │
└─────────────────────┘
```

### 自动登录
系统会在以下情况自动登录：
- 在 `.env` 中配置了 `MJCUSTOMER_USERNAME` 和 `MJCUSTOMER_PASSWORD`
- 令牌过期或为空
- 调用任何同步接口时

---

## 🚨 5. 常见错误

### 错误 401: 令牌过期
```json
{
  "code": 401,
  "message": "登录已过期，请重新登录"
}
```
**解决方案：** 如果凭证已配置，系统会自动续期令牌。

### 错误 400: 订单编号未找到
```json
{
  "code": 400,
  "message": "订单不存在"
}
```
**解决方案：** 检查订单编号是否正确。

### 连接错误
```json
{
  "success": false,
  "error": "No se pudo obtener token de MJCustomer. Verifica credenciales."
}
```
**解决方案：** 
1. 检查 `.env` 中的凭证
2. 确认 api.mjcustomer.com 可访问
3. 尝试手动登录 `POST /api/china/mjcustomer/login`

---

## 📝 6. 配置清单

- [ ] 获取 MJCustomer 凭证（用户名和密码）
- [ ] 将凭证添加到 `.env` 文件：
  ```
  MJCUSTOMER_USERNAME=我的用户名
  MJCUSTOMER_PASSWORD=我的密码
  ```
- [ ] 重启后端
- [ ] 测试登录：`POST /api/china/mjcustomer/login`
- [ ] 测试同步：`GET /api/china/pull/{订单编号}`

---

## 📞 技术支持

- **EntregaX:** soporte@entregax.com
- **MJCustomer:** 联系墨杰供应商

---

*文档生成日期: 2026年2月19日*
