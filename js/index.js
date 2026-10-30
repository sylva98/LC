let allVisibleBooks = [];
let allCategories = [];
const filterState = { category: '', sort: 'featured', device: '', featured: '', keyword: '' };

// ===== 会话缓存：返回首页秒开 + 后台静默刷新（有变化才更新，无变化零打扰） =====
const BOOKS_CACHE_KEY = 'lc_books_cache_v1';
const BOOKS_SIG_KEY = BOOKS_CACHE_KEY + '_sig';

// 列表签名：画册新增/删除/更新时间/精选顺序变化，签名即变
function listSignature(books) {
  return (books || []).map(b => b.id + ':' + (b.updated_at || '') + ':' + (b.config?.featuredOrder ?? '')).join('|');
}

// 把查到的 books 应用到页面（设备过滤 + 分类填充 + 渲染）
function applyBooks(books) {
  if (!books || books.length === 0) return;
  // 按当前设备过滤「显示端」设置：移动端只显示 showOn.mobile !== false，PC 同理
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  const deviceKey = isMobile ? 'mobile' : 'pc';
  allVisibleBooks = books.filter(b => {
    const showOn = b.config?.showOn || {};
    return showOn[deviceKey] !== false;
  });

  // 填充分类（桌面下拉 + 移动端汉堡菜单），保留当前选择，分类消失则回退全部
  const prev = filterState.category;
  const cats = [...new Set(books.map(b => (b.config?.category || '')).filter(Boolean))];
  allCategories = cats;
  filterState.category = cats.includes(prev) ? prev : '';
  catSelect.setOptions([{ value: '', label: '全部分类' }].concat(cats.map(c => ({ value: c, label: c }))));
  const catLabel = document.getElementById('csCategoryLabel');
  if (catLabel) catLabel.textContent = filterState.category || '全部分类';
  renderMobileCategories();

  filterBooks();
}

async function loadBooks() {
  const gallery = document.getElementById('gallery');

  // 1) 会话缓存优先：返回首页时先用缓存渲染（秒开），后台再查最新
  let cachedBooks = null;
  try {
    const cached = sessionStorage.getItem(BOOKS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.books) && parsed.books.length) {
        cachedBooks = parsed.books;
        applyBooks(cachedBooks);
      }
    }
  } catch(e) { lcWarn('读取画册会话缓存失败', e); }

  // 2) 后台静默查询最新数据（瘦身：只取列表需要的字段，不拉取整份 config / pages / HTML 模板）
  const { data: raw, error } = await supabase
    .from('books')
    .select('id,name,updated_at,cover:config->cover,showOn:config->showOn,category:config->category,featured:config->featured,featuredOrder:config->featuredOrder,pageCount:config->pageCount,firstSrc:config->pages->0->src')
    .order('updated_at', { ascending: false });

  if (error || !raw) {
    return; // 查询失败：保留缓存渲染，静默不打扰
  }
  if (raw.length === 0) {
    // 后台确认真的没有画册：清缓存并提示
    try { sessionStorage.removeItem(BOOKS_CACHE_KEY); sessionStorage.removeItem(BOOKS_SIG_KEY); } catch(e) { lcWarn('清除画册会话缓存失败', e); }
    gallery.innerHTML = '<div class="empty">暂无画册</div>';
    return;
  }

  // 映射回原有结构，下游渲染代码无需改动
  const books = raw.map(b => ({
    id: b.id,
    name: b.name,
    updated_at: b.updated_at,
    config: {
      cover: b.cover,
      showOn: b.showOn,
      category: b.category,
      featured: b.featured,
      featuredOrder: b.featuredOrder,
      pageCount: b.pageCount,
      pages: b.firstSrc ? [{ src: b.firstSrc }] : []
    }
  }));

  // 3) 签名对比：数据没变则保持当前页面（零闪烁），变了才更新缓存 + 重渲染
  let prevSig = null;
  try { prevSig = sessionStorage.getItem(BOOKS_SIG_KEY); } catch(e) { lcWarn('读取画册列表签名失败', e); }
  const newSig = listSignature(books);
  if (cachedBooks && newSig === prevSig) {
    return;
  }
  try {
    sessionStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify({ books }));
    sessionStorage.setItem(BOOKS_SIG_KEY, newSig);
  } catch(e) { lcWarn('写入画册会话缓存失败', e); }
  applyBooks(books);
}

function filterBooks() {
  const gallery = document.getElementById('gallery');

  // 应用筛选条件（组合生效）
  let filtered = allVisibleBooks.filter(book => {
    const cfg = book.config || {};
    if (filterState.category && cfg.category !== filterState.category) return false;
    if (filterState.keyword && !(book.name || '').toLowerCase().includes(filterState.keyword.toLowerCase())) return false;
    return true;
  });

  // 推荐画册精选顺序（任何视图下显示「精选 N」角标）
  const featuredList = allVisibleBooks.filter(b => b.config?.featured).sort((a, b) => {
    const ao = (a.config?.featuredOrder != null) ? a.config.featuredOrder : Infinity;
    const bo = (b.config?.featuredOrder != null) ? b.config.featuredOrder : Infinity;
    if (ao !== bo) return ao - bo;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  // 精选画册视图：只显示已推荐的画册，按 featuredOrder 升序（未设置按更新时间兜底）
  if (filterState.sort === 'featured') {
    filtered = filtered.filter(b => b.config?.featured).sort((a, b) => {
      const ao = (a.config?.featuredOrder != null) ? a.config.featuredOrder : Infinity;
      const bo = (b.config?.featuredOrder != null) ? b.config.featuredOrder : Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  }

  // 封面缩略图：把 Storage 公开 URL 换成图片变换端点（按宽度缩放），大幅减少首页流量
  // 非 Storage URL（data:、本地占位图等）原样返回
  function coverThumbUrl(src) {
    if (typeof src !== 'string' || !src.includes('/storage/v1/object/public/')) return src;
    return src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=420&quality=70';
  }

  if (filtered.length === 0) {
    gallery.innerHTML = '<div class="empty">没有找到对应画册</div>';
    return;
  }

  gallery.innerHTML = filtered.map(book => {
    const config = book.config || {};
    const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect fill="#e5e5e5" width="300" height="400"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#bbb" text-anchor="middle">暂无封面</text></svg>');
    const rawCover = config.cover?.image || config.pages?.[0]?.src || '';
    // 超大 base64 封面（>300KB）不直接渲染，避免浏览器解码卡顿
    const coverSrc = (rawCover.startsWith('data:image') && rawCover.length > 300000) ? defaultCover : (rawCover || defaultCover);
    // 缩略图 URL；若 Storage 图片变换不可用（如免费版），onerror 回退到原图
    const thumbSrc = coverThumbUrl(coverSrc);
    const fallbackAttr = thumbSrc !== coverSrc
      ? ` onerror="this.onerror=null;this.src='${coverSrc}'"`
      : '';
    const pageCount = (config.pageCount != null) ? config.pageCount : null;
    const isFeaturedBook = !!config.featured;
    const featuredIdx = isFeaturedBook ? featuredList.findIndex(b => b.id === book.id) + 1 : 0;
    const isHtmlCover = config.cover?.type === 'html' && !!config.cover?.html;

    return `
      <a href="book-ratio-adaptive.html?book=${book.id}&v=${Date.now()}" class="book-card">
        <div class="book-cover">
          ${isHtmlCover
            ? `<div class="html-cover" data-tpl="${encodeURIComponent(config.cover.html)}"></div>`
            : `<img src="${thumbSrc}"${fallbackAttr} alt="${book.name}" loading="lazy" decoding="async" fetchpriority="${book.id === filtered[0].id ? 'high' : 'auto'}">`}
          ${isFeaturedBook ? `<span class="cover-badge">精选 ${featuredIdx}</span>` : ''}
        </div>
        <div class="book-info">
          <div class="book-title">${book.name}</div>
          <div class="book-meta">${pageCount != null ? pageCount + ' 页' : ''}</div>
        </div>
      </a>
    `;
  }).join('');

  // HTML 封面：注入模板（Shadow DOM 隔离）并立即完成加载
  gallery.querySelectorAll('.html-cover').forEach(cover => {
    const root = cover.attachShadow({ mode: 'open' });
    root.innerHTML = decodeURIComponent(cover.dataset.tpl || '');
    const bc = cover.closest('.book-cover');
    if (bc) bc.classList.add('loaded');
  });

  // 封面骨架：图片加载完成（或失败/已缓存）淡入显示，停止 shimmer
  gallery.querySelectorAll('.book-cover').forEach(cover => {
    const img = cover.querySelector('img');
    if (!img) return;
    const show = () => cover.classList.add('loaded');
    if (img.complete) show();
    else {
      img.onload = show;
      img.onerror = show;
    }
  });
}

// ===== 自定义下拉组件（与后台筛选行一致） =====
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

const catSelect = buildCustomSelect('csCategory', v => { filterState.category = v; filterBooks(); });
catSelect.setOptions([{ value: '', label: '全部分类' }]);
const sortSelect = buildCustomSelect('csSort', v => { filterState.sort = v; filterBooks(); });
sortSelect.setOptions([{ value: 'featured', label: '精选画册' }, { value: 'latest', label: '最新发布' }]);

function applyFilter() {
  filterState.keyword = (document.getElementById('filterKeyword').value || '').trim();
  const btn = document.getElementById('clearKeyword');
  if (btn) btn.style.display = filterState.keyword ? 'block' : 'none';
  filterBooks();
}

function clearKeyword() {
  const kw = document.getElementById('filterKeyword');
  if (kw) kw.value = '';
  filterState.keyword = '';
  const btn = document.getElementById('clearKeyword');
  if (btn) btn.style.display = 'none';
  filterBooks();
}

// 搜索框：回车触发；手动删空输入时与清空按钮一致，重置关键字并刷新
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
      filterBooks();
    }
  });
})();

// ===== 移动端交互 =====
// 汉堡菜单：分类筛选面板
function toggleMobileMenu(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('mobileCategoryPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', () => {
  const p = document.getElementById('mobileCategoryPanel');
  if (p) p.style.display = 'none';
});

function renderMobileCategories() {
  const list = document.getElementById('mobileCategoryList');
  if (!list) return;
  let html = `<div class="mobile-category-item${filterState.category === '' ? ' active' : ''}" onclick="selectMobileCategory('')">全部分类</div>`;
  allCategories.forEach(cat => {
    html += `<div class="mobile-category-item${filterState.category === cat ? ' active' : ''}" onclick="selectMobileCategory('${cat}')">${cat}</div>`;
  });
  list.innerHTML = html;
}

function selectMobileCategory(cat) {
  filterState.category = cat;
  document.getElementById('mobileCategoryPanel').style.display = 'none';
  renderMobileCategories();
  filterBooks();
}

// 排序标签
function setMobileSort(sort) {
  filterState.sort = sort;
  updateMobileSortTabs();
  filterBooks();
}
function updateMobileSortTabs() {
  const f = document.getElementById('sortTabFeatured');
  const l = document.getElementById('sortTabLatest');
  if (f) f.classList.toggle('active', filterState.sort === 'featured');
  if (l) l.classList.toggle('active', filterState.sort === 'latest');
}

// 移动端搜索：回车或按钮触发；✕ 清空；手动删空重置
function applyMobileFilter() {
  const kw = document.getElementById('mobileKeyword');
  filterState.keyword = (kw.value || '').trim();
  const btn = document.getElementById('mobileClearKeyword');
  if (btn) btn.style.display = filterState.keyword ? 'block' : 'none';
  filterBooks();
}
function clearMobileKeyword() {
  const kw = document.getElementById('mobileKeyword');
  if (kw) kw.value = '';
  filterState.keyword = '';
  const btn = document.getElementById('mobileClearKeyword');
  if (btn) btn.style.display = 'none';
  filterBooks();
}
(function bindMobileSearchEvents() {
  const kw = document.getElementById('mobileKeyword');
  if (!kw) return;
  kw.addEventListener('keydown', e => {
    if (e.key === 'Enter') applyMobileFilter();
  });
  kw.addEventListener('input', () => {
    const btn = document.getElementById('mobileClearKeyword');
    if (btn) btn.style.display = kw.value ? 'block' : 'none';
    if (kw.value === '') {
      filterState.keyword = '';
      filterBooks();
    }
  });
})();

updateMobileSortTabs();
loadBooks();
