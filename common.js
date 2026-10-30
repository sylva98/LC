// ==========================================
//  LC 画册项目公共模块
//  依赖：需在本文件之前先引入 supabase.min.js
//  提供：Supabase 客户端 / DEFAULT_CONFIG / 通用工具
// ==========================================

// ---- Supabase 初始化（三页共用；更换项目时只改这里） ----
const SUPABASE_URL = 'https://izspqexefmggllhldfty.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kGwGiZSKXZkIDtvnGcDCSA_9Gnin7sk';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 画册默认配置（新建画册 / 数据缺失时的兜底） ----
const DEFAULT_CONFIG = {
  background: {
    type: 'color',
    color: '#e8e8e8',
    image: ''
  },
  bookRatio: { w: 420, h: 560 },
  showOn: { mobile: true, pc: true },
  music: { url: '', volume: 0.5, startPage: 1 },
  cover: {
    type: 'image',
    image: '',
    html: ''
  },
  pages: [
    { type: 'image', src: '' },
    { type: 'image', src: '' },
    { type: 'image', src: '' }
  ],
  backCover: {
    type: 'image',
    image: '',
    html: ''
  }
};

// ---- 剪贴板复制（安全上下文用 Clipboard API，否则降级 execCommand） ----
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch(e) {
    return false;
  }
}

// ---- 静默容错：统一打 warn 而不是完全吞掉，便于排查问题 ----
function lcWarn(context, err) {
  console.warn('[LC]', context, err || '');
}
