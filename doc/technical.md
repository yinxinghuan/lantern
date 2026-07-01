# Technical

## 1. 技术栈

- 游戏：Lantern
- 类型：action
- 简述：Explore a dark cave by lantern light. Pick up 4 crystal types — red grows your halo, green is a 5s flood, blue is a wall, gold scores. Monsters lurk just past the light; linger in the dark and a dark-hand swipe ends the run.
- 框架 / 语言 / 构建：React, TypeScript, Vite, Three.js, Less
- 渲染方式：Canvas/WebGL
- 依赖摘录：@react-three/drei@^9.114.0, @react-three/fiber@^8.17.10, @types/node@^25.8.0, @types/react@^18.3.12, @types/react-dom@^18.3.1, @types/three@^0.169.0, @vitejs/plugin-react@^4.3.3, less@^4.2.0, react@^18.3.1, react-dom@^18.3.1, three@^0.169.0, typescript@^5.6.3, vite@^5.4.10
- 平台元信息：meta.title=Lantern；cover_url=/cover.png；category=action；uuid=f70734b6-75ed-451f-bca6-45d6a89fc1b3

## 2. 目录结构

- `index.html`：Vite/浏览器入口，挂载根节点和基础 meta。
- `vite.config.d.ts`：配置构建、插件和相对路径 base。
- `vite.config.js`：配置构建、插件和相对路径 base。
- `package.json`：定义 npm 脚本、依赖和工程名称。
- `vite.config.ts`：配置构建、插件和相对路径 base。
- `meta.json`：平台发布元信息，包含标题和封面。
- `src/App.tsx`：React 组件和交互界面。
- `src/main.tsx`：React 组件和交互界面。
- `src/shared.d.ts`：游戏源码模块。
- `src/vite-env.d.ts`：游戏源码模块。
- `src/game-id.ts`：游戏源码模块。
- `src/Lantern/SplashScene.less`：视觉样式、布局、动画和响应式规则。
- `src/Lantern/Lantern.tsx`：React 组件和交互界面。
- `src/Lantern/types.ts`：游戏源码模块。
- `src/Lantern/constants.ts`：游戏源码模块。
- `src/Lantern/Lantern.less`：视觉样式、布局、动画和响应式规则。
- `src/Lantern/index.ts`：游戏源码模块。
- `src/Lantern/utils/audio.ts`：游戏源码模块。

关键源码模块：

- `src/App.tsx`
- `src/main.tsx`
- `src/shared.d.ts`
- `src/vite-env.d.ts`
- `src/game-id.ts`
- `src/Lantern/SplashScene.less`
- `src/Lantern/Lantern.tsx`
- `src/Lantern/types.ts`
- `src/Lantern/constants.ts`
- `src/Lantern/Lantern.less`
- `src/Lantern/index.ts`
- `src/Lantern/utils/audio.ts`
- `src/Lantern/components/SplashScene.tsx`
- `src/Lantern/components/Scene.tsx`
- `src/Lantern/hooks/useGameLoop.ts`
- `src/Lantern/hooks/useJoystick.ts`
- `src/Lantern/i18n/index.ts`
- `src/shared/runtime/useGameStats.ts`
- `src/shared/runtime/useUpload.ts`
- `src/shared/runtime/useChat.ts`
- `src/shared/runtime/useGenImage.ts`
- `src/shared/runtime/bridge.ts`
- `src/shared/runtime/game-id.ts`
- `src/shared/runtime/useGameEvent.ts`

## 3. 核心模块

- 状态管理与节奏：通过 React 状态与定时器处理倒计时、阶段推进或生成节奏。
- 渲染方式：Canvas/WebGL，样式由 CSS/Less 和组件结构共同完成。
- 碰撞 / 更新：源码包含命中、距离、边界或重叠判断，结果会影响得分、生命或阶段。
- 音频：包含程序化音频或音频文件播放，按交互事件触发。
- 多语言：包含 i18n / locale 检测或 `t()` 文案函数。
- 存储：使用 localStorage、useGameSave 或 persist 保存分数、收藏、墙数据或本地状态。
- Aigram 运行时：接入 `@shared/runtime` 或平台桥接能力，用于用户、资料页、分享、通知或平台 API。
- 排行榜：源码包含分数提交、排名或榜单展示逻辑。

## 4. 扩展点

- 改玩法参数：优先查找 `src/` 内大写常量、hooks、主组件顶部配置或关卡数组。
- 换素材：替换 `public/`、`src/img/` 或源码 import 的图片/音频文件，并保持相对路径。
- 调视觉：修改主样式文件中的颜色、间距、动画时长、网格尺寸和响应式规则。
- 改文案：修改 i18n 字典、组件内标题按钮文案，保持 zh/en 同步。
- 加平台能力：在已有 `@shared/runtime`、useGameSave、排行榜、墙或通知调用附近扩展，避免另起一套存储。
