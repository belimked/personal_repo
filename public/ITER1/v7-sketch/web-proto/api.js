// User prototype pages keep their offline fallback; authentication and admin requests are strict.
window.V7API={
 get token(){return localStorage.getItem('v7proto.token')},
 get base(){return String(window.V7API_BASE||localStorage.getItem('v7proto.apiBase')||'https://personal-repo-api.saulxj.ggff.net/api').replace(/\/+$/,'')},
 get strict(){return location.pathname.includes('/admin/')},
 async request(path,method='GET',body,strict=this.strict){
  let response;
  try{response=await fetch(this.base+path,{method,headers:{...(this.token?{Authorization:'Bearer '+this.token}:{}),...(body||method==='POST'?{'Content-Type':'application/json'}:{})},...(body||method==='POST'?{body:JSON.stringify(body||{})}:{})})}catch(error){if(!strict)return null;throw new Error('无法连接后台')}
  let data;
  try{data=await response.json()}catch(error){const err=new Error('后台响应格式错误');err.status=response.status;throw err}
  if(!response.ok){if(response.status===401){localStorage.removeItem('v7proto.token');localStorage.removeItem('v7proto.session');if(this.strict)location.replace('../index.html')}
   const error=new Error(data?.message||'请求失败');error.status=response.status;throw error}
  return data
 },
 async login(email,password){const data=await this.request('/auth/login','POST',{email,password},true);localStorage.setItem('v7proto.token',data.token);return data},
 async logout(){try{await this.request('/auth/logout','POST')}finally{localStorage.removeItem('v7proto.token')}}
};
