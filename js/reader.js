// ==========================================
//  画册阅读器主逻辑（自 book-ratio-adaptive.html 内联 <script> 拆出）
//  依赖：supabase.min.js -> common.js -> page-flip.browser.min.js（须先于本文件引入）
// ==========================================

// ==========================================
//  配置：从 Supabase 读取
// ==========================================
async function loadConfig() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('book');
  const shortCode = params.get('s');
  currentBookId = bookId || null;
  try {
    // 短链接：/s/<8位短码>，按 config.shareCode 查
    if (shortCode) {
      const { data, error } = await supabase
        .from('books')
        .select('id, name, config')
        .eq('config->>shareCode', shortCode)
        .maybeSingle();
      if (!error && data && data.config) {
        currentBookId = data.id;
        document.title = data.name || '画册';
        return data.config;
      }
      // 兼容旧版短链接 /s/<UUID>：短码查不到且形如 UUID 时，按完整 id 查
      if (shortCode.indexOf('-') > 0) {
        const { data: d2, error: e2 } = await supabase
          .from('books')
          .select('id, name, config')
          .eq('id', shortCode)
          .maybeSingle();
        if (!e2 && d2 && d2.config) {
          currentBookId = d2.id;
          document.title = d2.name || '画册';
          return d2.config;
        }
      }
    }
    // 常规链接：?book=<UUID>
    if (bookId) {
      const { data, error } = await supabase
        .from('books')
        .select('name, config')
        .eq('id', bookId)
        .single();
      if (data && data.config) {
        document.title = data.name || '画册';
        return data.config;
      }
    }
  } catch(e) {
    lcWarn('读取画册配置失败，降级为未找到提示页', e);
  }
  // 无参数或画册不存在/查询失败：返回 null，由 init 显示友好提示（而不是空白画册）
  return null;
}

function buildPagesFromConfig(cfg) {
  const pages = [];
  pages.push({
    type: cfg.cover.type,
    src: cfg.cover.image,
    html: cfg.cover.html,
    lqip: cfg.cover.lqip || '',
    hard: true
  });
  cfg.pages.forEach(p => {
    pages.push({
      type: p.type,
      src: p.src,
      html: p.html,
      lqip: p.lqip || ''
    });
  });
  pages.push({
    type: cfg.backCover.type,
    src: cfg.backCover.image,
    html: cfg.backCover.html,
    lqip: cfg.backCover.lqip || '',
    hard: true
  });
  return pages;
}

// ==========================================
//  先进加载体验：模糊占位(LQIP) + 相邻页预取
// ==========================================
function ensureLoaded(i) {
  const img = pageImgs[i];
  if (!img || loadedFlags[i]) return;
  loadedFlags[i] = true;
  const src = img.getAttribute('data-src');
  if (!src) { img.style.opacity = 1; return; }
  const full = new Image();
  full.onload = () => {
    if (img.src !== src) {
      img.src = src;
      img.classList.remove('blur');
    }
    img.style.opacity = 1;
  };
  full.onerror = () => { img.style.opacity = 1; };
  full.src = src;
}

// 预取策略：当前屏 + 相邻页
function preloadAround() {
  if (!pageFlip) return;
  const cur = pageFlip.getCurrentPageIndex();
  if (isSinglePage) {
    ensureLoaded(cur); ensureLoaded(cur + 1); ensureLoaded(cur - 1);
  } else {
    ensureLoaded(cur); ensureLoaded(cur + 1); ensureLoaded(cur + 2);
    if (cur > 0) ensureLoaded(cur - 1);
  }
}

let CONFIG, BOOK_RATIO_W, BOOK_RATIO_H, PAGES, currentBookId = null;

function applyBackground() {
  const bg = CONFIG.background || {};
  if (bg.type === 'color') {
    document.body.style.background = bg.color;
  } else if (bg.type === 'image' && bg.image) {
    document.body.style.background = `url(${bg.image}) center/cover no-repeat`;
  }
}

async function init() {
  try {
    CONFIG = await loadConfig();

    // 无参数 / 画册不存在 / 查询失败：给出明确提示，而不是空白画册
    if (!CONFIG) {
      document.getElementById('loading').innerHTML =
        '<div class="loading-error-message">' +
        '未找到画册，请从首页选择后打开<br>' +
        '<a href="index.html" class="loading-error-link">返回首页</a>' +
        '</div>';
      return;
    }

    // 注：showOn（显示端设置）只用于首页画廊的展示筛选，不做访问门禁。
    // 阅读器是"拿到链接即可看"的分享语义，任何设备打开都应正常渲染，
    // 后台预览 iframe 也因此天然不受影响。

    BOOK_RATIO_W = CONFIG.bookRatio.w;
    BOOK_RATIO_H = CONFIG.bookRatio.h;
    PAGES = buildPagesFromConfig(CONFIG);

    applyBackground();
    // 首页图标按钮：config.showIndexIcon 为 false 时隐藏（默认显示）
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) homeBtn.style.display = (CONFIG.showIndexIcon === false) ? 'none' : '';
    // 立即开书（缩略图占位已可见），图片按需预加载，不再等全部加载完
    initBook();
    const l = document.getElementById('loading');
    if (l) l.style.display = 'none';
    preloadAround();
    // 从 URL 参数读要跳转的页码
    const params = new URLSearchParams(window.location.search);
    const goTo = parseInt(params.get('page'));
    if (!isNaN(goTo) && pageFlip) {
      setTimeout(() => {
        // 直接跳转到目标页（turnToPage），替代逐页 flip 循环，页数多时性能差距巨大
        pageFlip.turnToPage(Math.max(0, Math.min(goTo, pageFlip.getPageCount() - 1)));
        updateNum();
        preloadAround();
      }, 300);
    }

    // 初始化背景音乐
    const music = CONFIG.music || {};
    window.musicConfig = music;
    window.bgMusic = document.getElementById('bgMusic');
    if (music.url) {
      window.bgMusic.src = music.url;
      window.bgMusic.volume = music.volume || 0.5;
    }
    window.musicStarted = false;
  } finally {
    // 兜底：无论成功与否，最多 10 秒隐藏 loading（正常路径在图片加载后已更早隐藏）
    setTimeout(() => {
      const l = document.getElementById('loading');
      if (l) l.style.display = 'none';
    }, 10000);
  }
}

init();

function buildPages() {
  let bookEl = document.getElementById('book');
  if (!bookEl) {
    bookEl = document.createElement('div');
    bookEl.id = 'book';
    const controls = document.querySelector('.controls');
    document.querySelector('.page-wrapper').insertBefore(bookEl, controls);
  }
  bookEl.innerHTML = '';
  PAGES.forEach(p => {
    const div = document.createElement('div');
    div.className = 'page';
    if (p.hard) div.setAttribute('data-density', 'hard');
    if (p.type === 'image') {
      div.className += ' page-image-only';
      const thumb = p.lqip || '';
      div.innerHTML = `<img class="page-img${thumb ? ' blur' : ''}" data-src="${p.src}" src="${thumb}" alt="">`;
    } else {
      div.className += ' page-html-content';
      div.innerHTML = p.html;
    }
    bookEl.appendChild(div);
  });
}

let pageFlip = null;
let isSinglePage = false; // 移动端单页模式标记（页码显示用）

function calcPageSize() {
  const isMobile = window.innerWidth < 600;
  // 移动端：书几乎满屏（左右仅留 8px 呼吸边），底部固定预留悬浮控制条的空间
  // PC 端：维持原有留白与双页布局
  const availW = window.innerWidth - (isMobile ? 16 : 60);
  const controlsEl = document.querySelector('.controls');
  const controlsH = controlsEl && !isMobile ? controlsEl.offsetHeight + 20 : 0;
  const availH = window.innerHeight - (isMobile ? 92 : 60) - controlsH;
  const ratioWH = BOOK_RATIO_W / BOOK_RATIO_H;
  let pageWidth = isMobile
    ? Math.min(availW, availH * ratioWH)
    : Math.min(availW / 2, availH * ratioWH);
  pageWidth = Math.max(pageWidth, 100);
  const pageHeight = pageWidth * (BOOK_RATIO_H / BOOK_RATIO_W);
  return { width: pageWidth, height: pageHeight, isMobile };
}

function initBook() {
  const size = calcPageSize();

  // 注意：pageFlip.destroy() 会把 #book 元素整个从 DOM 移除（page-flip 源码
  // destroy(){this.ui.destroy(), this.block.remove()}），
  // 因此顺序必须是：先销毁旧实例 → 再重建 #book 及页面 → 最后创建新实例。
  // 顺序错了会导致 getElementById('book') 拿到 null，整个阅读器崩溃。
  if (pageFlip) {
    try { pageFlip.destroy(); } catch(e) { lcWarn('销毁旧画册实例失败（防御性忽略）', e); }
    pageFlip = null;
  }

  loadedFlags = {};   // 重建后重新按需加载（浏览器缓存保证快速）
  buildPages();
  pageImgs = Array.from(document.querySelectorAll('#book .page-img'));

  try {
    // 移动端统一单页模式（usePortrait），横版竖版画册在手机上都是一页一页翻
    isSinglePage = size.isMobile;
    pageFlip = new St.PageFlip(
      document.getElementById('book'),
      {
        width: size.width,
        height: size.height,
        size: 'fixed',
        showCover: true,
        drawShadow: true,
        flippingTime: 850,        // 翻页时长稍拉长，动作更柔更像纸页
        usePortrait: isSinglePage,
        maxShadowOpacity: 0.38,   // 书脊阴影压轻：过高会在封面留下一道很重的深色带
        mobileScrollSupport: true,
        swipeDistance: 18         // 滑动翻页更灵敏（默认 25 偏钝）
      }
    );
    pageFlip.loadFromHTML(document.querySelectorAll('.page'));
  } catch(err) {
    lcWarn('initBook: 画册重建失败', err);
    return;
  }
  // 翻页完成自动更新页码
  pageFlip.on('flip', () => {
    updateNum();
    checkMusicStart();
    preloadAround();
  });
  updateNum();
  preloadAround();
}

// 重建画册并恢复当前页（设备切换 / 窗口尺寸变化共用）
function rebuildBook() {
  const cur = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
  initBook();
  if (pageFlip && cur > 0) {
    // 稍等一拍再跳页，等 PageFlip 完成初始化布局
    setTimeout(() => {
      try {
        pageFlip.turnToPage(Math.min(cur, pageFlip.getPageCount() - 1));
        updateNum();
        preloadAround();
      } catch(err) { lcWarn('重建后恢复页码失败', err); }
    }, 60);
  }
}

function updateNum() {
  if (!pageFlip) return;
  const cur = pageFlip.getCurrentPageIndex();
  const total = pageFlip.getPageCount();
  if (isSinglePage) {
    // 移动端单页模式：封面 1/5，内页逐页 2/5、3/5……
    document.getElementById('pageNum').textContent = Math.min(cur + 1, total) + ' / ' + total;
    return;
  }
  // 封面从0开始：封面0/4，内页1-2/4，封底4/4
  if (cur === 0) {
    document.getElementById('pageNum').textContent = '0 / ' + total;
  } else if (cur === total - 1) {
    document.getElementById('pageNum').textContent = total + ' / ' + total;
  } else {
    document.getElementById('pageNum').textContent = cur + '-' + (cur + 1) + ' / ' + total;
  }
  updateBlankPageVisibility(cur, total);
}

function updateBlankPageVisibility(cur, total) {
  const book = document.getElementById('book');
  if (!book) return;
  book.querySelectorAll('.page').forEach(p => {
    p.style.background = '';
    p.style.boxShadow = '';
  });
  if (cur === 0) {
    const left = book.querySelector('.page.--left');
    if (left) {
      left.style.background = 'transparent';
      left.style.boxShadow = 'none';
    }
  }
  if (cur === total - 1) {
    const right = book.querySelector('.page.--right');
    if (right) {
      right.style.background = 'transparent';
      right.style.boxShadow = 'none';
    }
  }
}

function checkMusicStart() {
  if (!window.bgMusic || window.musicStarted) return;
  const music = window.musicConfig || {};
  const curPage = pageFlip ? pageFlip.getCurrentPageIndex() + 1 : 1;
  if (curPage >= (music.startPage || 1)) {
    window.musicStarted = true;
    const tryPlay = () => {
      window.bgMusic.play().catch(() => {
        setTimeout(tryPlay, 300);
      });
    };
    tryPlay();
  }
}

function nextPage() {
  if (!pageFlip) return;
  pageFlip.flipNext('bottom');
}
function prevPage() {
  if (!pageFlip) return;
  pageFlip.flipPrev('bottom');
}

// ==========================================
//  分享：生成 8 位短码并复制短链接
//  短链接格式：域名/s/<短码>，由 Nginx rewrite 映射到画册页
//  短码存于 config.shareCode，首次生成后复用；写库失败降级为完整链接
// ==========================================
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function shareBook() {
  if (!currentBookId) {
    showToast('画册尚未加载');
    return;
  }
  // 短码由后台（admin）生成并随配置存库，阅读器只读复制，不写数据库
  const code = CONFIG && CONFIG.shareCode;
  const url = code
    ? (location.origin + '/s/' + code)
    : (location.origin + '/book-ratio-adaptive.html?book=' + currentBookId);
  const title = document.title || '画册分享';

  // 移动端优先调起系统分享面板（微信/朋友圈/短信任选），桌面端或失败时回退复制链接
  if (navigator.share) {
    try {
      await navigator.share({ title: title, url: url });
      return;
    } catch(e) {
      if (e && e.name === 'AbortError') return; // 用户取消分享，不提示
      lcWarn('系统分享面板调起失败，回退复制链接', e);
    }
  }
  const ok = await copyText(url);
  showToast(ok ? '复制链接成功，可转发给朋友' : '复制失败，请手动复制');
}

// 后台编辑实时预览：接收 admin 推送的消息（本地处理，不整页刷新，保留设备模式与播放状态）
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || !d.type) return;

  // 后台点击内页卡片：无刷新跳页
  if (d.type === 'lc-goto-page' && pageFlip) {
    try {
      pageFlip.turnToPage(Math.max(0, Math.min(d.page, pageFlip.getPageCount() - 1)));
      updateNum();
      preloadAround();
    } catch(err) { lcWarn('后台跳页失败', err); }
    return;
  }

  // 后台切换预览设备（PC/移动端）：按新视口尺寸显式重建（不依赖 iframe resize 事件）
  if (d.type === 'lc-rebuild') {
    rebuildBook();
    return;
  }

  if (d.type !== 'lc-config-update' || !d.config) return;
  CONFIG = d.config;
  BOOK_RATIO_W = CONFIG.bookRatio.w;
  BOOK_RATIO_H = CONFIG.bookRatio.h;
  PAGES = buildPagesFromConfig(CONFIG);
  applyBackground();
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) homeBtn.style.display = (CONFIG.showIndexIcon === false) ? 'none' : '';
  const cur = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
  initBook();
  if (pageFlip && cur > 0) {
    try { pageFlip.turnToPage(cur); } catch(err) { lcWarn('恢复预览页码失败', err); }
  }
  // 同步背景音乐设置（尚未开始播放时才换源，避免打断播放）
  const music = CONFIG.music || {};
  window.musicConfig = music;
  if (window.bgMusic && music.url && !window.musicStarted && window.bgMusic.src !== music.url) {
    window.bgMusic.src = music.url;
    window.bgMusic.volume = music.volume || 0.5;
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    rebuildBook();
  }, 300);
});
