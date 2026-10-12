document.querySelector('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  const error=document.querySelector('#loginError');error.textContent='';
  try{
    const response=await fetch('/hq/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to sign in');
    location.assign('/hq/');
  }catch(err){error.textContent=err.message;button.disabled=false;}
});
