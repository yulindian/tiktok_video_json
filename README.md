# TikTok 爆款视频 Codex 解析台

一个本地单页 MVP，用于 TikTok 美国女装运营上传对标视频、产品首帧图、产品类型和可选卖点。网页会把素材保存到 Codex 工作区的 `jobs/` 目录，之后在 Codex 里说“执行”即可读取最新任务并解析生成 Grok JSON。

## 使用方式

启动本地服务：

```powershell
& "C:\Users\hello\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

然后打开：

```text
http://localhost:5178
```

## 第一版能力

- 输入 TikTok 对标视频链接，可选
- 上传对标视频文件
- 选择或自定义产品类型
- 上传一张产品首帧图并预览
- 选择输出视频 JSON 时长，支持 6/8/10/12/15/20 秒和自定义 3-60 秒
- 可选填写产品卖点
- 保存任务到 `jobs/{任务编号}/`
- 生成 `metadata.json`
- 生成 `codex-prompt.md`
- 执行提示词会要求更细地拆解对标视频：内容模式、拍摄 POV、单人/双人对话、角色音色、互动轮次、镜头触发动作
- 回到 Codex 说“执行”后读取最新任务解析
- 解析完成后清理对标视频临时文件，只保留 metadata、首帧图、提示词和结果记录
- 输出 JSON 时只有真正说出口的台词用英文，其他提示词、拆解、视觉说明和负面提示可保留中文

## 清理视频临时文件

清理最新任务：

```powershell
& "C:\Users\hello\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" cleanup-job-media.js
```

清理指定任务：

```powershell
& "C:\Users\hello\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" cleanup-job-media.js 20260718T074139Z-uofk63
```

## 当前边界

当前版本不绕过 TikTok 登录、地区或反爬限制。视频解析先由 Codex 在你发出“执行”后完成，用来验证输出质量。后续可以把解析和模型生成自动接入后端。
