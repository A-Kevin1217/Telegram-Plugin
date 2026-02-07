<div align="center">

# TRSS-Yunzai Telegram Plugin

TRSS-Yunzai Telegram Bot 适配器 插件

[![访问量](https://visitor-badge.glitch.me/badge?page_id=A-Kevin1217.Telegram-Plugin&right_color=red&left_text=访%20问%20量)](https://github.com/A-Kevin1217/Telegram-Plugin)
[![Stars](https://img.shields.io/github/stars/A-Kevin1217/Telegram-Plugin?color=yellow&label=收藏)](../../stargazers)
[![Downloads](https://img.shields.io/github/downloads/A-Kevin1217/Telegram-Plugin/total?color=blue&label=下载)](../../archive/main.tar.gz)
[![Releases](https://img.shields.io/github/v/release/A-Kevin1217/Telegram-Plugin?color=green&label=发行版)](../../releases/latest)

[![访问量](https://profile-counter.glitch.me/A-Kevin1217-Telegram-Plugin/count.svg)](https://github.com/A-Kevin1217/Telegram-Plugin)

</div>

## 安装教程

### 方法一：手动安装

1. 准备：[TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)
2. 在 Yunzai 根目录执行：
   ```bash
   git clone https://github.com/A-Kevin1217/Telegram-Plugin.git plugins/Telegram-Plugin
   ```
3. 重启 Yunzai
4. 打开：[BotFather](https://t.me/BotFather) 创建 Bot：  
   ① 发送 `/newbot`  
   ② 按提示输入机器人名称和用户名  
   ③ 获取 Bot Token  
5. 在 Yunzai 中输入：`#TG设置你的Token`

### 方法二：使用插件管理器

1. 在 Yunzai 中输入：`#安装插件 https://github.com/A-Kevin1217/Telegram-Plugin.git`
2. 重启 Yunzai
3. 按照方法一的步骤 4-5 配置 Bot Token

## 功能特性

- ✅ 支持 Telegram Bot API 完整功能
- ✅ 支持 MarkdownV2 格式消息
- ✅ 支持内联键盘按钮
- ✅ 支持回复键盘
- ✅ 支持按钮回调处理
- ✅ 支持链接按钮和点击反馈
- ✅ 支持按钮样式（`bg_primary` 蓝色 / `bg_danger` 红色 / `bg_success` 绿色）
- ✅ 支持按钮自定义表情符号图标
- ✅ 支持图片、视频、音频、文件发送
- ✅ 支持消息撤回
- ✅ 支持代理和反向代理

## 使用教程

### 基础命令

- `#TG账号` - 查看已连接的 Bot 账号
- `#TG设置 Token` - 添加/删除 Bot Token
- `#TG代理 代理地址` - 设置代理（格式：`scheme://[userinfo@]host[:port]`）
- `#TG反代 反代地址` - 设置反向代理

### 开发示例

```javascript
// 发送 MarkdownV2 格式消息
e.reply(segment.markdown("*粗体* _斜体_ __下划线__ ~删除线~"))

// 发送带按钮的消息
e.reply([
  segment.text("请选择："),
  segment.button([
    { text: "确认", callback: "confirm" },
    { text: "取消", callback: "cancel" },
    { text: "访问链接", link: "https://example.com" }
  ])
])

// 发送带样式和自定义图标的按钮（Telegram 12.4+ 新特性）
e.reply([
  segment.text("操作选项："),
  segment.button([
    [
      { text: "确认", callback: "confirm", color: "bg_success", custom_emoji_id: "5368324170671202286" },
      { text: "删除", callback: "delete", color: "bg_danger" },
      { text: "详情", callback: "detail", color: "bg_primary" }
    ]
  ])
])
// color 可选值：bg_primary（蓝色）、bg_danger（红色）、bg_success（绿色）
// style 是 color 的别名，emoji_id 是 custom_emoji_id 的别名

// 发送输入型按钮（按下后文字填入输入框，用户可决定是否发送）
e.reply([
  segment.text("快捷输入："),
  segment.button([
    [
      { text: "确认", input: "confirm" },
      { text: "签到", input: "#签到" },
      { text: "帮助", input: "#帮助" }
    ]
  ])
])

// 处理按钮回调
Bot.on("notice.button", (e) => {
  if (e.button_data === "confirm") {
    e.reply("您点击了确认按钮")
  }
})
```

> **注意**：`input` 类型按钮依赖 Telegram 的 Inline Mode，需要在 [BotFather](https://t.me/BotFather) 中通过 `/setinline` 命令为机器人开启 Inline Mode 才能正常使用。

### 按钮属性参考

| 属性 | 说明 | 示例 |
|------|------|------|
| `text` | 按钮显示文本 | `"确认"` |
| `callback` | 点击后触发回调 | `"confirm"` |
| `url` / `link` | 点击后打开链接 | `"https://example.com"` |
| `input` | 点击后将文字填入输入框（不直接发送） | `"#签到"` |
| `color` / `style` | 按钮配色样式（Telegram 12.4+） | `"bg_primary"` / `"bg_danger"` / `"bg_success"` |
| `custom_emoji_id` / `emoji_id` | 按钮标签前的自定义表情符号（Telegram 12.4+） | `"5368324170671202286"` |
| `clicked_text` | 点击后按钮文本变更 | `"已确认 ✓"` |
| `web_app` | 打开 Web App | `"https://example.com/app"` |
| `pay` | 支付按钮 | `true` |