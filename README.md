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

// 处理按钮回调
Bot.on("notice.button", (e) => {
  if (e.button_data === "confirm") {
    e.reply("您点击了确认按钮")
  }
})
```