document.querySelector('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  const error=document.querySelector('#loginError');error.textContent='';
  try{
    const challengeResponse=await fetch('/hq/auth-challenge');if(!challengeResponse.ok)throw Error('Workspace setup is incomplete');
    const challenge=await challengeResponse.json();
    const salt=Uint8Array.from(challenge.salt.match(/../g),v=>parseInt(v,16));
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.querySelector('#password').value),'PBKDF2',false,['deriveBits']);
    const proof=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},key,256);
    const passwordProof=Array.from(new Uint8Array(proof),v=>v.toString(16).padStart(2,'0')).join('');
    const response=await fetch('/hq/login' ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passwordProof})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to sign in');
    location.assign('/hq/');
  }catch(err){error.textContent=err.message;button.disabled=false;}
});
