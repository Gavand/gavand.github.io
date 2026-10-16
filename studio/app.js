import * as THREE from 'three';
import { OrbitControls } from './assets/vendor/OrbitControls.js';
import { STLLoader } from './assets/vendor/STLLoader.js';

const $ = id => document.getElementById(id);
const zoneNames = {head:'Head',body:'Body',arms:'Arms',legs:'Legs',feet:'Feet',details:'Details'};
const colors = [ ['White','#dedede'],['Black','#111315'],['Forest Green','#16552e'],['Graphite','#34383e'],['Orange','#c7470a'],['Blue','#1646ae'],['Yellow','#dea600'],['Purple','#622591'] ];
const defaultDesign = Object.fromEntries(Object.keys(zoneNames).map(key => [key,'#dedede']));
const presets = {
  Studio: {head:'#34383e',body:'#34383e',arms:'#34383e',legs:'#34383e',feet:'#565c64',details:'#c7470a'},
  Forest: {head:'#34383e',body:'#16552e',arms:'#16552e',legs:'#16552e',feet:'#0c3c21',details:'#dea600'},
  Terra: {head:'#34383e',body:'#c7470a',arms:'#c7470a',legs:'#c7470a',feet:'#7e2d0a',details:'#111315'},
  Orbit: {head:'#34383e',body:'#1646ae',arms:'#1646ae',legs:'#1646ae',feet:'#0d2863',details:'#622591'},
  'Orion suit': {head:'#dedede',body:'#f35b12',arms:'#f35b12',legs:'#f35b12',feet:'#34383e',details:'#111315'}
};
const storageKey = 'andbotics-ac1-design-v1';
let design = {...defaultDesign}, activeZone = 'head', currentPreset = 'All white', toastTimer;
let partColors = {}, activePart = '', advancedMode = false, isolatePiece = false;
let selectionBox;
const validPartID = id => /^(?:[AB](?:[1-9]|1[0-4])|C(?:[1-9]|1[01])|[DE][1-5])$/.test(id);
function cleanParts(parts) {return Object.fromEntries(Object.entries(parts && typeof parts === 'object' ? parts : {}).filter(([id,color])=>validPartID(id) && colorValid(color)).map(([id,color])=>[id,color.toLowerCase()]));}
function sharedParts() {const raw = new URLSearchParams(location.hash.slice(1)).get('parts') || ''; return cleanParts(Object.fromEntries(raw.split(',').filter(Boolean).slice(0,49).map(pair=>{const [id,color]=pair.split(':');return [id,'#'+color];})));}
function editingPart() {return advancedMode && activePart;}
function setColor(color) {design[activeZone]=color; for(const id of Object.keys(partColors)) if(zoneFor(id)===activeZone) delete partColors[id]; sync();}
function paintPiece(color) {if(!editingPart() || !colorValid(color)) return; partColors[activePart]=color.toLowerCase();sync();}
function selectPiece(id) {activePart=id;sync();}
function stepPiece(direction) {if(!meshes.length) return; const index=meshes.findIndex(mesh=>mesh.userData.part.id===activePart);selectPiece(meshes[index<0 ? (direction>0?0:meshes.length-1) : (index+direction+meshes.length)%meshes.length].userData.part.id);}
const meshes = [];
let renderer, scene, camera, controls, model, modelHeight = 1, ready = false;
const colorValid = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function validDesign(value) { return value && Object.keys(zoneNames).every(key => colorValid(value[key])); }
function getDesignFromURL() {
  const encoded = new URLSearchParams(location.hash.slice(1)).get('design');
  if (!encoded) return null;
  const values = encoded.split('-').map(v => '#' + v);
  if (values.length !== 6 || !values.every(colorValid)) return null;
  return Object.fromEntries(Object.keys(zoneNames).map((key, i) => [key,values[i].toLowerCase()]));
}
try {
  const shared = getDesignFromURL();
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (shared) {design = shared; partColors = sharedParts();}
  else if (validDesign(saved?.colors)) {design = {...saved.colors}; partColors = cleanParts(saved.parts);}
} catch { /* Storage may be unavailable; customization still works. */ }
function notify(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),4000);
}
function zoneFor(id) {
  if (id === 'C9') return 'head';
  if (['C8','C10','C11','C3'].includes(id)) return 'details';
  if (id.startsWith('C')) return 'body';
  if (['A1','B1'].includes(id)) return 'feet';
  if (/^[AB]/.test(id)) return 'legs';
  if (['D1','E1','D3','E3'].includes(id)) return 'details';
  return 'arms';
}
function sync() {
  currentPreset = Object.keys(partColors).length ? 'Custom' : Object.values(design).every(c=>c.toLowerCase()==='#dedede') ? 'All white' : Object.keys(presets).find(p => Object.keys(zoneNames).every(k => presets[p][k] === design[k].toLowerCase())) || 'Custom';
  $('palette-name').textContent = currentPreset;
  document.querySelectorAll('.palette').forEach(b => { const active = b.dataset.palette === currentPreset; b.classList.toggle('active', active); b.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll('.zone').forEach(b => { const active = b.dataset.zone === activeZone; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); b.querySelector('i').style.background = design[b.dataset.zone]; });
  const value = design[activeZone].toLowerCase();
  $('color-label').textContent = zoneNames[activeZone] + ' color';
  const selected = meshes.find(mesh=>mesh.userData.part.id===activePart);
  const pieceColor = selected ? partColors[activePart] || design[selected.userData.zone] : '#dedede';
  $('piece-title').textContent = selected ? 'Color this piece' : 'Click a piece to color it';
  $('piece-position').textContent = selected ? `${meshes.indexOf(selected)+1} of 49 · Highlighted in the preview` : 'Choose directly on the robot';
  $('piece-picker').value=pieceColor; $('piece-hex').value=pieceColor.toUpperCase();
  $('piece-picker').disabled=$('piece-hex').disabled=$('isolate-piece').disabled=!selected;
  $('piece-hex').removeAttribute('aria-invalid');$('piece-error').hidden=true;
  $('clear-part').disabled = !selected || !partColors[activePart];
  $('clear-parts').disabled = !Object.keys(partColors).length;
  $('override-count').textContent = Object.keys(partColors).length ? `${Object.keys(partColors).length} ${Object.keys(partColors).length===1?'piece':'pieces'} customized` : '49 selectable pieces';
  document.querySelectorAll('#piece-swatches .swatch').forEach(b=>{b.disabled=!selected;const active=b.dataset.color===pieceColor;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('isolate-piece').setAttribute('aria-pressed',String(isolatePiece));
  $('color-name').textContent = colors.find(c => c[1] === value)?.[0] || 'Custom';
  $('custom-picker').value = value; $('hex').value = value.toUpperCase();
  $('hex').removeAttribute('aria-invalid'); $('hex-error').hidden = true;
  document.querySelectorAll('#swatches .swatch').forEach(b => { const active = b.dataset.color === value; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
  meshes.forEach(mesh => {mesh.material.color.set(partColors[mesh.userData.part.id] || design[mesh.userData.zone]);mesh.visible=!(advancedMode && isolatePiece && selected) || mesh===selected;});
  if(selectionBox) {selectionBox.visible=Boolean(advancedMode && selected);if(selected){model.updateMatrixWorld(true);selectionBox.setFromObject(selected);}}
  window.dispatchEvent(new CustomEvent('andbotics:design-change',{detail:{model:'AC-1',colors:{...design},parts:{...partColors}}}));
}
function selectZone(zone,part) {
  activeZone = zone; sync();
  $('part-hint').textContent = part ? `Editing the ${zoneNames[zone].toLowerCase()} section` : 'Tip: click the robot to select a section.';
}
for (const [name,palette] of Object.entries(presets)) {
  const button = document.createElement('button'); button.className = 'palette'; button.dataset.palette = name;
  button.setAttribute('aria-label',name + ' palette');
  const sample = document.createElement('span'); sample.className = 'palette-sample'; sample.setAttribute('aria-hidden','true');
  Object.values(palette).forEach(color => { const i = document.createElement('i'); i.style.background = color; sample.append(i); });
  button.append(sample,document.createTextNode(name)); button.onclick = () => { design = {...palette}; partColors = {}; sync(); };
  $('palettes').append(button);
}
for (const [key,name] of Object.entries(zoneNames)) {
  const button = document.createElement('button'); button.className = 'zone'; button.dataset.zone = key;
  const dot = document.createElement('i'); dot.className = 'zone-dot'; dot.setAttribute('aria-hidden','true');
  button.append(dot,document.createTextNode(name)); button.onclick = () => selectZone(key); $('zones').append(button);
}
for (const [name,color] of colors) {
  const button = document.createElement('button'); button.className = 'swatch'; button.style.background = color; button.dataset.color = color;
  button.setAttribute('aria-label',name); button.title = name;
  if (['White','Yellow'].includes(name)) button.style.setProperty('--check-color','#374932');
  button.onclick = () => { setColor(color); }; $('swatches').append(button);
}
$('custom-picker').oninput = event => {setColor(event.target.value);};
function commitHex(event) {
  let value = event.target.value.trim(); if (!value.startsWith('#')) value = '#' + value;
  if (!colorValid(value)) { $('hex').setAttribute('aria-invalid','true'); $('hex-error').hidden = false; return; }
  setColor(value.toLowerCase());
}
$('hex').oninput = commitHex;
$('hex').onchange = commitHex;
$('hex').onblur = commitHex;
$('hex').onkeydown = event => { if(event.key === 'Enter') $('hex').blur(); };
$('reset').onclick = () => {design = {...defaultDesign}; partColors = {}; activePart='';isolatePiece=false;selectZone('head'); notify('All 49 parts reset to #DEDEDE.');};
$('save').onclick = () => {
  try {localStorage.setItem(storageKey, JSON.stringify({version:2,model:'AC-1',colors:design,parts:partColors,savedAt:new Date().toISOString()})); notify('Your design is saved in this browser.');}
  catch {notify('Browser storage is unavailable. Use Export colors to keep your design.');}
};
$('share').onclick = async () => {
  const url = new URL(location.href); const params = new URLSearchParams({design:Object.keys(zoneNames).map(k => design[k].slice(1)).join('-')}); if(Object.keys(partColors).length) params.set('parts',Object.entries(partColors).map(([id,color])=>id+':'+color.slice(1)).join(',')); url.hash = params.toString();
  try {await navigator.clipboard.writeText(url.href); notify('Design link copied.');}
  catch { $('share-url').value = url.href; $('link-dialog').showModal(); $('share-url').select(); }
};
$('close-dialog').onclick = () => $('link-dialog').close();
function download(blob,name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),10000); }
$('export').onclick = () => download(new Blob([JSON.stringify({version:2,model:'AC-1',palette:currentPreset,colors:design,parts:partColors},null,2)],{type:'application/json'}),'andbotics-ac1-colors.json');
$('snapshot').onclick = () => {
  if (!ready) return;
  if(selectionBox) selectionBox.visible=false;
  const hidden=meshes.filter(mesh=>!mesh.visible);hidden.forEach(mesh=>mesh.visible=true);
  renderer.render(scene,camera);
  const source = $('canvas'), output = document.createElement('canvas'); output.width = source.width; output.height = source.height + 100;
  const ctx = output.getContext('2d'); ctx.fillStyle = '#eff1e8'; ctx.fillRect(0,0,output.width,output.height); ctx.drawImage(source,0,0);
  ctx.fillStyle = '#374932'; ctx.font = '24px sans-serif'; ctx.fillText('andbotics / AC-1',30,output.height - 60);
  Object.keys(zoneNames).forEach((key,i) => {ctx.fillStyle = design[key]; ctx.fillRect(30+i*36,output.height-38,25,15);});
  output.toBlob(blob => {if(blob) {download(blob,'andbotics-ac1-preview.png'); notify('Preview downloaded.');}},'image/png');
  sync();
};
window.addEventListener('hashchange', () => {const shared = getDesignFromURL(); if(shared) {design = shared; partColors = sharedParts(); sync(); notify('Shared design loaded.');}});
for(const [name,color] of colors) {
  const button=document.createElement('button');button.className='swatch';button.style.background=color;button.dataset.color=color;button.setAttribute('aria-label','Paint selected piece '+name.toLowerCase());button.title=name;button.disabled=true;
  if(['White','Yellow'].includes(name)) button.style.setProperty('--check-color','#374932');
  button.onclick=()=>paintPiece(color);$('piece-swatches').append(button);
}
$('advanced-toggle').onclick=()=>{advancedMode=!advancedMode;$('advanced-toggle').setAttribute('aria-pressed',String(advancedMode));$('piece-editor').hidden=!advancedMode;document.querySelector('.stage').classList.toggle('is-advanced',advancedMode);if(controls){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');}sync();};
$('previous-piece').onclick=()=>stepPiece(-1);$('next-piece').onclick=()=>stepPiece(1);
$('isolate-piece').onclick=()=>{isolatePiece=!isolatePiece;sync();};
$('piece-picker').oninput=event=>paintPiece(event.target.value);
function commitPieceHex(event) {let value=event.target.value.trim();if(!value.startsWith('#')) value='#'+value;if(!colorValid(value)){$('piece-hex').setAttribute('aria-invalid','true');$('piece-error').hidden=false;return;}paintPiece(value);}
$('piece-hex').oninput=commitPieceHex;$('piece-hex').onchange=commitPieceHex;
$('piece-hex').onkeydown=event=>{if(event.key==='Enter') commitPieceHex(event);};
$('clear-part').onclick = () => {if(activePart) delete partColors[activePart]; sync();};
$('clear-parts').onclick = () => {partColors={};sync();notify('Individual colors cleared. Section colors restored.');};
sync();

async function initViewer() {
  const canvas = $('canvas');
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setClearColor(0xeff1e8,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(31,1,.1,5000);
  controls = new OrbitControls(camera,canvas); controls.enableDamping = true; controls.dampingFactor = .085; controls.enablePan = false;
  controls.autoRotateSpeed = .8; controls.maxPolarAngle = Math.PI * .51; controls.minPolarAngle = Math.PI * .12;
  scene.add(new THREE.HemisphereLight(0xffffff,0x737d61,2.8));
  const key = new THREE.DirectionalLight(0xfff9ed,4); key.position.set(-250,450,350); key.castShadow = true; key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-250; key.shadow.camera.right=250; key.shadow.camera.top=350; key.shadow.camera.bottom=-250; key.shadow.camera.far=1200; key.shadow.normalBias=.35; scene.add(key);
  const fill = new THREE.DirectionalLight(0xe1eaff,1.2); fill.position.set(300,200,-200); scene.add(fill);
  model = new THREE.Group(); model.rotation.x = -Math.PI/2; scene.add(model);
  const response = await fetch('./assets/models/ac1/manifest.json'); if(!response.ok) throw new Error('Model files could not be loaded.');
  const manifest = await response.json();
  const bounds = [0,1,2].map(axis => [Math.min(...manifest.parts.map(p => p.bounds[axis][0])),Math.max(...manifest.parts.map(p => p.bounds[axis][1]))]);
  const cx = (bounds[0][0]+bounds[0][1])/2, cy = (bounds[1][0]+bounds[1][1])/2, bz = bounds[2][0];
  modelHeight = bounds[2][1]-bz;
  const loader = new STLLoader(), queue = [...manifest.parts]; let count=0;
  async function worker() {
    while(queue.length) {
      const part = queue.shift(), geometry = await loader.loadAsync('./assets/models/ac1/' + part.file); geometry.translate(-cx,-cy,-bz);
      const zone = zoneFor(part.id), material = new THREE.MeshStandardMaterial({color:design[zone],roughness:.66,metalness:0,side:THREE.DoubleSide});
      const mesh = new THREE.Mesh(geometry,material); mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData = {part,zone}; meshes.push(mesh); model.add(mesh);
      $('loading-label').textContent = `Preparing AC-1 · ${++count} / ${manifest.parts.length}`;
    }
  }
  await Promise.all(Array.from({length:5},worker));
  meshes.sort((a,b)=>a.userData.part.id.localeCompare(b.userData.part.id,undefined,{numeric:true}));
  selectionBox=new THREE.BoxHelper(meshes[0],0x3b8c88);selectionBox.material.depthTest=false;selectionBox.material.transparent=true;selectionBox.material.opacity=.85;selectionBox.renderOrder=10;selectionBox.visible=false;scene.add(selectionBox);
  $('advanced-toggle').disabled=false;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(modelHeight*8,modelHeight*8),new THREE.ShadowMaterial({color:0x526040,opacity:.16}));
  floor.rotation.x = -Math.PI/2; floor.position.y=-.7; floor.receiveShadow=true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(modelHeight*.46,modelHeight*.462,120),new THREE.MeshBasicMaterial({color:0xc5cebb,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.y=-.5; scene.add(ring);
  function resize() {
    const rect = $('viewer').getBoundingClientRect(); renderer.setSize(rect.width,rect.height,false); camera.aspect=rect.width/rect.height; camera.updateProjectionMatrix();
    if (ready) setView(currentView);
  }
  let currentView = 'studio';
  function setView(view) {
    currentView=view; const distance=modelHeight * Math.max(2.35,1.5/camera.aspect);
    controls.target.set(0,modelHeight*.48,0);
    camera.position.set(view==='studio'?distance*.36:0,modelHeight*(view==='studio'?.77:.5),view==='back'?-distance:distance);
    controls.minDistance=modelHeight*.75; controls.maxDistance=modelHeight*4.8; controls.update();
    document.querySelectorAll('[data-view]').forEach(b => {b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  }
  document.querySelectorAll('[data-view]').forEach(b => {b.disabled=false;b.onclick=()=>{controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');setView(b.dataset.view);};});
  $('rotate').disabled=false; $('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
  const raycaster = new THREE.Raycaster(); let down;
  canvas.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  canvas.addEventListener('pointerup',event=>{
    if(!down || Math.hypot(event.clientX-down[0],event.clientY-down[1])>5) return;
    const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hit=raycaster.intersectObjects(meshes.filter(mesh=>mesh.visible))[0];if(hit) {if(advancedMode) selectPiece(hit.object.userData.part.id);else selectZone(hit.object.userData.zone,true);}
  });
  canvas.addEventListener('keydown',event=>{
    if(advancedMode && ['[',']'].includes(event.key)){event.preventDefault();stepPiece(event.key==='['?-1:1);return;}
    const moves={ArrowLeft:-.15,ArrowRight:.15};
    if(event.key in moves){event.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),moves[event.key]);camera.position.copy(controls.target).add(offset);controls.update();}
    if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(event.key==='ArrowUp'?.9:1.1);offset.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset);controls.update();}
  });
  controls.addEventListener('start',()=>{controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;renderer.setAnimationLoop(null);$('model-status').textContent='Preview paused';$('loading').hidden=false;$('loading-label').textContent='3D preview interrupted. Reload to restore it.';$('snapshot').disabled=true;});
  resize(); setView('studio'); ready=true; new ResizeObserver(resize).observe($('viewer'));
  renderer.setAnimationLoop(()=>{if(!document.hidden && ready){controls.update();renderer.render(scene,camera);}});
  $('loading').hidden=true;$('snapshot').disabled=false;$('model-status').textContent='Live 3D preview';$('viewer').dataset.loadedParts=String(meshes.length);sync();
}
initViewer().catch(error=>{
  console.error(error);$('model-status').textContent='Preview unavailable';$('loading-label').textContent='3D preview unavailable. Reload in a WebGL-enabled browser.';
  document.querySelector('.loader').hidden=true;
});
