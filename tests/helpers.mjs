import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";

const require = createRequire(import.meta.url);
const idlUtils = require("jsdom/lib/jsdom/living/generated/utils.js");
const { serializeURL } = require("whatwg-url");

export const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
export const V4_DIR = path.join(PUBLIC_DIR, "ITER1/v4");
export const ORIGIN = "http://proto.test";
export const STATE_KEY = "pa_ITER1_v4";
export const V5_DIR = path.join(PUBLIC_DIR, "ITER1/v5");
export const stateKey = (version = "v4") => `pa_ITER1_${version}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// localStorage 需要非 opaque 的 origin，所以页面挂在 http://proto.test/ 下，资源从 public/ 读取
class PublicDirLoader extends ResourceLoader {
  fetch(url, options) {
    const u = new URL(url);
    if (u.origin !== ORIGIN) return super.fetch(url, options);
    const file = path.join(PUBLIC_DIR, decodeURIComponent(u.pathname));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return Promise.reject(new Error(`outside public/: ${url}`));
    return readFile(file);
  }
}

// 记录 location 跳转而不真正导航；只改 hash 的跳转照常执行
export function interceptNavigation(window) {
  const navigations = [];
  const impl = idlUtils.implForWrapper(window.location);
  const orig = impl._locationObjectNavigate.bind(impl);
  impl._locationObjectNavigate = (url, opts) => {
    const href = serializeURL(url);
    const cur = window.location.href;
    if (href.split("#")[0] === cur.split("#")[0] && href.includes("#")) return orig(url, opts);
    navigations.push(href);
  };
  return navigations;
}

// 跳转目标相对版本目录（默认 v4）的写法，如 "home.html"、"todos.html?view=list"
// 第二个参数只认字符串版本：旧测试用 .map(relTarget) 时会传进数组下标
export const relTarget = (href, version) => {
  const v = typeof version === "string" ? version : "v4";
  return href ? new URL(href, `${ORIGIN}/ITER1/${v}/`).href.replace(`${ORIGIN}/ITER1/${v}/`, "") : href;
};

export async function loadPage(name, { session, today, state, url, version = "v4" } = {}) {
  const dir = path.join(PUBLIC_DIR, "ITER1", version);
  const key = stateKey(version);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...args) => errors.push(args.map(String).join(" ")));
  virtualConsole.on("jsdomError", (e) => {
    if (e.type === "unhandled exception" || e.type === "not implemented") return;
    errors.push(String(e.message || e));
  });
  let navigations = [];
  const sessionObj = typeof session === "string" ? { email: session } : session;

  const dom = await JSDOM.fromFile(path.join(dir, name.split(/[?#]/)[0]), {
    url: `${ORIGIN}/ITER1/${version}/${url || name}`,
    runScripts: "dangerously",
    resources: new PublicDirLoader(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.addEventListener("error", (e) => errors.push(e.error?.stack || e.message));
      navigations = interceptNavigation(window);
      if (today) window.PA_TODAY = today;
      if (state) window.localStorage.setItem(key, JSON.stringify(state));
      if (sessionObj) {
        // app.js 导出 window.PA 时写入登录态，此时页面内联脚本尚未运行
        let pa;
        Object.defineProperty(window, "PA", {
          configurable: true,
          get: () => pa,
          set(v) {
            pa = v;
            const u = v.state.users.find((x) => x.email === sessionObj.email);
            v.state.session = { email: sessionObj.email, role: sessionObj.role || u?.role || "user" };
            v.save();
          },
        });
      }
    },
  });
  const { window } = dom;
  if (window.document.readyState !== "complete") await new Promise((r) => window.addEventListener("load", r));
  return {
    dom,
    window,
    document: window.document,
    errors,
    navigations,
    state: () => JSON.parse(window.localStorage.getItem(key)),
    close: () => window.close(),
  };
}

// 轮询直到 fn 返回真值（返回该值），超时抛错
export async function waitFor(fn, { timeout = 3000, interval = 10, label = "条件" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`等待超时：${label}`);
    await sleep(interval);
  }
}
