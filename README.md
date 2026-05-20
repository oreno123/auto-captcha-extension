# 🎯 验证码选择器学习插件

一个用于学习验证码识别插件工作原理的浏览器扩展（**侧边栏模式**）。主要功能包括：智能选择器生成、图片提取和配对管理。

## ✨ 功能特性

- 🔗 **配对选择模式** - 同时选择验证码图片和输入框，保存配对关系
- 🖱️ **交互式元素选择** - 可视化选择页面上的元素，实时高亮
- 🎯 **智能选择器生成** - 自动生成唯一的 CSS 选择器（8种策略）
- 🖼️ **多种图片提取** - 支持 img、canvas、background-image
- ✨ **元素高亮显示** - 一键在页面上高亮显示配对的元素
- 💾 **数据持久化** - 自动保存选择结果，重新打开插件可查看
- 📋 **一键复制** - 快速复制生成的选择器
- 🎨 **现代化 UI** - 美观易用的 Popup 界面，渐变色设计

## 📦 安装方法

### Chrome / Edge

1. 下载或克隆本项目
2. 打开浏览器，进入扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `captcha-selector-extension` 文件夹
6. 完成！插件图标会出现在工具栏

### 💡 首次使用

- 点击工具栏中的插件图标会**自动打开侧边栏**
- 侧边栏会固定在浏览器右侧，不会像 Popup 一样点击其他地方就关闭
- 可以随时点击图标打开/关闭侧边栏

## 🚀 使用方法

### 🔗 配对模式（推荐用于验证码识别学习）

1. 打开包含验证码的网页
2. **点击工具栏的插件图标**，打开侧边栏
3. 在侧边栏中点击「**配对选择（图片+输入框）**」按钮
4. **第一步**：在页面上点击验证码图片（会被绿色高亮）
5. **第二步**：点击对应的验证码输入框（会被蓝色高亮）
6. 配对完成！侧边栏会显示：
   - 图片选择器
   - 输入框选择器
   - 配对信息
   - 图片预览
7. 点击「**高亮显示元素**」按钮，可以在页面上再次查看配对

**侧边栏优势**：
- ✅ 不会因为点击页面而关闭
- ✅ 更大的显示空间，信息展示更清晰
- ✅ 可以边操作页面边查看侧边栏内容

### 🖼️ 单图片模式

1. 点击插件图标
2. 点击「**仅选择图片**」按钮
3. 在页面上点击任意图片
4. 查看生成的选择器和提取的图片
5. 可以下载图片或复制选择器

### 💡 使用技巧

- **取消选择**：按 `ESC` 键
- **自动保存**：选择结果会自动保存，再次打开插件可看到
- **测试高亮**：使用测试页面 `test/test.html` 练习
- **清除数据**：点击「清除」按钮清空所有结果

## 🧩 项目结构

```
captcha-selector-extension/
├── manifest.json           # 扩展配置文件
├── background.js           # 后台脚本：处理侧边栏打开
├── lib/
│   └── selector.js        # 核心：选择器生成器
├── content/
│   └── content.js         # 内容脚本：页面交互
├── sidepanel/             # 侧边栏UI
│   ├── sidepanel.html     # 侧边栏界面
│   ├── sidepanel.css      # 样式文件
│   └── sidepanel.js       # 侧边栏逻辑
├── test/
│   └── test.html          # 测试页面
└── README.md
```

## 🎓 核心学习要点

### 1. 选择器生成策略（selector.js）

按优先级尝试多种策略：

1. **Vue 属性**: `data-v-*`
2. **语义属性**: `placeholder`, `alt`, `name`
3. **源属性**: `src`, `onclick`
4. **CSS 路径**: 完整的 CSS 选择器
5. **父级爬取**: 递归向上查找唯一标识

### 2. 图片提取方式（content.js）

支持三种提取方式：

- **Base64 直读**: `img.src` 为 data URI
- **Canvas 转换**: 绘制元素到 canvas 后导出
- **背景图片**: 从 `background-image` CSS 提取

### 3. 通信机制

- **Popup → Content**: `chrome.tabs.sendMessage`
- **Content → Popup**: `chrome.runtime.sendMessage`
- **脚本注入**: `chrome.scripting.executeScript`

## 🔧 技术栈

- Vanilla JavaScript (原生 JS)
- Chrome Extension Manifest V3
- Canvas API
- CSS3 动画

## 📝 选择器生成示例

```javascript
// 示例 1: 通过 name 属性
<img name="captcha"> → img[name='captcha']

// 示例 2: 通过 placeholder
<input placeholder="验证码"> → input[placeholder='验证码']

// 示例 3: CSS 路径
<div id="app"><img></div> → div#app > img

// 示例 4: Vue 组件
<img data-v-12345> → img[data-v-12345]
```

## 🎯 学习目标

通过这个插件，你将理解：

1. ✅ 如何智能地定位 DOM 元素
2. ✅ 如何生成稳定的 CSS 选择器
3. ✅ 如何提取各种类型的图片
4. ✅ 如何在浏览器扩展中通信
5. ✅ 验证码识别插件的核心原理

## 🔜 后续扩展

当你理解了基础原理后，可以添加：

- [ ] 自动查找验证码功能
- [ ] 规则管理系统
- [ ] 表单自动填写
- [ ] 集成 OCR 识别
- [ ] 云端规则同步

## 📖 参考资料

- [Chrome Extension 官方文档](https://developer.chrome.com/docs/extensions/mv3/)
- [CSS 选择器参考](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Selectors)
- [Canvas API](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

---

**提示**: 本插件仅用于学习目的，请勿用于非法用途。

