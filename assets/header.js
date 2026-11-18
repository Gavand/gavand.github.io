const menu=document.querySelector('.menu-toggle');
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));document.querySelector('.site-masthead').classList.toggle('menu-open',open)});
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{menu.setAttribute('aria-expanded','false');document.querySelector('.site-masthead').classList.remove('menu-open')}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.setAttribute('aria-expanded','false');document.querySelector('.site-masthead').classList.remove('menu-open')}});
