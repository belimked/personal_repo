import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||undefined}});
const root = resolve(process.cwd(), 'public');
const web = '/ITER1/v7-sketch/web-proto/';
let staticServer: Server, backend: ChildProcess, origin: string, api: string;
async function port(): Promise<number> { const server=createServer(); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r)); const p=(server.address() as {port:number}).port; server.close(); return p }
async function waitReady(url:string){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{} await new Promise(r=>setTimeout(r,100))}throw Error('Go backend did not start')}
test.beforeAll(async()=>{
 staticServer=createServer(async(req,res)=>{const file=resolve(root,'.'+decodeURIComponent((req.url||'/').split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403).end();return}try{const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'} as Record<string,string>)[extname(file)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404).end()}});
 await new Promise<void>(r=>staticServer.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(staticServer.address() as {port:number}).port}`;
 api=`http://127.0.0.1:${await port()}/api`;
 await rm(resolve(process.cwd(),'.tmp/v7-admin-test.db'),{force:true});
 backend=spawn(resolve(process.cwd(),'.tmp/xiaohe'),['serve'],{env:{...process.env,XIAOHE_ADDR:new URL(api).host,XIAOHE_DB:resolve(process.cwd(),'.tmp/v7-admin-test.db'),XIAOHE_AUDIO_DIR:resolve(process.cwd(),'.tmp/v7-admin-audio'),CORS_ORIGINS:origin},stdio:'pipe'});
 await waitReady(api+'/health');
});
test.afterAll(async()=>{backend?.kill();await new Promise<void>(r=>staticServer?.close(()=>r()))});
test('Go 管理员用户生命周期及离线错误',async({page})=>{
 await page.addInitScript(base=>localStorage.setItem('v7proto.apiBase',base),api+'/');
 await page.goto(origin+web+'index.html');
 await page.locator('#email').fill('admin@demo.com');await page.locator('#password').fill('demo1234');await page.locator('#login button[type=submit]').click();
 await expect(page).toHaveURL(/admin\/home.html/);
 await page.locator('[data-act=next]').first().click();await page.locator('[data-act=finish]').first().click();
 await page.locator('[data-nav="用户"]').click();
 await expect(page.locator('.user-row')).toHaveCount(2);
 await page.locator('[data-act=add-user]').click();await page.locator('#new-email').fill('v7test@example.com');await page.locator('#new-name').fill('测试用户');await page.locator('[data-act=confirm-modal]').click();
 const first=await page.locator('#temp-password').innerText();expect(first).toBeTruthy();
 const login=(password:string)=>fetch(api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'v7test@example.com',password})});
 expect((await login(first)).status).toBe(200);
 await page.locator('.dialog [data-act=close-modal]').click();await page.locator('.user-row').filter({hasText:'v7test@example.com'}).click();
 await page.locator('#detail-name').fill('更名用户');await page.locator('#detail-role').selectOption('user');await page.locator('[data-act=save-user]').click();await expect(page.locator('.drawer h2')).toHaveText('更名用户');await page.waitForFunction('!busy');
 await page.locator('[data-act=toggle-user]').click();expect((await login(first)).status).toBe(403);
 await page.locator('[data-act=toggle-user]').click();expect((await login(first)).status).toBe(200);
 await page.waitForFunction('!busy');
 const resetResponse=page.waitForResponse(r=>r.url().includes('/reset-password'));await page.locator('[data-act=password]').click();expect((await resetResponse).status()).toBe(200);const second=await page.locator('#temp-password').innerText();expect(second).not.toBe(first);expect((await login(second)).status).toBe(200);
 await page.locator('.dialog [data-act=close-modal]').click();await page.locator('[data-act=delete-user]').click();
 await page.locator('#filter').selectOption('已删除');await expect(page.locator('.user-row').filter({hasText:'v7test@example.com'})).toBeVisible();
 await page.locator('.user-row').filter({hasText:'v7test@example.com'}).click();await expect(page.locator('[data-act=restore-user]')).toBeVisible();await expect(page.locator('[data-act=toggle-user]')).toHaveCount(0);await page.locator('[data-act=restore-user]').click();
 await page.locator('.drawer [data-act=close]').click();await page.locator('#filter').selectOption('全部');await expect(page.locator('.user-row').filter({hasText:'v7test@example.com'})).toBeVisible();
 backend.kill();await new Promise<void>(r=>backend.once('exit',()=>r()));await page.reload();await page.locator('[data-nav="用户"]').click();await expect(page.locator('.empty').filter({hasText:'无法连接后台'})).toBeVisible();await expect(page.locator('.user-row')).toHaveCount(0);await expect(page.locator('[data-act=retry-users]')).toBeVisible();
});
