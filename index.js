logger.info(logger.yellow("- 正在加载 Telegram 适配器插件"))

import makeConfig from "../../lib/plugins/config.js"
import fetch from "node-fetch"
import path from "node:path"
import imageSize from "image-size"
import TelegramBot from "node-telegram-bot-api"
process.env.NTBA_FIX_350 = 1

const { config, configSave } = await makeConfig("Telegram", {
  tips: "",
  permission: "master",
  proxy: "",
  reverseProxy: "",
  token: [],
  image: {
    height: 1280,
    width: 1280,
  },
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai Telegram Plugin ! 作者：时雨🌌星空",
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
    let parse_mode = ""
    let reply_markup = null
    
    // 添加调试日志
    console.log("发送消息:", JSON.stringify(msg))
    
    const sendText = async () => {
      if (!text) return
      const sendOpts = { ...opts }
      if (parse_mode) sendOpts.parse_mode = parse_mode
      if (reply_markup) sendOpts.reply_markup = reply_markup
      
      // 添加调试日志
      console.log("发送文本:", text, "解析模式:", parse_mode, "按钮:", reply_markup ? JSON.stringify(reply_markup) : "无")
      
      Bot.makeLog("info", `发送文本：[${data.id}] ${text}`, data.self_id)
      const ret = await data.bot.sendMessage(data.id, text, sendOpts)
      if (ret) {
        msgs.push(ret)
        if (ret.message_id)
          message_id.push(ret.message_id)
      }
      text = ""
      parse_mode = ""
      reply_markup = null
    }

    for (let i of msg) {
      if (typeof i !== "object")
        i = { type: "text", text: i }

      // 添加调试日志
      console.log("处理消息项:", JSON.stringify(i))

      let file
      if (i.file)
        file = await Bot.fileType(i)

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
          text += markdownText
          parse_mode = "Markdown"
          break
        case "markdownv2":
          // 支持 text 或 data 字段
          const markdownV2Text = i.text || i.data || "";
          if (!markdownV2Text) {
            console.log("警告: markdownv2 消息缺少 text/data 字段")
            break
          }
          text += markdownV2Text
          parse_mode = "MarkdownV2"
          break
        case "button":
          if (!reply_markup) {
            reply_markup = {
              inline_keyboard: []
            }
          }
          
          // 处理按钮数据格式
          let buttons = i.buttons || i.data || []
          
          // 确保按钮数据是二维数组格式
          if (!Array.isArray(buttons)) {
            buttons = [buttons]
          }
          
          // 如果第一层不是数组，则包装成二维数组
          if (!Array.isArray(buttons[0])) {
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
                if (btn.callback) button.callback_data = btn.callback
                if (btn.url) button.url = btn.url
                row.push(button)
              }
            }
            
            if (row.length > 0) {
              reply_markup.inline_keyboard.push(row)
            }
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

  makeMessage(data) {
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
    const bot = new TelegramBot(token, { polling: true, baseApiUrl: config.reverseProxy, request: { proxy: config.proxy }})
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

    Bot[id].on("message", data => {
      data.self_id = id
      this.makeMessage(data)
    })

    // 添加对按钮回调的处理
    Bot[id].on("callback_query", data => {
      data.self_id = id
      data.post_type = "notice"
      data.notice_type = "button"
      data.user_id = `tg_${data.from.id}`
      data.sender = {
        user_id: data.user_id,
        nickname: `${data.from.first_name}-${data.from.username}`,
      }
      
      // 确保 data.bot 已设置
      data.bot = Bot[id]
      
      // 然后再访问 fl
      data.bot.fl.set(data.user_id, { ...data.from, ...data.sender })
      
      // 处理消息来源
      if (data.message.chat.id === data.from.id) {
        data.message_type = "private"
        Bot.makeLog("info", `按钮回调：[${data.sender.nickname}(${data.user_id})] ${data.data}`, data.self_id)
      } else {
        data.message_type = "group"
        data.group_id = `tg_${data.message.chat.id}`
        data.group_name = `${data.message.chat.title}-${data.message.chat.username}`
        data.bot.gl.set(data.group_id, {
          ...data.message.chat,
          group_id: data.group_id,
          group_name: data.group_name,
        })
        Bot.makeLog("info", `按钮回调：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.data}`, data.self_id)
      }
      
      // 添加 message 属性，使其可迭代
      data.message_id = data.message.message_id
      data.message = [{ type: "button", data: data.data }]
      data.raw_message = data.data
      
      // 发送回调数据
      data.button_data = data.data
      Bot.em(`${data.post_type}.${data.notice_type}`, data)
      
      // 可选：自动回应回调，防止按钮一直显示加载状态
      data.bot.answerCallbackQuery(data.id).catch(err => {
        logger.error(`回应按钮回调错误：${logger.red(err)}`)
      })
      
      // 同时触发一个消息事件，以便能够处理指令
      const msgData = { ...data }
      msgData.post_type = "message"
      msgData.message_type = data.message_type
      msgData.sub_type = "normal"
      msgData.message = [{ type: "text", data: data.data }]
      msgData.raw_message = data.data
      
      // 如果是群消息，添加必要的群相关属性
      if (data.message_type === "group") {
        msgData.group_name = data.group_name
        msgData.group_id = data.group_id
      }
      
      // 发送消息事件
      Bot.makeLog("info", `模拟消息：[${data.sender.nickname}(${data.user_id})] ${data.data}`, data.self_id)
      Bot.em(`${msgData.post_type}.${msgData.message_type}`, msgData)
    })

    Bot.makeLog("mark", `${this.name}(${this.id}) ${this.version} 已连接`, id)
    Bot.em(`connect.${id}`, { self_id: id })
    return true
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
}

logger.info(logger.green("- Telegram 适配器插件 加载完成"))

// 添加 segment 支持
export const segment = {
  text: (text) => ({ type: "text", data: text }),
  image: (file) => ({ type: "image", file }),
  record: (file) => ({ type: "record", file }),
  video: (file) => ({ type: "video", file }),
  file: (file) => ({ type: "file", file }),
  markdown: (text, useV1 = false) => {
    if (text === undefined || text === null) {
      console.log("警告: 传递给 segment.markdown 的文本为空")
      text = ""
    }
    
    text = String(text)
    
    // 默认使用 MarkdownV2，除非明确指定使用 V1
    if (!useV1) {
      // 转义 MarkdownV2 中的特殊字符
      text = text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
      return { type: "markdownv2", data: text }
    } else {
      return { type: "markdown", data: text }
    }
  },
  // 保留 markdownv2 函数以兼容已有代码
  markdownv2: (text) => {
    if (text === undefined || text === null) {
      console.log("警告: 传递给 segment.markdownv2 的文本为空")
      text = ""
    }
    // 转义 MarkdownV2 中的特殊字符
    text = String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
    return { type: "markdownv2", data: text }
  },
  at: (qq) => ({ type: "at", qq }),
  reply: (id) => ({ type: "reply", id }),
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
  node: (data) => ({ type: "node", data })
}