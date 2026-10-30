// ==========================================
//  画册后台管理页逻辑（admin.html）
//  依赖：supabase.min.js → common.js → 本文件
// ==========================================

// ==========================================
//  登录验证（Supabase）
// ==========================================

async function checkLogin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('viewList').style.display = 'none';
    document.getElementById('viewEdit').style.display = 'none';
  } else {
    showListView();
  }
}

async function doLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) {
      let msg = error.message;
      if (error.message.includes('Invalid login credentials')) {
        msg = '邮箱或密码错误';
      } else if (error.message.includes('Email not confirmed')) {
        msg = '邮箱还未验证，请先验证邮箱';
      }
      document.getElementById('loginError').textContent = msg;
      document.getElementById('loginError').style.display = 'block';
    } else {
      document.getElementById('loginView').style.display = 'none';
      showListView();
    }
  } catch(e) {
    document.getElementById('loginError').textContent = '登录出错: ' + e.message;
    document.getElementById('loginError').style.display = 'block';
  }
}

async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

// 设置下拉菜单
function toggleSettingsMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('settingsDropdown');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeSettingsMenu() {
  document.getElementById('settingsDropdown').style.display = 'none';
}
document.addEventListener('click', () => closeSettingsMenu());

// 批量导入下拉菜单
function toggleImportMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('importDropdown');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeImportMenu() {
  document.getElementById('importDropdown').style.display = 'none';
}
// 点击页面其他地方关闭批量导入下拉
document.addEventListener('click', () => closeImportMenu());

// 预览区是 iframe：内部点击事件不会冒泡到父页面，
// 需单独在 iframe 文档上绑定，点击预览区时也收起两个下拉菜单
function bindPreviewClose() {
  const frame = document.getElementById('previewFrame');
  if (!frame) return;
  try {
    const doc = frame.contentDocument;
    if (doc) {
      doc.addEventListener('click', () => {
        closeImportMenu();
        closeSettingsMenu();
      });
    }
  } catch(e) {
    lcWarn('bindPreviewClose: 访问预览 iframe 文档失败', e);
  }
}
const previewFrameEl = document.getElementById('previewFrame');
if (previewFrameEl) {
  previewFrameEl.addEventListener('load', bindPreviewClose);
}
bindPreviewClose();

// 预览设备切换：改变 iframe 视口尺寸获得真实移动端渲染，
// 并显式通知阅读器按新尺寸重建（不依赖 iframe resize 事件）
function bindDeviceToggle() {
  const toggle = document.querySelector('.preview-device-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.device-btn');
    if (!btn) return;
    toggle.querySelectorAll('.device-btn').forEach(b => b.classList.toggle('active', b === btn));
    previewFrameEl.classList.toggle('device-mobile', btn.dataset.mode === 'mobile');
    if (previewFrameEl.contentWindow) {
      try {
        previewFrameEl.contentWindow.postMessage({ type: 'lc-rebuild' }, '*');
      } catch(err) {
        lcWarn('通知预览重建失败', err);
      }
    }
  });
}
bindDeviceToggle();

// 批量链接导入
function openLinksImporter() {
  document.getElementById('linksEditor').value = '';
  document.getElementById('linksModal').style.display = 'flex';
}
function closeLinksImporter() {
  document.getElementById('linksModal').style.display = 'none';
}
async function applyLinksImporter() {
  const text = document.getElementById('linksEditor').value.trim();
  if (!text) { closeLinksImporter(); return; }
  const urls = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) { closeLinksImporter(); return; }

  config.cover.type = 'image';
  config.cover.image = urls[0];
  config.cover.html = '';

  config.backCover.type = 'image';
  config.backCover.image = urls[urls.length - 1];
  config.backCover.html = '';

  if (urls.length > 2) {
    config.pages = urls.slice(1, -1).map(u => ({ type: 'image', src: u, html: '' }));
  } else {
    config.pages = [];
  }

  render();
  await saveConfig();
  closeLinksImporter();
  alert(`已导入 ${urls.length} 个链接（封面1 / 内页${config.pages.length} / 封底1）`);
}

// 修改密码
function openChangePass() {
  document.getElementById('newPass').value = '';
  document.getElementById('confirmPass').value = '';
  document.getElementById('passError').style.display = 'none';
  document.getElementById('changePassModal').style.display = 'flex';
}
function closeChangePass() {
  document.getElementById('changePassModal').style.display = 'none';
}
async function saveChangePass() {
  const newPass = document.getElementById('newPass').value;
  const confirmPass = document.getElementById('confirmPass').value;
  const errEl = document.getElementById('passError');
  if (!newPass || newPass.length < 6) {
    errEl.textContent = '新密码至少 6 位';
    errEl.style.display = 'block';
    return;
  }
  if (newPass !== confirmPass) {
    errEl.textContent = '两次密码不一致';
    errEl.style.display = 'block';
    return;
  }
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) {
    errEl.textContent = '修改失败：' + error.message;
    errEl.style.display = 'block';
    return;
  }
  alert('密码修改成功，下次登录请用新密码');
  closeChangePass();
}

// ===== 轻提示 =====
let toastTimer = null;
function showToast(msg, duration = 2000) {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ===== 分享短链：短码在后台生成并随配置存库（阅读器只读复制，匿名访客无需写权限） =====
// 字符集去掉易混淆的 0/o、1/l/i
const SHORT_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genShortCode(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)];
  }
  return s;
}
async function shareCurrentBook() {
  if (!currentBookId || !config) {
    showToast('请先打开一本画册');
    return;
  }
  let code = config.shareCode;
  if (!code) {
    code = genShortCode(8);
    config.shareCode = code;
    await saveConfig();
  }
  const url = location.origin + '/s/' + code;
  const ok = await copyText(url);
  showToast(ok ? '分享链接已复制' : '复制失败，请手动复制：' + url, 3000);
}

// 页面加载先检查登录
checkLogin();

let config = null;
let currentBookId = null;
let currentEditingPage = 0; // 当前编辑的页码（0=封面，最后一页=封底）

// 列表页筛选状态（device 默认空 = 全部显示端）
const filterState = { category: '', sort: 'latest', device: '', featured: '', keyword: '' };
// 精选排序下的推荐画册列表（供列表页 ↑↓ 排序）
let featuredSortedList = [];
// 当前过滤排序后的列表（用于本地即时排序，乐观更新）
let currentList = [];

// ==========================================
//  多本画册管理（数据全部存 Supabase，不再使用 localStorage 索引）
// ==========================================

async function saveBookConfig(bookId, cfg) {
  // 冗余存储页数，供首页列表查询瘦身（无需全量拉取 pages 即可显示页数）
  cfg.pageCount = (cfg.pages || []).length;
  await supabase
    .from('books')
    .update({ config: cfg, updated_at: new Date().toISOString() })
    .eq('id', bookId);
}

async function switchBook(bookId) {
  currentBookId = bookId;
  const { data, error } = await supabase
    .from('books')
    .select('config')
    .eq('id', bookId)
    .single();
  if (error || !data) {
    alert('加载失败: ' + (error?.message || '找不到画册'));
    return;
  }
  config = data.config;
  render();
  // 刷新预览
  const frame = document.getElementById('previewFrame');
  frame.src = 'book-ratio-adaptive.html?book=' + bookId;
}

async function newBook() {
  const { data, error } = await supabase
    .from('books')
    .insert({ name: '未命名画册', config: DEFAULT_CONFIG })
    .select()
    .single();
  if (error) {
    alert('创建失败: ' + error.message);
    return;
  }
  currentBookId = data.id;
  config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  render();
  document.getElementById('viewList').style.display = 'none';
  document.getElementById('viewEdit').style.display = 'flex';
  const frame = document.getElementById('previewFrame');
  frame.src = 'book-ratio-adaptive.html?book=' + data.id;
}

async function deleteBook(bookId) {
  const id = bookId || currentBookId;
  if (!confirm('确定删除？此操作不可恢复')) return;
  const { error } = await supabase.from('books').delete().eq('id', id);
  if (error) {
    alert('删除失败: ' + error.message);
    return;
  }
  showListView();
}

async function duplicateBook() {
  const { data: old, error: loadErr } = await supabase
    .from('books')
    .select('name, config')
    .eq('id', currentBookId)
    .single();
  if (loadErr || !old) {
    alert('找不到原画册: ' + (loadErr?.message || ''));
    return;
  }
  const name = prompt('复制为：', old.name + ' 副本');
  if (!name) return;
  const { data: newBook, error } = await supabase
    .from('books')
    .insert({ name, config: old.config })
    .select()
    .single();
  if (error) {
    alert('复制失败: ' + error.message);
    return;
  }
  currentBookId = newBook.id;
  config = JSON.parse(JSON.stringify(old.config));
  render();
  showEditView();
}

// ==========================================
//  配置读写（当前选中的画册）
// ==========================================
async function saveConfig() {
  try {
    await saveBookConfig(currentBookId, config);
  } catch(e) {
    console.warn('保存失败: ', e && e.message);
    return; // 保存失败不刷新预览，避免误导
  }
  // 预览不再整页刷新：向 iframe 推送最新配置，由阅读器本地重建（保留翻页位置，图片不再重载）
  const frame = document.getElementById('previewFrame');
  if (frame && frame.contentWindow) {
    try {
      frame.contentWindow.postMessage({ type: 'lc-config-update', config: config }, '*');
    } catch(e) {
      lcWarn('saveConfig: 向预览 iframe postMessage 失败', e);
    }
  }
}

// ==========================================
//  渲染表单
// ==========================================
function render() {
  // 全局
  document.getElementById('bgColor').value = config.background.color;
  document.getElementById('bgImage').value = config.background.image;
  document.getElementById('ratioW').value = config.bookRatio.w;
  document.getElementById('ratioH').value = config.bookRatio.h;
  document.getElementById('showMobile').checked = config.showOn?.mobile !== false;
  document.getElementById('showPc').checked = config.showOn?.pc !== false;
  document.getElementById('bookFeatured').checked = !!config.featured;
  document.getElementById('showIndexIcon').checked = config.showIndexIcon !== false;
  document.getElementById('bookCategory').value = config.category || '';
  document.getElementById('musicUrl').value = config.music?.url || '';
  document.getElementById('musicVolume').value = config.music?.volume || 0.5;
  document.getElementById('musicVolumeText').innerText = config.music?.volume || 0.5;
  document.getElementById('musicStartPage').value = config.music?.startPage || 1;

  // 封面
  document.getElementById('coverImage').value = config.cover.image;
  setCoverType(config.cover.type || 'image', false);

  // 内页
  renderPages();

  // 封底
  setBackType(config.backCover.type, false);
  document.getElementById('backImage').value = config.backCover.image;

  // 更新缩略图
  updateBgThumb();
  updateCoverThumb();
  updateBackThumb();

  // 绑定封面 HTML 按钮
  const coverBtn = document.getElementById('coverHtmlBtn');
  if (coverBtn) {
    coverBtn.onclick = () => openCoverHtmlEditor();
    coverBtn.textContent = config.cover.html ? '已编辑，点击修改' : '点击编辑HTML内容';
  }
  // 绑定封底 HTML 按钮
  const backBtn = document.getElementById('backHtmlBtn');
  if (backBtn) {
    backBtn.onclick = () => openBackHtmlEditor();
    backBtn.textContent = config.backCover.html ? '已编辑，点击修改' : '点击编辑HTML内容';
  }
}

function renderPages() {
  const list = document.getElementById('pagesList');
  list.innerHTML = '';
  config.pages.forEach((page, idx) => {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.onmousedown = () => { jumpToPage(Math.floor((idx + 2) / 2)); };
    card.innerHTML = `
      <div class="page-card-header">
        <div class="page-card-title">第 ${idx + 1} 页</div>
        <div class="page-card-actions">
          <button onclick="movePage(${idx}, -1)" title="上移">↑</button>
          <button onclick="movePage(${idx}, 1)" title="下移">↓</button>
          <button class="delete" onclick="removePage(${idx})" title="删除">✕</button>
        </div>
      </div>
      <div class="type-toggle">
        <button class="${page.type === 'image' ? 'active' : ''}" onclick="setPageType(${idx}, 'image')">纯图片</button>
        <button class="${page.type === 'html' ? 'active' : ''}" onclick="setPageType(${idx}, 'html')">HTML 内容</button>
      </div>
      <div id="page-${idx}-imageWrap" style="${page.type === 'image' ? '' : 'display:none'}">
        <div class="form-row">
          <label>图片</label>
          <div class="thumb-row thumb-row--top">
            <div id="page-${idx}-thumb" class="page-thumb">
              ${page.src ? `<img src="${page.src}" class="thumb-img">` : '<span class="thumb-empty">空</span>'}
            </div>
            <div class="page-input-row">
              <input type="text" value="${page.src || ''}" placeholder="粘贴链接或上传" oninput="setPageSrc(${idx}, this.value); updateThumb(${idx});" class="input-flex">
              <button class="upload-btn compact" onclick="document.getElementById('pageUpload-${idx}').click()">📁</button>
            </div>
          </div>
          <input type="file" id="pageUpload-${idx}" accept="image/*" class="file-hidden" onchange="handleUpload(event, null, ${idx})">
        </div>
      </div>
      <div id="page-${idx}-htmlWrap" style="${page.type === 'html' ? '' : 'display:none'}">
        <div class="form-row">
          <label>HTML 内容</label>
          <button id="page-${idx}-htmlBtn" class="html-edit-btn">
            ${page.html ? '已编辑，点击修改' : '点击编辑HTML内容'}
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
    // 绑定 HTML 编辑按钮
    const htmlBtn = document.getElementById(`page-${idx}-htmlBtn`);
    if (htmlBtn) {
      htmlBtn.onclick = () => openHtmlEditor(idx);
    }
    // 卡片下面的插入按钮
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = 'display:block; margin:8px auto; width:22px; height:22px; line-height:20px; padding:0; border:none; border-radius:50%; background:#333; color:#888; font-size:14px; cursor:pointer; text-align:center;';
    addBtn.onmouseover = () => { addBtn.style.background = '#6c5ce7'; addBtn.style.color = '#fff'; };
    addBtn.onmouseout = () => { addBtn.style.background = '#333'; addBtn.style.color = '#888'; };
    addBtn.onclick = () => insertPageAfter(idx);
    list.appendChild(addBtn);
  });
  document.getElementById('pageCount').textContent = config.pages.length;
}

// ==========================================
//  操作
// ==========================================
function setCoverType(type, save = true) {
  config.cover.type = type;
  document.getElementById('coverTypeHtml').classList.toggle('active', type === 'html');
  document.getElementById('coverTypeImage').classList.toggle('active', type === 'image');
  document.getElementById('coverHtmlWrap').style.display = type === 'html' ? '' : 'none';
  document.getElementById('coverImageWrap').style.display = type === 'image' ? '' : 'none';
  if (save) updateConfig();
}

function setBackType(type, save = true) {
  config.backCover.type = type;
  document.getElementById('backTypeHtml').classList.toggle('active', type === 'html');
  document.getElementById('backTypeImage').classList.toggle('active', type === 'image');
  document.getElementById('backHtmlWrap').style.display = type === 'html' ? '' : 'none';
  document.getElementById('backImageWrap').style.display = type === 'image' ? '' : 'none';
  if (save) updateConfig();
}

function addPage() {
  config.pages.push({ type: 'image', src: '' });
  renderPages();
  updateConfig();
}

// 在指定位置后面插入新页
function insertPageAfter(idx) {
  config.pages.splice(idx + 1, 0, { type: 'image', src: '' });
  renderPages();
  updateConfig();
}

// HTML 弹窗编辑
let editingType = ''; // 'cover' | 'page' | 'back'
let editingPageIdx = null;
function openHtmlEditor(idx) {
  editingType = 'page';
  editingPageIdx = idx;
  document.getElementById('htmlEditor').value = config.pages[idx].html || '';
  document.getElementById('htmlModal').style.display = 'flex';
  refreshHtmlTplList();
}
function openCoverHtmlEditor() {
  editingType = 'cover';
  document.getElementById('htmlEditor').value = config.cover.html || '';
  document.getElementById('htmlModal').style.display = 'flex';
  refreshHtmlTplList();
}
function openBackHtmlEditor() {
  editingType = 'back';
  document.getElementById('htmlEditor').value = config.backCover.html || '';
  document.getElementById('htmlModal').style.display = 'flex';
  refreshHtmlTplList();
}
function closeHtmlEditor() {
  document.getElementById('htmlModal').style.display = 'none';
  editingType = '';
  editingPageIdx = null;
}
function saveHtmlEditor() {
  const val = document.getElementById('htmlEditor').value;
  if (editingType === 'page') {
    config.pages[editingPageIdx].html = val;
    const btn = document.getElementById(`page-${editingPageIdx}-htmlBtn`);
    if (btn) btn.textContent = val ? '已编辑，点击修改' : '点击编辑HTML内容';
  } else if (editingType === 'cover') {
    config.cover.html = val;
    const btn = document.getElementById('coverHtmlBtn');
    if (btn) btn.textContent = val ? '已编辑，点击修改' : '点击编辑HTML内容';
  } else if (editingType === 'back') {
    config.backCover.html = val;
    const btn = document.getElementById('backHtmlBtn');
    if (btn) btn.textContent = val ? '已编辑，点击修改' : '点击编辑HTML内容';
  }
  updateConfig();
  closeHtmlEditor();
}

// ==========================================
//  素材库：HTML 模板 + 图片库
// ==========================================
let tplList = [];
let tplCategory = 'cover';
let assetsTab = 'tpl';
let editingTplId = null;
const MATERIAL_BUCKET = 'materials';

async function loadTemplates() {
  const { data, error } = await supabase
    .from('book_templates')
    .select('id, name, category, html')
    .order('created_at', { ascending: true });
  if (error) { lcWarn('loadTemplates', error); return; }
  tplList = data || [];
  renderTplList();
}

function openAssets() {
  document.getElementById('assetsModal').style.display = 'flex';
  switchAssetsTab(assetsTab || 'tpl');
  switchTplCat(tplCategory);
}
function closeAssets() {
  document.getElementById('assetsModal').style.display = 'none';
}

function switchAssetsTab(tab) {
  assetsTab = tab;
  const tplBtn = document.getElementById('assetsTabTpl');
  const imgBtn = document.getElementById('assetsTabImg');
  if (tab === 'tpl') {
    tplBtn.style.background = '#6c5ce7'; tplBtn.style.color = '#fff';
    imgBtn.style.background = '#333'; imgBtn.style.color = '#aaa';
    document.getElementById('assetsTplPanel').style.display = '';
    document.getElementById('assetsImgPanel').style.display = 'none';
  } else {
    imgBtn.style.background = '#6c5ce7'; imgBtn.style.color = '#fff';
    tplBtn.style.background = '#333'; tplBtn.style.color = '#aaa';
    document.getElementById('assetsTplPanel').style.display = 'none';
    document.getElementById('assetsImgPanel').style.display = '';
    loadMaterials();
  }
}

function switchTplCat(cat) {
  tplCategory = cat;
  const map = { cover: 'tplCatCover', page: 'tplCatPage', back: 'tplCatBack' };
  Object.keys(map).forEach(c => {
    const btn = document.getElementById(map[c]);
    if (!btn) return;
    btn.style.background = c === cat ? '#6c5ce7' : '#2a2a3c';
    btn.style.color = c === cat ? '#fff' : '#ccc';
  });
  renderTplList();
}

function renderTplList() {
  const box = document.getElementById('tplList');
  if (!box) return;
  const list = tplList.filter(t => t.category === tplCategory);
  if (!list.length) {
    box.innerHTML = '<div class="list-empty">该分类还没有模板，点击「+ 新增模板」创建</div>';
    return;
  }
  box.innerHTML = list.map(t => `
    <div class="tpl-item">
      <div class="tpl-item-name">${t.name}</div>
      <button onclick="openTplEditor('${t.id}')" class="tpl-item-btn">编辑</button>
      <button onclick="deleteTpl('${t.id}')" class="tpl-item-btn tpl-item-btn--danger">删除</button>
    </div>`).join('');
}

function openTplEditor(id) {
  editingTplId = id || null;
  const tpl = id ? tplList.find(t => t.id === id) : null;
  document.getElementById('tplEditorTitle').textContent = tpl ? '编辑模板' : '新增模板';
  document.getElementById('tplName').value = tpl ? tpl.name : '';
  document.getElementById('tplHtml').value = tpl ? tpl.html : '';
  document.getElementById('tplEditorModal').style.display = 'flex';
}
function closeTplEditor() {
  document.getElementById('tplEditorModal').style.display = 'none';
  editingTplId = null;
}
async function saveTpl() {
  const name = document.getElementById('tplName').value.trim();
  const html = document.getElementById('tplHtml').value;
  if (!name) { alert('请填写模板名称'); return; }
  const row = { name, category: tplCategory, html };
  if (editingTplId) {
    const { error } = await supabase.from('book_templates').update(row).eq('id', editingTplId);
    if (error) { alert('保存失败：' + error.message); return; }
  } else {
    const { error } = await supabase.from('book_templates').insert(row);
    if (error) { alert('保存失败：' + error.message); return; }
  }
  closeTplEditor();
  loadTemplates();
}
async function deleteTpl(id) {
  if (!confirm('确定删除该模板？')) return;
  const { error } = await supabase.from('book_templates').delete().eq('id', id);
  if (error) { alert('删除失败：' + error.message); return; }
  loadTemplates();
}

// 套用模板（封面/内页/封底编辑弹窗里）
function refreshHtmlTplList() {
  const box = document.getElementById('htmlTplList');
  if (!box) return;
  const cat = editingType === 'cover' ? 'cover' : editingType === 'back' ? 'back' : 'page';
  const list = tplList.filter(t => t.category === cat);
  if (!list.length) {
    box.innerHTML = '<span class="tpl-chip-empty">暂无模板，可到「素材库」新增</span>';
    return;
  }
  box.innerHTML = list.map(t => `
    <button onclick="applyTpl('${t.id}')" class="tpl-chip">${t.name}</button>`).join('');
}
function applyTpl(id) {
  const tpl = tplList.find(t => t.id === id);
  if (!tpl) return;
  document.getElementById('htmlEditor').value = tpl.html;
}

// 图片库
async function loadMaterials() {
  const box = document.getElementById('materialList');
  if (!box) return;
  box.innerHTML = '<div class="list-empty">加载中…</div>';
  const { data, error } = await supabase.storage.from(MATERIAL_BUCKET).list('');
  if (error || !data) {
    box.innerHTML = '<div class="list-empty list-empty--error">图片加载失败：' + (error && error.message || '未知错误') + '。请确认已执行建表 SQL（素材库图片桶）</div>';
    return;
  }
  const imgs = data.filter(f => f.metadata && /^image\//.test(f.metadata.mimetype || ''));
  if (!imgs.length) {
    box.innerHTML = '<div class="list-empty">还没有素材图片，点击「+ 上传图片」添加</div>';
    return;
  }
  box.innerHTML = imgs.map(f => {
    const url = supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(f.name).data.publicUrl;
    return `
      <div class="material-item">
        <img src="${url}" class="material-img" onerror="this.style.display='none'">
        <div class="material-info">
          <div class="material-name">${f.name}</div>
          <div class="material-actions">
            <button onclick="copyMaterialLink('${f.name}')" class="material-btn-primary">复制链接</button>
            <button onclick="deleteMaterial('${f.name}')" class="material-btn-danger">删除</button>
          </div>
        </div>
      </div>`;
  }).join('');
}
async function uploadMaterials(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  let ok = 0, fail = 0;
  for (const file of files) {
    const path = Date.now() + '_' + file.name.replace(/[^\w.\-一-龥]/g, '_');
    const { error } = await supabase.storage.from(MATERIAL_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) fail++; else ok++;
  }
  loadMaterials();
  e.target.value = '';
  alert('上传完成：成功 ' + ok + ' 张' + (fail ? '，失败 ' + fail + ' 张' : ''));
}
async function copyMaterialLink(name) {
  const url = supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(name).data.publicUrl;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    alert('链接已复制');
  } catch(e2) {
    alert('复制失败，请手动复制：' + url);
  }
}
async function deleteMaterial(name) {
  if (!confirm('确定删除该图片？模板中引用它的链接将失效。')) return;
  const { error } = await supabase.storage.from(MATERIAL_BUCKET).remove([name]);
  if (error) { alert('删除失败：' + error.message); return; }
  loadMaterials();
}

function removePage(idx) {
  config.pages.splice(idx, 1);
  renderPages();
  updateConfig();
}

function movePage(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= config.pages.length) return;
  [config.pages[idx], config.pages[newIdx]] = [config.pages[newIdx], config.pages[idx]];
  renderPages();
  updateConfig();
}

function setPageType(idx, type) {
  config.pages[idx].type = type;
  renderPages();
  updateConfig();
}

function setPageSrc(idx, src) {
  config.pages[idx].src = src;
  updateConfig();
}

function setPageHtml(idx, html) {
  config.pages[idx].html = html;
  updateConfig();
}

// ==========================================
//  汇总更新
// ==========================================
let updateTimer;
function updateConfig() {
  // 从表单读回值
  config.background.color = document.getElementById('bgColor').value;
  config.background.image = document.getElementById('bgImage').value.trim();
  config.bookRatio.w = parseInt(document.getElementById('ratioW').value) || 420;
  config.bookRatio.h = parseInt(document.getElementById('ratioH').value) || 560;
  config.showOn = {
    mobile: document.getElementById('showMobile').checked,
    pc: document.getElementById('showPc').checked
  };
  config.featured = document.getElementById('bookFeatured').checked;
  config.showIndexIcon = document.getElementById('showIndexIcon').checked;
  config.category = document.getElementById('bookCategory').value.trim();
  config.music = {
    url: document.getElementById('musicUrl').value.trim(),
    volume: parseFloat(document.getElementById('musicVolume').value),
    startPage: parseInt(document.getElementById('musicStartPage').value) || 1
  };
  config.cover.image = document.getElementById('coverImage').value;
  config.backCover.image = document.getElementById('backImage').value;

  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    saveConfig();
  }, 300);
}

// ==========================================
//  图片上传：本地选图 → 压缩 → base64
// ==========================================
async function handleUpload(event, inputId, pageIdx) {
  const file = event.target.files[0];
  if (!file) return;

  // 检查文件大小（原图不超过 10MB）
  if (file.size > 10 * 1024 * 1024) {
    alert('图片太大了，请选 10MB 以内的图片');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const img = new Image();
    img.onload = async () => {
      const lqip = makeLqip(img);

      // 压缩：最大宽度 800px，保持比例
      const maxW = 800;
      let w = img.width, h = img.height;
      if (w > maxW) {
        h = h * maxW / w;
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const { blob, ext, mime } = await canvasToBlob(canvas, 0.8);

      try {
        const publicUrl = await uploadToStorage(blob, ext, mime);

        // 填入对应位置（lqip 一并存入 config）
        if (inputId === 'coverImage') {
          config.cover.lqip = lqip;
          document.getElementById(inputId).value = publicUrl;
          updateCoverThumb();
        } else if (inputId === 'backImage') {
          config.backCover.lqip = lqip;
          document.getElementById(inputId).value = publicUrl;
          updateBackThumb();
        } else if (pageIdx !== null && pageIdx !== undefined) {
          // 内页：更新 config 并重新渲染
          config.pages[pageIdx].src = publicUrl;
          config.pages[pageIdx].lqip = lqip;
          // 更新输入框的值（不整个重渲染，避免上传时页面跳动）
          const wrap = document.getElementById(`page-${pageIdx}-imageWrap`);
          if (wrap) {
            const input = wrap.querySelector('input[type="text"]');
            if (input) input.value = publicUrl;
          }
          updateThumb(pageIdx);
        }
        updateConfig();
      } catch(err) {
        showToast('上传失败：' + err.message);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // 清空 input，允许重复选同一个文件
  event.target.value = '';
}

async function handleMusicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('音乐文件太大了，请选 10MB 以内的');
    event.target.value = '';
    return;
  }

  // 上传到 Supabase Storage
  const fileName = `${currentBookId}/music_${Date.now()}.mp3`;
  const { data, error } = await supabase.storage
    .from('book-images')
    .upload(fileName, file, { contentType: 'audio/mpeg' });

  if (error) {
    alert('上传失败：' + error.message);
    return;
  }

  // 拿到公开 URL
  const { data: { publicUrl } } = supabase.storage
    .from('book-images')
    .getPublicUrl(fileName);

  document.getElementById('musicUrl').value = publicUrl;
  updateConfig();
  event.target.value = '';
}

// ==========================================
//  背景图片上传
// ==========================================
async function handleBgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('图片太大了，请选 10MB 以内的图片');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      // 背景图最大宽度 1920
      const maxW = 1920;
      let w = img.width, h = img.height;
      if (w > maxW) {
        h = h * maxW / w;
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const { blob, ext, mime } = await canvasToBlob(canvas, 0.8);

      try {
        const publicUrl = await uploadToStorage(blob, ext, mime);
        document.getElementById('bgImage').value = publicUrl;
        updateBgThumb();
        updateConfig();
      } catch(err) {
        showToast('背景图上传失败：' + err.message);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// 点击卡片直接跳转预览页：优先 postMessage 无刷新跳页（保留设备模式与音乐播放状态），
// iframe 尚未加载画册时回退为带参整页加载
function jumpToPage(page) {
  currentEditingPage = page;
  const frame = document.getElementById('previewFrame');
  if (frame && frame.contentWindow && /book=/.test(frame.src)) {
    try {
      frame.contentWindow.postMessage({ type: 'lc-goto-page', page: page }, '*');
      return;
    } catch(e) {
      lcWarn('jumpToPage: postMessage 跳页失败，回退整页加载', e);
    }
  }
  frame.src = 'book-ratio-adaptive.html?book=' + currentBookId + '&page=' + page;
}

// 更新内页缩略图
function updateThumb(idx) {
  const thumb = document.getElementById(`page-${idx}-thumb`);
  if (!thumb) return;
  const src = config.pages[idx].src;
  thumb.innerHTML = src
    ? `<img src="${src}" class="thumb-img">`
    : '<span class="thumb-empty">空</span>';
}

// 更新背景缩略图
function updateBgThumb() {
  const thumb = document.getElementById('bgThumb');
  if (!thumb) return;
  const src = config.background.image;
  thumb.innerHTML = src
    ? `<img src="${src}" class="thumb-img">`
    : '<span class="thumb-empty">空</span>';
}

// 更新封面/封底缩略图
function updateCoverThumb() {
  const thumb = document.getElementById('coverThumb');
  if (!thumb) return;
  const src = config.cover.image;
  thumb.innerHTML = src
    ? `<img src="${src}" class="thumb-img">`
    : '<span class="thumb-empty">空</span>';
}
function updateBackThumb() {
  const thumb = document.getElementById('backThumb');
  if (!thumb) return;
  const src = config.backCover.image;
  thumb.innerHTML = src
    ? `<img src="${src}" class="thumb-img">`
    : '<span class="thumb-empty">空</span>';
}

// 生成 LQIP（超小模糊占位图，base64 约 1~2KB）：用于阅读器图片加载前的占位
function makeLqip(img) {
  try {
    const c = document.createElement('canvas');
    const lw = 24;
    c.width = lw;
    c.height = Math.max(1, Math.round(img.height * lw / img.width));
    const cx = c.getContext('2d');
    cx.filter = 'blur(1px)';
    cx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.4);
  } catch(e) {
    return '';
  }
}

// 通用压缩输出：WebP 优先（体积约省 30%），浏览器不支持编码时回退 JPEG
async function canvasToBlob(canvas, quality) {
  const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  if (webp) return { blob: webp, ext: 'webp', mime: 'image/webp' };
  const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { blob: jpeg, ext: 'jpg', mime: 'image/jpeg' };
}

// 上传 Blob 到 book-images 桶并返回公开 URL
async function uploadToStorage(blob, ext, mime) {
  const fileName = `${currentBookId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('book-images')
    .upload(fileName, blob, { contentType: mime });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from('book-images')
    .getPublicUrl(fileName);
  return publicUrl;
}

// ==========================================
//  批量导入 / 预览
// ==========================================
async function importImages(event) {
  const files = Array.from(event.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (files.length === 0) return;

  showToast(`共 ${files.length} 张：第1张→封面，最后1张→封底，中间→内页，开始上传...`, 3000);

  // 压缩图片并上传到 Storage，返回 { src, lqip }
  const compressAndUpload = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          const lqip = makeLqip(img);

          const canvas = document.createElement('canvas');
          const maxW = 800;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const { blob, ext, mime } = await canvasToBlob(canvas, 0.8);

          try {
            const publicUrl = await uploadToStorage(blob, ext, mime);
            resolve({ src: publicUrl, lqip });
          } catch(err) {
            showToast('上传失败：' + err.message);
            resolve({ src: '', lqip: '' });
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理所有图片
  const images = [];
  for (let i = 0; i < files.length; i++) {
    showToast(`正在上传第 ${i + 1} / ${files.length} 张...`);
    images.push(await compressAndUpload(files[i]));
  }

  // 分配：第一张封面，最后一张封底，中间内页（每张附带 LQIP 占位图）
  config.cover.type = 'image';
  config.cover.image = images[0].src;
  config.cover.lqip = images[0].lqip;
  config.cover.html = '';

  config.backCover.type = 'image';
  config.backCover.image = images[images.length - 1].src;
  config.backCover.lqip = images[images.length - 1].lqip;
  config.backCover.html = '';

  // 中间的图片作为内页
  if (images.length > 2) {
    config.pages = images.slice(1, -1).map(im => ({ type: 'image', src: im.src, html: '', lqip: im.lqip }));
  } else {
    config.pages = [];
  }

  render();
  await saveConfig();
  showToast(`导入完成：封面 1 / 内页 ${config.pages.length} / 封底 1`);
  event.target.value = ''; // 清空 input，允许重复选择
}

function openPreview() {
  updateConfig();
  window.open('book-ratio-adaptive.html?book=' + currentBookId, '_blank');
}

// ==========================================
//  视图切换
// ==========================================
function showListView() {
  document.getElementById('viewEdit').style.display = 'none';
  document.getElementById('viewList').style.display = '';
  renderBooksGrid();
  loadTemplates();
}

function showEditView() {
  document.getElementById('viewList').style.display = 'none';
  document.getElementById('viewEdit').style.display = 'flex';
  // 刷新预览 iframe
  const frame = document.getElementById('previewFrame');
  frame.src = 'book-ratio-adaptive.html?book=' + currentBookId;
}

function editBook(bookId) {
  switchBook(bookId);
  showEditView();
}

async function renderBooksGrid() {
  const grid = document.getElementById('booksGrid');
  grid.innerHTML = '<div class="grid-empty">加载中...</div>';

  const { data: books, error } = await supabase
    .from('books')
    .select('id,name,updated_at,config')
    .order('updated_at', { ascending: false });

  if (error) {
    grid.innerHTML = '<div class="grid-empty grid-empty--error">加载失败: ' + error.message + '</div>';
    return;
  }

  if (!books || books.length === 0) {
    grid.innerHTML = '<div class="grid-empty">暂无画册，点右上角新建</div>';
    updateFilterCount(0);
    return;
  }

  // 填充分类下拉选项（数据每次刷新，保留当前选择，分类消失则回退全部）
  const prev = filterState.category;
  const cats = [...new Set(books.map(b => (b.config?.category || '')).filter(Boolean))];
  filterState.category = cats.includes(prev) ? prev : '';
  catSelect.setOptions([{ value: '', label: '全部分类' }].concat(cats.map(c => ({ value: c, label: c }))));
  const catLabel = document.getElementById('csCategoryLabel');
  if (catLabel) catLabel.textContent = filterState.category || '全部分类';

  // 分类输入提示（datalist）：从当前画册数据收集已存在的分类
  const datalist = document.getElementById('categoryList');
  if (datalist) {
    datalist.innerHTML = '';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      datalist.appendChild(opt);
    });
  }

  // 应用筛选条件（组合生效）
  let list = books.filter(b => {
    const cfg = b.config || {};
    if (filterState.category && cfg.category !== filterState.category) return false;
    if (filterState.device === 'mobile' && cfg.showOn?.mobile === false) return false;
    if (filterState.device === 'pc' && cfg.showOn?.pc === false) return false;
    if (filterState.featured === 'yes' && !cfg.featured) return false;
    if (filterState.featured === 'no' && cfg.featured) return false;
    if (filterState.keyword && !(b.name || '').toLowerCase().includes(filterState.keyword.toLowerCase())) return false;
    return true;
  });

  // 精选画册视图：只显示已推荐的画册，按 featuredOrder 升序（未设置按更新时间兜底）
  if (filterState.sort === 'featured') {
    list = list.filter(b => b.config?.featured).sort((a, b) => {
      const ao = (a.config?.featuredOrder != null) ? a.config.featuredOrder : Infinity;
      const bo = (b.config?.featuredOrder != null) ? b.config.featuredOrder : Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  }

  // 推荐画册精选顺序（任何视图下显示「精选 N」角标；供列表页 ↑↓ 排序）
  featuredSortedList = books.filter(b => b.config?.featured).sort((a, b) => {
    const ao = (a.config?.featuredOrder != null) ? a.config.featuredOrder : Infinity;
    const bo = (b.config?.featuredOrder != null) ? b.config.featuredOrder : Infinity;
    if (ao !== bo) return ao - bo;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  updateFilterCount(list.length);
  currentList = list;
  renderGrid(list);
}

function renderGrid(list) {
  const grid = document.getElementById('booksGrid');
  if (list.length === 0) {
    grid.innerHTML = '<div class="grid-empty">没有符合条件的画册，试试调整筛选条件</div>';
    return;
  }

  grid.innerHTML = '';
  list.forEach(book => {
    const cfg = book.config || {};
    let coverHtml = '<div class="book-cover-placeholder">📖</div>';
    const isHtmlCover = cfg.cover?.type === 'html' && !!cfg.cover?.html;
    if (isHtmlCover) {
      coverHtml = `<div class="book-cover-html" data-tpl="${encodeURIComponent(cfg.cover.html)}"></div>`;
    } else {
      const coverSrc = cfg.cover?.image || '';
      // 超大 base64 封面（>300KB）不直接渲染，避免浏览器解码卡顿
      const isHugeBase64 = coverSrc.startsWith('data:image') && coverSrc.length > 300000;
      if (coverSrc && !isHugeBase64) {
        coverHtml = `<img src="${coverSrc}" alt="" loading="lazy" decoding="async">`;
      }
    }
    const d = new Date(book.updated_at);
    const timeStr = `${d.getMonth()+1}月${d.getDate()}日`;
    const pageCount = (cfg.pages || []).length;
    const showOn = cfg.showOn || { mobile: true, pc: true };
    const mobileColor = showOn.mobile ? '#333' : '#ccc';
    const pcColor = showOn.pc ? '#333' : '#ccc';
    const mobileIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${mobileColor}" stroke-width="2" class="device-icon"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
    const pcIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${pcColor}" stroke-width="2" class="device-icon"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

    const card = document.createElement('div');
    card.className = 'book-card';
    const isFeaturedBook = !!cfg.featured;
    const featuredIdx = isFeaturedBook ? featuredSortedList.findIndex(b => b.id === book.id) + 1 : 0;
    card.innerHTML = `
      <div class="book-cover" onclick="editBook('${book.id}')">
        ${coverHtml}
        ${isFeaturedBook ? `<div class="cover-badge">精选 ${featuredIdx}</div>` : ''}
        ${(filterState.sort === 'featured' && isFeaturedBook) ? `
          <div class="cover-move">
            <button title="上移" onclick="event.stopPropagation(); moveFeatured('${book.id}', -1)">↑</button>
            <button title="下移" onclick="event.stopPropagation(); moveFeatured('${book.id}', 1)">↓</button>
          </div>
        ` : ''}
      </div>
      <div class="book-info">
        <div class="book-name" onclick="renameBook('${book.id}')" title="点击改名">${book.name} ✏️</div>
        <div class="book-meta">更新于 ${timeStr} · ${pageCount} 页 · ${mobileIcon} ${pcIcon}</div>
      </div>
      <div class="book-actions">
        <button onclick="editBook('${book.id}')">编辑</button>
        <button onclick="duplicateBookFromList('${book.id}')">复制</button>
        <button class="danger" onclick="deleteBookFromList('${book.id}')">删除</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // HTML 封面：注入模板（Shadow DOM 隔离）
  grid.querySelectorAll('.book-cover-html').forEach(c => {
    const root = c.attachShadow({ mode: 'open' });
    root.innerHTML = decodeURIComponent(c.dataset.tpl || '');
  });
}

function updateFilterCount(n) {
  const el = document.getElementById('filterCount');
  if (el) el.textContent = `共 ${n} 本`;
}

// 列表页 ↑↓ 调整精选画册顺序：本地即时换位（乐观更新），后台并行写库，不更新更新时间
async function moveFeatured(bookId, dir) {
  const idx = featuredSortedList.findIndex(b => b.id === bookId);
  if (idx < 0) return;
  const target = idx + dir;
  if (target < 0 || target >= featuredSortedList.length) return;

  // 本地立即交换（秒响应，不等网络）
  [featuredSortedList[idx], featuredSortedList[target]] = [featuredSortedList[target], featuredSortedList[idx]];
  const aId = featuredSortedList[idx].id;
  const bId = featuredSortedList[target].id;
  const li = currentList.findIndex(b => b.id === aId);
  const lj = currentList.findIndex(b => b.id === bId);
  if (li >= 0 && lj >= 0) {
    [currentList[li], currentList[lj]] = [currentList[lj], currentList[li]];
  }
  renderGrid(currentList);

  // 后台并行写库：重新编号所有推荐画册
  try {
    await Promise.all(featuredSortedList.map((book, i) => {
      const cfg = { ...(book.config || {}), featuredOrder: i + 1 };
      book.config = cfg; // 同步本地数据
      return supabase.from('books').update({ config: cfg }).eq('id', book.id);
    }));
  } catch(e) {
    console.warn('保存精选顺序失败: ', e && e.message);
    renderBooksGrid(); // 失败则重新拉取，恢复真实顺序
  }
}

function applyFilter() {
  filterState.keyword = (document.getElementById('filterKeyword').value || '').trim();
  const btn = document.getElementById('clearKeyword');
  if (btn) btn.style.display = filterState.keyword ? 'block' : 'none';
  renderBooksGrid();
}

function clearKeyword() {
  const kw = document.getElementById('filterKeyword');
  if (kw) kw.value = '';
  filterState.keyword = '';
  const btn = document.getElementById('clearKeyword');
  if (btn) btn.style.display = 'none';
  renderBooksGrid();
}

// ===== 自定义下拉组件（紧凑面板跟随页面样式，替代系统原生下拉面板） =====
const cselects = {};
function toggleCSelect(id, e) {
  if (e) e.stopPropagation();
  Object.keys(cselects).forEach(k => {
    if (k !== id) cselects[k].panel.style.display = 'none';
  });
  const cs = cselects[id];
  cs.panel.style.display = cs.panel.style.display === 'block' ? 'none' : 'block';
}
function closeAllCSelects() {
  Object.keys(cselects).forEach(k => { cselects[k].panel.style.display = 'none'; });
}
document.addEventListener('click', closeAllCSelects);

function buildCustomSelect(id, onChange) {
  const panel = document.getElementById(id + 'Panel');
  const label = document.getElementById(id + 'Label');
  cselects[id] = { panel };
  return {
    setOptions(list) {
      panel.innerHTML = '';
      list.forEach(opt => {
        const d = document.createElement('div');
        d.className = 'cselect-option';
        d.textContent = opt.label;
        d.onclick = () => {
          label.textContent = opt.label;
          panel.style.display = 'none';
          onChange(opt.value);
        };
        panel.appendChild(d);
      });
    }
  };
}

// 初始化筛选下拉
const catSelect = buildCustomSelect('csCategory', v => { filterState.category = v; renderBooksGrid(); });
catSelect.setOptions([{ value: '', label: '全部分类' }]);
const sortSelect = buildCustomSelect('csSort', v => { filterState.sort = v; renderBooksGrid(); });
sortSelect.setOptions([{ value: 'latest', label: '最新发布' }, { value: 'featured', label: '精选画册' }]);
const deviceSelect = buildCustomSelect('csDevice', v => { filterState.device = v; renderBooksGrid(); });
deviceSelect.setOptions([{ value: '', label: '全部显示端' }, { value: 'mobile', label: '移动端' }, { value: 'pc', label: 'PC端' }]);
const featuredSelect = buildCustomSelect('csFeatured', v => { filterState.featured = v; renderBooksGrid(); });
featuredSelect.setOptions([{ value: '', label: '全部状态' }, { value: 'yes', label: '已推荐' }, { value: 'no', label: '未推荐' }]);

// 搜索框事件：按回车或点按钮触发；手动删空输入时重置关键字并刷新
(function bindSearchEvents() {
  const kw = document.getElementById('filterKeyword');
  if (!kw) return;
  kw.addEventListener('keydown', e => {
    if (e.key === 'Enter') applyFilter();
  });
  kw.addEventListener('input', () => {
    const btn = document.getElementById('clearKeyword');
    if (btn) btn.style.display = kw.value ? 'block' : 'none';
    if (kw.value === '') {
      filterState.keyword = '';
      renderBooksGrid();
    }
  });
})();

async function renameBook(bookId) {
  const { data: book, error: loadErr } = await supabase
    .from('books')
    .select('name')
    .eq('id', bookId)
    .single();
  if (loadErr || !book) {
    alert('找不到画册: ' + (loadErr?.message || ''));
    return;
  }
  const name = prompt('画册名称：', book.name);
  if (!name || name === book.name) return;
  const { error } = await supabase
    .from('books')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', bookId);
  if (error) {
    alert('改名失败: ' + error.message);
    return;
  }
  renderBooksGrid();
}

function duplicateBookFromList(bookId) {
  currentBookId = bookId;
  duplicateBook();
}

function deleteBookFromList(bookId) {
  currentBookId = bookId;
  deleteBook();
}

// ==========================================
//  初始化
// ==========================================
config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
