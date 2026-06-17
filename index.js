logger.info(logger.yellow("- 正在加载 Telegram 适配器插件"))

import makeConfig from "../../lib/plugins/config.js"
import fetch from "node-fetch"
import path from "node:path"
import imageSize from "image-size"
import TelegramBot from "node-telegram-bot-api"
process.env.NTBA_FIX_350 = 1

const DEFAULT_PARSE_MODE = "MarkdownV2"
const TG_MARKDOWN_TOKEN_RE = /\x00TGMD(\d+)\x00/g
const TG_MARKDOWN_SPECIAL_RE = /[\\_*[\]()~`>#+\-=|{}.!]/g

function escapeTelegramText(text) {
  return String(text).replace(TG_MARKDOWN_SPECIAL_RE, "\\$&")
}

function escapeTelegramCode(text) {
  return String(text).replace(/[\\`]/g, "\\$&")
}

function escapeTelegramUrl(url) {
  return String(url).trim().replace(/[\\)]/g, "\\$&")
}

function convertMarkdownTable(table, protect) {
  const rows = table
    .trim()
    .split("\n")
    .filter((line, index) => index !== 1)
    .map(line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()))
  const widths = []

  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] || 0, cell.length)
    })
  }

  const text = rows
    .map(row => row.map((cell, index) => cell.padEnd(widths[index] || 0)).join(" | "))
    .join("\n")

  return protect(`\`\`\`\n${escapeTelegramCode(text)}\n\`\`\``)
}

function convertMarkdownTables(text, protect) {
  const lines = text.split("\n")
  const result = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const next = lines[index + 1]
    const isTableHeader = line?.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next || "")

    if (!isTableHeader) {
      result.push(line)
      continue
    }

    const table = [line, next]
    index += 2
    while (index < lines.length && lines[index].includes("|")) {
      table.push(lines[index])
      index++
    }
    index--
    result.push(convertMarkdownTable(table.join("\n"), protect))
  }

  return result.join("\n")
}

function convertCommonMarkdownToTelegram(markdown) {
  const tokens = []
  const protect = (value) => `\x00TGMD${tokens.push(value) - 1}\x00`
  const restore = (value) => {
    let restored = value
    let previous
    do {
      previous = restored
      restored = restored.replace(TG_MARKDOWN_TOKEN_RE, (_, index) => tokens[Number(index)] || "")
    } while (restored !== previous)
    return restored
  }
  const convertInline = (value) => {
    let text = String(value || "")
    const format = (marker, inner) => protect(`${marker}${restore(convertInline(inner))}${marker}`)

    text = text.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_, alt, url) => {
      const label = alt || url
      return protect(`[${escapeTelegramText(label)}](${escapeTelegramUrl(url)})`)
    })
    text = text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, url) => {
      return protect(`[${escapeTelegramText(label)}](${escapeTelegramUrl(url)})`)
    })
    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`\`${escapeTelegramCode(code)}\``))
    text = text.replace(/\*\*\*([\s\S]+?)\*\*\*/g, (_, inner) => {
      return protect(`*_${restore(convertInline(inner))}_*`)
    })
    text = text.replace(/___([\s\S]+?)___/g, (_, inner) => {
      return protect(`*_${restore(convertInline(inner))}_*`)
    })
    text = text.replace(/\*\*([\s\S]+?)\*\*/g, (_, inner) => format("*", inner))
    text = text.replace(/__([\s\S]+?)__/g, (_, inner) => format("*", inner))
    text = text.replace(/~~([\s\S]+?)~~/g, (_, inner) => format("~", inner))
    text = text.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, (_, prefix, inner) => {
      return `${prefix}${format("_", inner)}`
    })
    text = text.replace(/(^|[^\w_])_([^_\n]+)_(?!_)/g, (_, prefix, inner) => {
      return `${prefix}${format("_", inner)}`
    })

    return escapeTelegramText(text)
  }

  let text = String(markdown ?? "").replace(/\r\n/g, "\n")
  text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const lang = String(language || "").trim().replace(/[^\w+-]/g, "")
    const head = lang ? `\`\`\`${lang}\n` : "```\n"
    return protect(`${head}${escapeTelegramCode(code)}\n\`\`\``)
  })
  text = convertMarkdownTables(text, protect)

  const lines = text.split("\n").map((line) => {
    let match

    if (!line.trim())
      return ""

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
      return protect("\\-\\-\\-\\-\\-\\-\\-\\-")

    if ((match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)))
      return `*${convertInline(match[2])}*`

    if ((match = line.match(/^(\s*)>\s?(.*)$/)))
      return `${escapeTelegramText(match[1])}> ${convertInline(match[2])}`

    if ((match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/))) {
      const checked = match[2].toLowerCase() === "x" ? "x" : " "
      return `${escapeTelegramText(match[1])}\\[${checked}\\] ${convertInline(match[3])}`
    }

    if ((match = line.match(/^(\s*)[-*+]\s+(.+)$/)))
      return `${escapeTelegramText(match[1])}\\- ${convertInline(match[2])}`

    if ((match = line.match(/^(\s*)\d+[.)]\s+(.+)$/)))
      return `${escapeTelegramText(match[1])}${escapeTelegramText(match[0].match(/\d+[.)]/)[0])} ${convertInline(match[2])}`

    return convertInline(line)
  })

  return restore(lines.join("\n"))
}

const { config, configSave } = await makeConfig("Telegram", {
  tips: "",
  permission: "master",
  proxy: "",
  reverseProxy: "",
  token: [],
  image: {
    height: 12800,
    width: 12800,
  },
  // Telegram 指令菜单配置，格式：{ "命令名": "描述" }
  // 命令名只能用小写英文字母、数字和下划线，描述最多256字符
  commands: {}
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai Telegram Plugin ! 作者：时雨🌌星空 & 小丞",
    "参考：https://github.com/TimeRainStarSky/Yunzai-Telegram-Plugin",
  ],
})

const adapter = new class TelegramAdapter {
  constructor() {
    this.id = "Telegram"
    this.name = "TelegramBot"
    this.version = `node-telegram-bot-api v0.66.0`
  }



  async sendMsg(data, msg, opts = {}) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const message_id = []
    let text = ""
    let parse_mode = opts.parse_mode || DEFAULT_PARSE_MODE
    let reply_markup = null
    
    // 添加调试日志
    //console.log("发送消息:", JSON.stringify(msg))
    
    const sendText = async () => {
      if (!text) return
      const sendOpts = { ...opts }
      sendOpts.parse_mode = parse_mode || DEFAULT_PARSE_MODE
      if (reply_markup) sendOpts.reply_markup = reply_markup
      const rawText = text
      const sendText = sendOpts.parse_mode === DEFAULT_PARSE_MODE
        ? convertCommonMarkdownToTelegram(rawText)
        : rawText

      const saveMessage = (ret) => {
        if (ret) {
          msgs.push(ret)
          if (ret.message_id)
            message_id.push(ret.message_id)
        }
      }
      
      // 添加调试日志
      //console.log("发送文本:", text, "解析模式:", parse_mode, "按钮:", reply_markup ? JSON.stringify(reply_markup) : "无")
      
      //Bot.makeLog("info", `发送文本：[${data.id}] ${text}`, data.self_id)
      try {
        const ret = await data.bot.sendMessage(data.id, sendText, sendOpts)
        saveMessage(ret)
      } catch (err) {
        // 记录到日志
        Bot.makeLog("error", `发送消息失败：[${data.id}] ${rawText} - ${err.message}`, data.self_id)

        if (sendOpts.parse_mode) {
          const plainOpts = { ...sendOpts }
          delete plainOpts.parse_mode

          try {
            Bot.makeLog("info", `降级普通文本发送：[${data.id}] ${rawText}`, data.self_id)
            const ret = await data.bot.sendMessage(data.id, rawText, plainOpts)
            saveMessage(ret)
          } catch (plainErr) {
            Bot.makeLog("error", `普通文本发送失败：[${data.id}] ${rawText} - ${plainErr.message}`, data.self_id)
          }
        }
      }
      text = ""
      parse_mode = opts.parse_mode || DEFAULT_PARSE_MODE
      reply_markup = null
    }

    for (let i of msg) {
      if (typeof i !== "object")
        i = { type: "text", text: i }

      // 添加调试日志
      console.log("处理消息项:", JSON.stringify(i))

      let file
      if (i.file) {
        if (typeof i.file === "string" && !i.name)
          i.name = path.basename(i.file)
        file = await Bot.fileType(i)
      }

      let ret
      switch (i.type) {
        case "text":
          text += i.text || i.data || ""
          break
        case "markdown":
          // 支持 text 或 data 字段
          const markdownText = i.text || i.data || "";
          if (!markdownText) {
            console.log("警告: markdown 消息缺少 text/data 字段")
            break
          }
          // 直接使用原始文本，不进行转义
          text += markdownText
          parse_mode = DEFAULT_PARSE_MODE
          break
        case "button":
          if (!reply_markup) {
            reply_markup = {
              inline_keyboard: []
            }
          }
          
          // 处理按钮数据格式
          let buttons = i.buttons || i.data || []
          
          // 确保按钮数据是数组
          if (!Array.isArray(buttons)) {
            buttons = [buttons]
          }
          
          // 检查是否是二维数组
          let isNestedArray = false
          if (buttons.length > 0) {
            isNestedArray = Array.isArray(buttons[0])
          }
          
          // 如果是一维数组，并且元素是对象或字符串，则认为是单行按钮
          // 将其转换为二维数组格式：[[按钮1, 按钮2, ...]]
          if (!isNestedArray) {
            buttons = [buttons]
          }
          
          // 处理每一行按钮
          for (const buttonRow of buttons) {
            if (!buttonRow || !Array.isArray(buttonRow)) continue
            
            const row = []
            for (const btn of buttonRow) {
              if (!btn) continue
              
              if (typeof btn === "string") {
                row.push({ text: btn, callback_data: btn })
              } else {
                const button = { text: btn.text || "按钮" }
                
                // 处理回调数据
                if (btn.callback) {
                  button.callback_data = btn.callback
                  
                  // 如果有 clicked_text，将其添加到回调数据中
                  if (btn.clicked_text) {
                    // 存储点击后显示的文本，格式：原始回调数据|clicked_text
                    button.callback_data = `${button.callback_data}|${btn.clicked_text}`
                  }
                }
                
                // 处理链接
                if (btn.url || btn.link) button.url = btn.url || btn.link
                
                // input：按下按钮后将文字填入输入框，用户可决定是否发送
                // 映射到 switch_inline_query_current_chat
                if (btn.input !== undefined) button.switch_inline_query_current_chat = btn.input
                
                // 其他属性
                if (btn.web_app) button.web_app = { url: btn.web_app }
                if (btn.login_url) button.login_url = btn.login_url
                if (btn.callback_game) button.callback_game = {}
                if (btn.switch_inline_query !== undefined) button.switch_inline_query = btn.switch_inline_query
                if (btn.switch_inline_query_current_chat !== undefined) button.switch_inline_query_current_chat = btn.switch_inline_query_current_chat
                if (btn.pay) button.pay = true
                
                // 按钮样式：支持 bg_primary（蓝色）、bg_danger（红色）、bg_success（绿色）
                if (btn.color) button.color = btn.color
                if (btn.style) button.color = btn.style
                
                // 自定义表情符号图标：显示在按钮标签前
                if (btn.custom_emoji_id) button.custom_emoji_id = btn.custom_emoji_id
                if (btn.emoji_id) button.custom_emoji_id = btn.emoji_id
                
                row.push(button)
              }
            }
            
            if (row.length > 0) {
              reply_markup.inline_keyboard.push(row)
            }
          }
          break
        case "keyboard":
          // 处理回复键盘
          const keyboardButtons = i.data || []
          const keyboardOptions = i.options || {}
          
          if (!reply_markup) {
            reply_markup = {
              keyboard: [],
              resize_keyboard: keyboardOptions.resize_keyboard || true,
              one_time_keyboard: keyboardOptions.one_time_keyboard || false,
              input_field_placeholder: keyboardOptions.input_field_placeholder || "",
              selective: keyboardOptions.selective || false
            }
          }
          
          // 处理每一行按钮
          for (const buttonRow of keyboardButtons) {
            if (!buttonRow || !Array.isArray(buttonRow)) continue
            
            const row = []
            for (const btn of buttonRow) {
              if (!btn) continue
              
              if (typeof btn === "string") {
                row.push({ text: btn })
              } else {
                const button = { text: btn.text || "按钮" }
                if (btn.request_contact) button.request_contact = true
                if (btn.request_location) button.request_location = true
                if (btn.request_poll) button.request_poll = btn.request_poll
                if (btn.web_app) button.web_app = { url: btn.web_app }
                
                // 按钮样式：支持 bg_primary（蓝色）、bg_danger（红色）、bg_success（绿色）
                if (btn.color) button.color = btn.color
                if (btn.style) button.color = btn.style
                
                // 自定义表情符号图标：显示在按钮标签前
                if (btn.custom_emoji_id) button.custom_emoji_id = btn.custom_emoji_id
                if (btn.emoji_id) button.custom_emoji_id = btn.emoji_id
                
                row.push(button)
              }
            }
            
            if (row.length > 0) {
              reply_markup.keyboard.push(row)
            }
          }
          break
        case "hide_keyboard":
          reply_markup = {
            remove_keyboard: true,
            selective: i.selective || false
          }
          break
        case "force_reply":
          reply_markup = {
            force_reply: true,
            selective: i.selective || false,
            input_field_placeholder: i.placeholder || ""
          }
          break
        case "image":
          await sendText()
          Bot.makeLog("info", `发送图片：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          const size = imageSize(file.buffer)
          if (size.height > config.image.height || size.width > config.image.width)
            ret = await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name })
          else
            ret = await data.bot.sendPhoto(data.id, file.buffer, opts, { filename: file.name })
          break
        case "record":
          await sendText()
          Bot.makeLog("info", `发送音频：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          if (file.type.ext === "mp3" || file.type.ext === "m4a")
            ret = await data.bot.sendAudio(data.id, file.buffer, opts, { filename: file.name })
          else if (file.type.ext === "opus")
            ret = await data.bot.sendVoice(data.id, file.buffer, opts, { filename: file.name })
          else
            ret = await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name })
          break
        case "video":
          await sendText()
          Bot.makeLog("info", `发送视频：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          ret = await data.bot.sendVideo(data.id, file.buffer, opts, { filename: file.name })
          break
        case "file":
          await sendText()
          Bot.makeLog("info", `发送文件：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          ret = await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name })
          break
        case "reply":
          opts.reply_to_message_id = i.id
          break
        case "at":
          text += `@${(await data.bot.pickFriend(i.qq).getInfo()).username}`
          break
        case "node":
          for (const ret of await Bot.sendForwardMsg(msg => this.sendMsg(data, msg), i.data)) {
            msgs.push(...ret.data)
            message_id.push(...ret.message_id)
          }
          break
        default:
          text += JSON.stringify(i)
      }
      if (ret) {
        msgs.push(ret)
        if (ret.message_id)
          message_id.push(ret.message_id)
      }
    }

    await sendText()
    return { data: msgs, message_id }
  }

  async recallMsg(data, message_id, opts) {
    Bot.makeLog("info", `撤回消息：[${data.id}] ${message_id}`, data.self_id)
    if (!Array.isArray(message_id))
      message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      msgs.push(await data.bot.deleteMessage(data.id, i, opts))
    return msgs
  }

  async getAvatarUrl(data) {
    try {
      return data.bot.getFileLink((await data.bot.getChat(data.id)).photo.big_file_id)
    } catch (err) {
      logger.error(`获取头像错误：${logger.red(err)}`)
      return false
    }
  }

  pickFriend(id, user_id) {
    if (typeof user_id !== "string")
      user_id = String(user_id)
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      id: user_id.replace(/^tg_/, ""),
    }
    return {
      ...i,
      sendMsg: (msg, opts) => this.sendMsg(i, msg, opts),
      recallMsg: (message_id, opts) => this.recallMsg(i, message_id, opts),
      getInfo: () => i.bot.getChat(i.id),
      getAvatarUrl: () => this.getAvatarUrl(i),
    }
  }

  pickMember(id, group_id, user_id) {
    if (typeof group_id !== "string")
      group_id = String(group_id)
    if (typeof user_id !== "string")
      user_id = String(user_id)
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^tg_/, ""),
      user_id: user_id.replace(/^tg_/, ""),
    }
    return {
      ...this.pickFriend(id, user_id),
      ...i,
      getInfo: () => i.bot.getChatMember(i.group_id, i.user_id),
    }
  }

  pickGroup(id, group_id) {
    if (typeof group_id !== "string")
      group_id = String(group_id)
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      id: group_id.replace(/^tg_/, ""),
    }
    return {
      ...i,
      sendMsg: (msg, opts) => this.sendMsg(i, msg, opts),
      recallMsg: (message_id, opts) => this.recallMsg(i, message_id, opts),
      getInfo: () => i.bot.getChat(i.id),
      getAvatarUrl: () => this.getAvatarUrl(i),
      pickMember: user_id => this.pickMember(id, i.id, user_id),
    }
  }

  async makeMessage(data) {
    data.bot = Bot[data.self_id]
    data.post_type = "message"
    data.user_id = `tg_${data.from.id}`
    data.sender = {
      user_id: data.user_id,
      nickname: `${data.from.first_name}-${data.from.username}`,
    }
    data.bot.fl.set(data.user_id, { ...data.from, ...data.sender })

    switch (data.chat.type) {
      case "supergroup":
        data.message_type = "group"
        break
      default:
        data.message_type = data.chat.type
    }

    data.message = []
    data.raw_message = ""

    if (data.text) {
      data.message.push({ type: "text", text: data.text })
      data.raw_message += data.text
    }

    if (data.document) {
      const file = data.document
      data.file = {
        name: file.file_name || `${Date.now().toString(36)}.bin`,
        size: file.file_size,
        fid: file.file_id,
        unique_id: file.file_unique_id,
        mime_type: file.mime_type,
      }
      try {
        data.file.url = await data.bot.getFileLink(file.file_id)
      } catch (err) {
        logger.error(`获取文件链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "file", file: data.file })
      data.raw_message += `[文件: ${data.file.name}]`
    } else if (data.photo) {
      const photo = data.photo[data.photo.length - 1]
      data.file = {
        name: `${photo.file_unique_id}.jpg`,
        size: photo.file_size,
        fid: photo.file_id,
        unique_id: photo.file_unique_id,
      }
      try {
        data.file.url = await data.bot.getFileLink(photo.file_id)
      } catch (err) {
        logger.error(`获取图片链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "image", file: data.file })
      data.raw_message += "[图片]"
    } else if (data.video) {
      const video = data.video
      data.file = {
        name: video.file_name || `${video.file_unique_id}.mp4`,
        size: video.file_size,
        fid: video.file_id,
        unique_id: video.file_unique_id,
        mime_type: video.mime_type,
      }
      try {
        data.file.url = await data.bot.getFileLink(video.file_id)
      } catch (err) {
        logger.error(`获取视频链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "video", file: data.file })
      data.raw_message += "[视频]"
    } else if (data.audio) {
      const audio = data.audio
      data.file = {
        name: audio.file_name || `${audio.file_unique_id}.mp3`,
        size: audio.file_size,
        fid: audio.file_id,
        unique_id: audio.file_unique_id,
        mime_type: audio.mime_type,
      }
      try {
        data.file.url = await data.bot.getFileLink(audio.file_id)
      } catch (err) {
        logger.error(`获取音频链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "record", file: data.file })
      data.raw_message += "[音频]"
    } else if (data.voice) {
      const voice = data.voice
      data.file = {
        name: `${voice.file_unique_id}.ogg`,
        size: voice.file_size,
        fid: voice.file_id,
        unique_id: voice.file_unique_id,
        mime_type: voice.mime_type,
      }
      try {
        data.file.url = await data.bot.getFileLink(voice.file_id)
      } catch (err) {
        logger.error(`获取语音链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "record", file: data.file })
      data.raw_message += "[语音]"
    } else if (data.sticker) {
      const sticker = data.sticker
      data.file = {
        name: `${sticker.file_unique_id}.webp`,
        size: sticker.file_size,
        fid: sticker.file_id,
        unique_id: sticker.file_unique_id,
      }
      try {
        data.file.url = await data.bot.getFileLink(sticker.file_id)
      } catch (err) {
        logger.error(`获取贴纸链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "image", file: data.file })
      data.raw_message += "[贴纸]"
    } else if (data.animation) {
      const animation = data.animation
      data.file = {
        name: animation.file_name || `${animation.file_unique_id}.gif`,
        size: animation.file_size,
        fid: animation.file_id,
        unique_id: animation.file_unique_id,
        mime_type: animation.mime_type,
      }
      try {
        data.file.url = await data.bot.getFileLink(animation.file_id)
      } catch (err) {
        logger.error(`获取动图链接错误：${logger.red(err)}`)
      }
      data.message.push({ type: "image", file: data.file })
      data.raw_message += "[动图]"
    }

    if (data.from.id === data.chat.id) {
      Bot.makeLog("info", `好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    } else {
      data.group_id = `tg_${data.chat.id}`
      data.group_name = `${data.chat.title}-${data.chat.username}`
      data.bot.gl.set(data.group_id, {
        ...data.chat,
        group_id: data.group_id,
        group_name: data.group_name,
      })
      Bot.makeLog("info", `群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    }

    Bot.em(`${data.post_type}.${data.message_type}`, data)
  }

  async connect(token) {
    const bot = new TelegramBot(token, { polling: { params: { allowed_updates: JSON.stringify(["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "inline_query", "chosen_inline_result", "poll", "poll_answer", "my_chat_member"]) } }, baseApiUrl: config.reverseProxy, request: { proxy: config.proxy }})
    bot.on("polling_error", logger.error)
    bot.login = bot.startPolling
    bot.logout = bot.stopPolling
    try {
      bot.info = await bot.getMe()
    } catch (err) {
      Bot.makeLog("error", `获取 Bot 信息错误：${logger.red(err)}`, token)
    }

    if (!bot.info?.id) {
      Bot.makeLog("error", `${this.name}(${this.id}) ${this.version} 连接失败`, token)
      return false
    }

    const id = `tg_${bot.info.id}`
    Bot[id] = bot
    Bot[id].adapter = this
    Bot[id].uin = id
    Bot[id].nickname = `${Bot[id].info.first_name}-${Bot[id].info.username}`
    Bot[id].version = {
      id: this.id,
      name: this.name,
      version: this.version,
    }
    Bot[id].stat = { start_time: Date.now()/1000 }
    Bot[id].fl = new Map
    Bot[id].gl = new Map
    Bot[id].gml = new Map

    Bot[id].pickFriend = user_id => this.pickFriend(id, user_id)
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].pickMember = (group_id, user_id) => this.pickMember(id, group_id, user_id)
    Bot[id].pickGroup = group_id => this.pickGroup(id, group_id)

    Bot[id].avatar = await Bot[id].pickFriend(id).getAvatarUrl()

    Bot[id].on("message", async data => {
      data.self_id = id
      await this.makeMessage(data)
    })

    // 添加对按钮回调的处理
    Bot[id].on("callback_query", data => {
      // 处理回调数据，检查是否包含 clicked_text
      let callbackData = data.data;
      let clickedText = null;
      
      // 检查回调数据是否包含分隔符
      if (callbackData && callbackData.includes('|')) {
        const parts = callbackData.split('|');
        callbackData = parts[0];  // 原始回调数据
        clickedText = parts[1];   // 点击后显示的文本
        
        // 如果有 clicked_text，更新按钮文本
        if (clickedText && data.message && data.message.reply_markup) {
          try {
            // 查找并更新按钮文本
            const keyboard = data.message.reply_markup.inline_keyboard;
            let buttonFound = false;
            
            // 遍历所有按钮行
            for (let i = 0; i < keyboard.length; i++) {
              const row = keyboard[i];
              // 遍历行中的每个按钮
              for (let j = 0; j < row.length; j++) {
                const button = row[j];
                // 如果找到匹配的按钮
                if (button.callback_data && button.callback_data.startsWith(callbackData + '|')) {
                  // 更新消息，修改按钮文本
                  const newKeyboard = JSON.parse(JSON.stringify(keyboard));
                  newKeyboard[i][j].text = clickedText;
                  
                  data.bot.editMessageReplyMarkup({
                    inline_keyboard: newKeyboard
                  }, {
                    chat_id: data.message.chat.id,
                    message_id: data.message.message_id
                  }).catch(err => {
                    // 忽略错误
                    console.log("更新按钮文本失败:", err.message);
                  });
                  
                  buttonFound = true;
                  break;
                }
              }
              if (buttonFound) break;
            }
          } catch (err) {
            console.log("处理 clicked_text 时出错:", err);
          }
        }
      }
      
      // 创建一个消息事件对象
      const messageData = {
        raw: data,
        bot: Bot[id],
        self_id: id,
        post_type: "message",
        message_id: data.message.message_id,
        message_type: data.message.chat.id === data.from.id ? "private" : "group",
        sub_type: "normal",
        user_id: `tg_${data.from.id}`,
        sender: {
          user_id: `tg_${data.from.id}`,
          nickname: `${data.from.first_name}-${data.from.username}`,
        },
        message: [{ type: "text", text: callbackData }],
        raw_message: callbackData
      };
      
      // 如果是群消息，添加群相关信息
      if (messageData.message_type === "group") {
        messageData.group_id = `tg_${data.message.chat.id}`
        messageData.group_name = `${data.message.chat.title}-${data.message.chat.username}`
      }
      
      // 设置 id 用于发送消息
      messageData.id = data.message.chat.id
      
      // 添加回复功能
      messageData.reply = (msg, quote = false) => {
        console.log("按钮回调回复被调用:", JSON.stringify(msg))
        if (quote) {
          if (Array.isArray(msg)) {
            msg.unshift({ type: "reply", id: data.message.message_id })
          } else {
            msg = [{ type: "reply", id: data.message.message_id }, msg]
          }
        }
        return this.sendMsg(messageData, msg)
      }
      
      // 立即回应回调，防止按钮一直显示加载状态
      try {
        data.bot.answerCallbackQuery(data.id).catch(err => {
          // 忽略 "query is too old" 或 "query ID is invalid" 错误
          if (!err.message.includes("query is too old") && !err.message.includes("query ID is invalid")) {
            logger.error(`回应按钮回调错误：${logger.red(err)}`)
          }
        })
      } catch (err) {
        // 忽略所有错误
      }
      
      // 记录日志
      if (messageData.message_type === "private") {
        Bot.makeLog("info", `按钮回调：[${messageData.sender.nickname}(${messageData.user_id})] ${messageData.raw_message}`, messageData.self_id)
      } else {
        Bot.makeLog("info", `按钮回调：[${messageData.group_name}(${messageData.group_id}), ${messageData.sender.nickname}(${messageData.user_id})] ${messageData.raw_message}`, messageData.self_id)
      }
      
      // 触发消息事件
      console.log("触发消息事件:", messageData.post_type, messageData.message_type, "内容:", messageData.raw_message)
      Bot.em(`${messageData.post_type}.${messageData.message_type}`, messageData)
    })

    Bot.makeLog("mark", `${this.name}(${this.id}) ${this.version} 已连接`, id)
    Bot.em(`connect.${id}`, { self_id: id })

    // 注册 Telegram 指令菜单（延迟30秒等待插件加载完成）
    setTimeout(() => this.registerBotCommands(bot), 30000)
    // 保存 bot 实例用于后续刷新
    if (!this._bots) this._bots = new Set()
    this._bots.add(bot)

    return true
  }

  async registerBotCommands(bot) {
    const commandList = Object.entries(config.commands || {})
      .filter(([cmd]) => /^[a-z0-9_]{1,32}$/.test(cmd))
      .map(([command, description]) => ({
        command,
        description: String(description || '').substring(0, 256) || command
      }))
      .slice(0, 100)

    if (commandList.length > 0) {
      try {
        await bot.setMyCommands(commandList)
        Bot.makeLog("mark", `已注册 ${commandList.length} 个 Telegram 指令菜单：${commandList.map(c => '/' + c.command).join(', ')}`, bot.uin)
      } catch (err) {
        Bot.makeLog("error", `注册 Telegram 指令菜单失败：${err.message}`, bot.uin)
      }
    } else {
      Bot.makeLog("info", `未配置 Telegram 指令菜单（#TG指令 add 命令名 描述 可添加）`, bot.uin)
    }
  }

  async refreshCommands() {
    if (!this._bots) return
    for (const bot of this._bots)
      await this.registerBotCommands(bot)
  }

  async load() {
    for (const token of config.token)
      await Bot.sleep(5000, this.connect(token))
  }
}

Bot.adapter.push(adapter)

export class Telegram extends plugin {
  constructor() {
    super({
      name: "TelegramAdapter",
      dsc: "Telegram 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#[Tt][Gg]账号$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#[Tt][Gg]设置[0-9]+:.+$",
          fnc: "Token",
          permission: config.permission,
        },
        {
          reg: "^#[Tt][Gg](代理|反代)",
          fnc: "Proxy",
          permission: config.permission,
        },
        {
          reg: "^#[Tt][Gg]指令.*$",
          fnc: "Commands",
          permission: config.permission,
        }
      ]
    })
  }

  List() {
    this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#[Tt][Gg]设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item !== token)
      this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      if (await adapter.connect(token)) {
        config.token.push(token)
        this.reply(`账号已连接，共${config.token.length}个账号`, true)
      } else {
        this.reply(`账号连接失败`, true)
        return false
      }
    }
    await configSave()
  }

  async Proxy() {
    const proxy = this.e.msg.replace(/^#[Tt][Gg](代理|反代)/, "").trim()
    if (this.e.msg.match("代理")) {
      config.proxy = proxy
      this.reply(`代理已${proxy?"设置":"删除"}，重启后生效`, true)
    } else {
      config.reverseProxy = proxy
      this.reply(`反代已${proxy?"设置":"删除"}，重启后生效`, true)
    }
    await configSave()
  }

  async Commands() {
    const msg = this.e.msg.replace(/^#[Tt][Gg]指令/, "").trim()

    // #TG指令 — 查看当前指令菜单
    if (!msg) {
      const cmds = config.commands || {}
      const entries = Object.entries(cmds)
      if (!entries.length)
        return this.reply("当前未配置任何指令菜单\n\n用法：\n#TG指令 add 命令名 描述 — 添加\n#TG指令 del 命令名 — 删除", true)
      const list = entries.map(([cmd, desc]) => `/${cmd} — ${desc}`).join("\n")
      return this.reply(`当前 ${entries.length} 个指令菜单：\n${list}\n\n#TG指令 add 命令名 描述 — 添加\n#TG指令 del 命令名 — 删除`, true)
    }

    // #TG指令 add 命令名 描述 — 添加指令
    const addMatch = msg.match(/^add\s+([a-z0-9_]+)\s+(.+)$/i)
    if (addMatch) {
      const cmd = addMatch[1].toLowerCase()
      const desc = addMatch[2].trim()
      if (!config.commands) config.commands = {}
      config.commands[cmd] = desc
      await configSave()
      await adapter.refreshCommands()
      return this.reply(`已添加指令：/${cmd} — ${desc}`, true)
    }

    // #TG指令 del 命令名 — 删除指令
    const delMatch = msg.match(/^del\s+([a-z0-9_]+)$/i)
    if (delMatch) {
      const cmd = delMatch[1].toLowerCase()
      if (!config.commands?.[cmd])
        return this.reply(`指令 /${cmd} 不存在`, true)
      const desc = config.commands[cmd]
      delete config.commands[cmd]
      await configSave()
      await adapter.refreshCommands()
      return this.reply(`已删除指令：/${cmd} — ${desc}`, true)
    }

    this.reply("用法：\n#TG指令 — 查看\n#TG指令 add 命令名 描述 — 添加\n#TG指令 del 命令名 — 删除", true)
  }
}

logger.info(logger.green("- Telegram 适配器插件 加载完成"))

// 添加 segment 支持
export const segment = {
  text: (text) => ({ type: "text", data: text }),
  image: (file) => ({ type: "image", file }),
  record: (file) => ({ type: "record", file }),
  video: (file) => ({ type: "video", file }),
  file: (file) => ({ type: "file", file }),
  
  // 常见 Markdown 语法会在发送前转换为 Telegram MarkdownV2
  markdown: (text) => {
    if (text === undefined || text === null) {
      console.log("警告: 传递给 segment.markdown 的文本为空")
      text = ""
    }

    return { type: "markdown", data: String(text) }
  },
  
  // markdownv2 作为 markdown 的别名
  markdownv2: (text) => {
    return segment.markdown(text)
  },
  at: (qq) => ({ type: "at", qq }),
  reply: (id) => ({ type: "reply", id }),
  
  // 内联键盘按钮
  // 支持新 API：color（按钮样式）和 custom_emoji_id（自定义图标）
  // color 可选值：bg_primary（蓝色）、bg_danger（红色）、bg_success（绿色）
  button: (buttons) => {
    // 确保按钮数据格式正确
    if (!buttons) buttons = []
    
    // 处理不同格式的按钮数据
    if (!Array.isArray(buttons)) {
      buttons = [buttons]
    }
    
    // 返回正确格式的按钮对象
    return { type: "button", data: buttons }
  },
  
  // 回复键盘
  // 支持新 API：color（按钮样式）和 custom_emoji_id（自定义图标）
  keyboard: (buttons, options = {}) => {
    if (!buttons) buttons = []
    
    if (!Array.isArray(buttons)) {
      buttons = [buttons]
    }
    
    // 如果第一层不是数组，则包装成二维数组
    if (buttons.length > 0 && !Array.isArray(buttons[0])) {
      buttons = [buttons]
    }
    
    return {
      type: "keyboard",
      data: buttons,
      options: options // 可以包含 resize_keyboard, one_time_keyboard, input_field_placeholder 等选项
    }
  },
  
  // 移除键盘
  hideKeyboard: (selective = false) => ({
    type: "hide_keyboard",
    selective: selective
  }),
  
  // 强制回复
  forceReply: (selective = false, placeholder = "") => ({
    type: "force_reply",
    selective: selective,
    placeholder: placeholder
  }),
  
  node: (data) => ({ type: "node", data })
}
