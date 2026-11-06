// 共用：左侧菜单、图标（lucide 线框，1.5 描边）
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  log: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  pack: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  skip: '<path d="M5 12h14M15 8l4 4-4 4"/>',
};
const icon = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${I[n]}</svg>`;

const NAV = [
  [null, [['home', '首页', 'index']]],
  ['日常', [['users', '用户'], ['log', '操作日志']]],
  ['助手内容', [['pack', '领域包'], ['layout', '界面规则'], ['coins', '点数规则']]],
  ['系统', [['cpu', '模型与服务'], ['gear', '系统设置']]],
];

function sidebar(on, count, setup) {
  const brand = `<div class="brand"><span class="mark">禾</span>小禾后台</div>`;
  const me = `<div class="me"><span class="av">管</span><div><b>管理员</b><span>admin@demo.com</span></div></div>`;
  if (setup) {
    return `<aside class="side">${brand}<nav class="nav"><a class="on" href="#">${icon('flag')}开始设置</a></nav>
      <p class="nav-note">其余菜单在配好模型后出现</p>${me}</aside>`;
  }
  const groups = NAV.map(([g, items]) => (g ? `<div class="nav-g">${g}</div>` : '') + items.map(([i, t]) =>
    `<a class="${t === on ? 'on' : ''}" href="#">${icon(i)}${t}${t === '首页' && count ? `<span class="count">${count}</span>` : ''}</a>`).join('')).join('');
  return `<aside class="side">${brand}<nav class="nav">${groups}</nav>${me}</aside>`;
}

document.querySelectorAll('[data-side]').forEach(el => {
  el.outerHTML = sidebar(el.dataset.side, el.dataset.count, el.hasAttribute('data-setup'));
});
document.querySelectorAll('i[data-i]').forEach(el => el.outerHTML = icon(el.dataset.i, el.className));
