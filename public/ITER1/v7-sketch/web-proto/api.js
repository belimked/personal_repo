// API failure falls back to the local prototype. Authentication errors are not offline failures.
window.V7API={
 get token(){return localStorage.getItem('v7proto.token')},
 async request(path,method='GET',body){try{const response=await fetch('/api'+path,{method,headers:{...(this.token?{Authorization:'Bearer '+this.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok){const error=new Error(data.message||'请求失败');error.status=response.status;throw error}return data}catch(error){if(error.status)throw error;return null}},
 async login(email,password){let data=await this.request('/auth/login','POST',{email,password});if(data)localStorage.setItem('v7proto.token',data.token);return data},
 async logout(){try{await this.request('/auth/logout','POST')}finally{localStorage.removeItem('v7proto.token')}}
};
