# LC 画册系统

纯静态 + Supabase 的在线画册（Portfolio）系统，部署于 Netlify。

## 文件结构

| 文件 | 说明 |
|---|---|
| `index.html` + `css/index.css` + `js/index.js` | 首页画廊：画册列表、分类筛选、精选排序（带会话缓存） |
| `admin.html` + `css/admin.css` + `js/admin.js` | 后台管理：登录、多画册增删改、页面编辑、实时预览、批量导入、分享短码 |
| `book-ratio-adaptive.html` + `css/reader.css` + `js/reader.js` | 阅读器：翻页浏览（page-flip）、背景音乐、LQIP 模糊占位加载 |
| `common.css` | 公共样式：基础 reset、cselect 下拉组件（主题经 `--cs-*` CSS 变量在各页覆盖） |
| `common.js` | 公共脚本：Supabase 初始化、DEFAULT_CONFIG、copyText、lcWarn（三页共用） |
| `_redirects` | Netlify 短链规则：`/s/:code` → 阅读器 |

**引用顺序约定**：`supabase.min.js` → `common.js` → 页面自身 JS；`common.css` → 页面自身 CSS。HTML 不含内联 `<style>`/`<script>`（JS 运行时动态赋值的 style 除外）。

## 本地开发

任选一种静态服务器（必须 http，file:// 下 Supabase JS 会异常）：

```bash
python3 -m http.server 8080
# 或 npx serve
```

访问 `http://localhost:8080`（首页）/ `admin.html`（后台）。

## 数据结构（Supabase）

- 表 `books`：`id, name, config(jsonb), updated_at`。画册全部数据在 `config` 里（背景/比例/封面/内页 pages[]/封底/音乐/分类/featured/shareCode/lqip 等）。
- 表 `book_templates`：HTML 封面模板。
- Storage 桶 `book-images`（画册图片/音乐）、`materials`（素材库）。

### RLS 策略（安全基线，勿放松）

- 两张表：`select` 对所有人生效；`insert/update/delete` 仅 `authenticated`。
- Storage：读公开；写（insert/update/delete）仅 `authenticated`。

## 部署（Netlify）

推送即部署。修改 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 请改 `common.js`（三页共用，只改这一处）。

## 注意事项

- 阅读器为只读：分享短码由后台生成并随 config 存库（`config.shareCode`），前台不写数据库。
- 首页列表查询只取 config 的少量 JSON 路径字段；页数显示依赖保存时冗余写入的 `config.pageCount`。
- 图片上传统一压缩为 WebP（不支持时回退 JPEG），并生成 LQIP 小图存入 config 供阅读器占位。
