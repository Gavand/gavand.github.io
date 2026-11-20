import * as THREE from 'three';
import { STLLoader } from '/studio/assets/vendor/STLLoader.js';
const story=document.querySelector('.assembly-story'),stage=document.querySelector('.model-stage'),canvas=document.querySelector('#robot-canvas'),range=document.querySelector('#assembly-range'),output=document.querySelector('#assembly-value'),button=document.querySelector('#assemble-button'),status=document.querySelector('.model-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let target=0,current=target,manual=false,frame=0,visible=true,ready=false,renderer,scene,camera,model,H=1,parts=[];
let previousLabel = -1;
function labels(){const pct=Math.round(target*100);if (pct === previousLabel) return; previousLabel = pct; range.value=String(pct);output.value=pct+'%';const chapter=pct<34?0:pct<85?1:2;document.querySelector('#chapter-number').textContent=['01 / AC-1','02 / ORBIT','03 / EXPLODED VIEW'][chapter];document.querySelector('#chapter-caption').textContent=['The assembled chassis.','A closer look at the structure.','49 printed parts.'][chapter];button.innerHTML=target>.95?'Return to portrait <span>↗</span>':'Explore parts <span>↗</span>'}
function request(){if(!frame&&ready&&visible&&!document.hidden)frame=requestAnimationFrame(render)}
function fromScroll(){if(manual||reduced.matches)return;const rect=story.getBoundingClientRect();target=THREE.MathUtils.clamp(-rect.top/(story.offsetHeight-innerHeight),0,1);labels();request()}
addEventListener('scroll',()=>{manual=false;fromScroll()},{passive:true});
range.addEventListener('input',()=>{manual=true;target=Number(range.value)/100;labels();request()});
button.addEventListener('click',()=>{manual=true;target=target>.95?0:1;labels();request()});
reduced.addEventListener('change',()=>{manual=false;target=0;current=target;fromScroll();labels();request()});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request()},{rootMargin:'100px'}).observe(story);
document.addEventListener('visibilitychange',request);
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request()}
new ResizeObserver(resize).observe(stage);
function render() {
  frame = 0;
  if (!ready || !visible || document.hidden) return;
  current = reduced.matches ? target : THREE.MathUtils.lerp(current, target, .075);
  if (Math.abs(current - target) < .001) current = target;

  const pullback = THREE.MathUtils.smoothstep(current, .025, .75);
  const orbit = THREE.MathUtils.smoothstep(current, .08, .98);
  const spread = THREE.MathUtils.smoothstep(current, .30, .95);
  for (const part of parts) part.mesh.position.copy(part.offset).multiplyScalar(spread);

  const portraitDistance = Math.max(1.33, 1.17 / camera.aspect);
  const wideDistance = Math.max(3.4, 2.4 / camera.aspect);
  const distance = H * THREE.MathUtils.lerp(portraitDistance, wideDistance, pullback);
  const focus = H * THREE.MathUtils.lerp(.79, .48, pullback);
  const elevation = THREE.MathUtils.lerp(.32, .055, pullback);
  const angle = THREE.MathUtils.lerp(.61, .32, pullback) + orbit * Math.PI * 2;
  camera.position.set(Math.sin(angle) * distance, focus + distance * elevation, Math.cos(angle) * distance);
  camera.lookAt(0, focus, 0);
  renderer.render(scene, camera);
  if (current !== target) request();
}
async function init(){try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'default'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(31,1,.1,5000);scene.add(new THREE.HemisphereLight(0xfffcf5,0x858778,1.35));const key=new THREE.DirectionalLight(0xfff7e8,2.35);key.position.set(-250,450,350);scene.add(key);const fill=new THREE.DirectionalLight(0xe5eeff,1.5);fill.position.set(300,150,-150);scene.add(fill);model=new THREE.Group();model.rotation.x=-Math.PI/2;scene.add(model);const response=await fetch('/studio/assets/models/ac1/manifest.json');if(!response.ok)throw Error('Model manifest unavailable');const manifest=await response.json();const mins=[0,1,2].map(i=>Math.min(...manifest.parts.map(p=>p.bounds[i][0]))),maxs=[0,1,2].map(i=>Math.max(...manifest.parts.map(p=>p.bounds[i][1])));H=maxs[2]-mins[2];const cx=(mins[0]+maxs[0])/2,cy=(mins[1]+maxs[1])/2;let index=0,loaded=0;const loader=new STLLoader();
  function satinPlastic(color) {
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 0, roughness: .44, ior: 1.48,
      clearcoat: .15, clearcoatRoughness: .38, side: THREE.DoubleSide
    });
  }
  const ivory = satinPlastic(0xe9e9dc);
  const sage = satinPlastic(0x94a584);
  const forest = satinPlastic(0x374932);
  const darkParts = new Set(['C3', 'C6', 'C8', 'D1', 'E1', 'D5', 'E5', 'A1', 'B1']);
  const lightParts = new Set(['C1', 'C2', 'C5', 'C7', 'C9', 'D4', 'E4']);
  function materialForPart(id) {
    if (darkParts.has(id)) return forest;
    if (lightParts.has(id)) return ivory;
    return sage;
  }
  async function worker(){while(index<manifest.parts.length){const p=manifest.parts[index++];const geometry=await loader.loadAsync('/studio/assets/models/ac1/'+p.file);geometry.translate(-cx,-cy,-mins[2]);const mesh = new THREE.Mesh(geometry, materialForPart(p.id));
      model.add(mesh);
      const x=(p.bounds[0][0]+p.bounds[0][1])/2-cx,y=(p.bounds[1][0]+p.bounds[1][1])/2-cy,z=(p.bounds[2][0]+p.bounds[2][1])/2-mins[2];const side=x>=0?1:-1;const offset=new THREE.Vector3(x*.7+side*H*.06,y*.8, (z-H*.45)*.55);if(p.id.startsWith('D')||p.id.startsWith('E'))offset.x+=side*H*.12;if(p.id==='C9')offset.z+=H*.09;parts.push({mesh,offset});document.querySelector('#load-progress').textContent=++loaded+' / 49'}}await Promise.all(Array.from({length:5},worker));const ring=new THREE.Mesh(new THREE.RingGeometry(H*.37,H*.373,100),new THREE.MeshBasicMaterial({color:0xb9c3ad,transparent:true,opacity:.55,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-H*.02;scene.add(ring);ready=true;status.classList.add('done');resize();fromScroll();labels();request()}catch(error){console.error('AC-1 preview:',error);stage.classList.add('fallback');status.textContent='Explore AC-1 in the Color Studio';status.style.top='auto';status.style.bottom='30px';document.querySelector('.assembly-controls').hidden=true;story.style.height='auto';document.querySelector('.assembly-stage').style.position='relative'}}
labels();
const loadObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    loadObserver.disconnect();
    init();
  }
}, {rootMargin: '600px'});
loadObserver.observe(story);
