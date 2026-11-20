import test from 'node:test';
import assert from 'node:assert/strict';
import { mountStory, template, browser, snapshot, json, act, pause } from './helpers/story-options-runtime.mjs';

const handleSelector='.customization .rotationHandle';
const stickerSelector='.customization .sticker';
const publishSelector='#story-section-publish button.primary';
async function editor(ui){await ui.click('#story-tab-templates');await ui.fill('#story-name','Story exemplo');await ui.upload();await ui.click('#story-include-link');await ui.fill('#story-url','https://example.test/');await ui.fill('#story-title','Saiba mais');}
function angle(ui){return Number(ui.node('#story-rotation').value);}
function position(ui){return [ui.node('#story-x').value,ui.node('#story-y').value];}
async function key(ui,selector,key,shiftKey=false){const event=new ui.dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true});await act(async()=>ui.node(selector).dispatchEvent(event));await pause();return event;}
function geometry(ui){
  const captures=new WeakMap();
  for(const el of [ui.node(handleSelector),ui.node(stickerSelector)]){
    captures.set(el,new Set());
    el.setPointerCapture=id=>captures.get(el).add(id);
    el.hasPointerCapture=id=>captures.get(el).has(id);
    el.releasePointerCapture=id=>captures.get(el).delete(id);
  }
  const box={left:100,top:50,width:200,height:400};
  ui.node('.customization .preview').getBoundingClientRect=()=>box;
  ui.node(stickerSelector).getBoundingClientRect=()=>{
    // Axis-aligned DOM rect of a rotated 100×20 sticker, center invariant.
    const rad=angle(ui)*Math.PI/180;
    const width=Math.abs(Math.cos(rad))*100+Math.abs(Math.sin(rad))*20;
    const height=Math.abs(Math.sin(rad))*100+Math.abs(Math.cos(rad))*20;
    return {left:200-width/2,top:350-height/2,width,height};
  };
  return {box,captures,center:{x:200,y:350}};
}
async function pointer(ui,node,type,{x=220,y=270,id=1,pointerType='mouse',isPrimary=true,button=0}={}){
  const event=new ui.dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:Number.isFinite(x)?x:0,clientY:Number.isFinite(y)?y:0,button});
  for(const[k,v]of Object.entries({pointerId:id,pointerType,isPrimary,clientX:x,clientY:y}))Object.defineProperty(event,k,{value:v});
  await act(async()=>node.dispatchEvent(event));await pause();return event;
}

test('rotação começa 0, slider 1° com limites e sem controle/sticker em Story normal',async()=>{
  const ui=await mountStory();try{
    assert.equal(ui.doc.querySelector('#story-rotation'),null);assert.equal(ui.doc.querySelector(handleSelector),null);
    await editor(ui);const slider=ui.node('#story-rotation');assert.equal(angle(ui),0);assert.equal(slider.min,'-180');assert.equal(slider.max,'180');assert.equal(slider.step,'1');assert.equal(slider.type,'range');
    assert.equal(ui.node(handleSelector).type,'button');assert.equal(ui.node(handleSelector).getAttribute('aria-label'),'Girar botão do link');
    assert.ok(ui.doc.getElementById(ui.node(handleSelector).getAttribute('aria-describedby')));
    await ui.fill('#story-rotation','45');assert.equal(slider.getAttribute('aria-valuetext'),'45 graus');assert.equal(ui.node(stickerSelector).style.getPropertyValue('--rotation'),'45deg');
    await ui.submit();assert.equal(ui.posts('/templates')[0].body.get('stickerRotation'),'45');
    assert.equal(ui.posts('/templates')[0].body.get('createHighlight'),'false');
  }finally{await ui.close();}
});

for(const pointerType of ['mouse','touch'])test(`alça ${pointerType}: captura própria, sem salto inicial, giro horário/anti-horário sem mover`,async()=>{
  const ui=await mountStory();try{
    await editor(ui);await ui.fill('#story-rotation','30');const before=position(ui);const {captures}=geometry(ui);const handle=ui.node(handleSelector);
    await pointer(ui,handle,'pointerdown',{pointerType});assert.equal(angle(ui),30);assert.ok(captures.get(handle).has(1));assert.equal(ui.doc.activeElement,handle);
    await pointer(ui,handle,'pointermove',{pointerType});assert.equal(angle(ui),30);
    await pointer(ui,handle,'pointermove',{x:280,y:370,pointerType});assert.equal(angle(ui),120);assert.deepEqual(position(ui),before);
    await pointer(ui,handle,'pointermove',{x:120,y:330,pointerType});assert.equal(angle(ui),-60);assert.deepEqual(position(ui),before);
    await pointer(ui,handle,'pointerup',{pointerType});assert.equal(captures.get(handle).size,0);
    await pointer(ui,handle,'pointermove',{x:280,y:370,pointerType});assert.equal(angle(ui),-60);assert.equal(ui.posts().length,0);
  }finally{await ui.close();}
});

test('ignora pointer secundário, botão direito, centro degenerado e coordenadas não finitas',async()=>{
  const ui=await mountStory();try{
    await editor(ui);geometry(ui);const handle=ui.node(handleSelector);
    for(const details of [{isPrimary:false},{button:2},{x:200,y:350},{x:NaN}]){await pointer(ui,handle,'pointerdown',details);await pointer(ui,handle,'pointermove',{x:280,y:370});assert.equal(angle(ui),0);}
    await pointer(ui,handle,'pointerdown');await pointer(ui,handle,'pointerdown',{id:2,isPrimary:false,x:120,y:330});await pointer(ui,handle,'pointermove',{id:2,x:280,y:370});assert.equal(angle(ui),0);
    await pointer(ui,handle,'pointermove',{x:Infinity,y:350});assert.equal(angle(ui),0);
    await pointer(ui,handle,'pointermove',{x:200,y:350});assert.equal(angle(ui),0);
    await pointer(ui,handle,'pointermove',{x:280,y:370});assert.equal(angle(ui),90);
  }finally{await ui.close();}
});

for(const end of ['pointercancel','lostpointercapture'])test(`${end} encerra gesto; falha de capture não altera a rotação`,async()=>{
  const ui=await mountStory();try{
    await editor(ui);geometry(ui);const handle=ui.node(handleSelector);
    await pointer(ui,handle,'pointerdown');await pointer(ui,handle,'pointermove',{x:280,y:370});assert.equal(angle(ui),90);
    await pointer(ui,handle,end);await pointer(ui,handle,'pointermove',{x:120,y:330});assert.equal(angle(ui),90);
    handle.setPointerCapture=()=>{throw Error('Pointer not active');};await pointer(ui,handle,'pointerdown');await pointer(ui,handle,'pointermove',{x:120,y:330});assert.equal(angle(ui),90);
  }finally{await ui.close();}
});

test('centro acompanha scroll da moldura e travessia ±180 mantém delta curto',async()=>{
  const ui=await mountStory();try{
    await editor(ui);await ui.fill('#story-rotation','170');const {box}=geometry(ui);const handle=ui.node(handleSelector);
    const point=degrees=>({x:200+80*Math.cos(degrees*Math.PI/180),y:350+80*Math.sin(degrees*Math.PI/180)});
    await pointer(ui,handle,'pointerdown',point(179));box.top-=40;const moved=point(-179);await pointer(ui,handle,'pointermove',{x:moved.x,y:moved.y-40});assert.equal(angle(ui),172);assert.deepEqual(position(ui),['50','75']);
    await pointer(ui,handle,'pointerup');
  }finally{await ui.close();}
});

test('teclado da alça ajusta graus, mantém posição, respeita extremos e libera Tab',async()=>{
  const ui=await mountStory();try{
    await editor(ui);const before=position(ui);ui.node(handleSelector).focus();await key(ui,handleSelector,'ArrowRight');assert.equal(angle(ui),1);
    await key(ui,handleSelector,'ArrowUp',true);assert.equal(angle(ui),16);await key(ui,handleSelector,'ArrowLeft');assert.equal(angle(ui),15);
    await ui.fill('#story-rotation','180');await key(ui,handleSelector,'ArrowRight');assert.equal(angle(ui),180);
    await ui.fill('#story-rotation','-180');await key(ui,handleSelector,'ArrowLeft',true);assert.equal(angle(ui),-180);
    await key(ui,handleSelector,'Home');assert.equal(angle(ui),0);assert.equal((await key(ui,handleSelector,'Tab')).defaultPrevented,false);
    assert.deepEqual(position(ui),before);assert.equal(ui.posts().length,0);
  }finally{await ui.close();}
});

test('slider ignora fração; zerar não muda tamanho/posição; mover não muda giro',async()=>{
  const ui=await mountStory();try{
    await editor(ui);await ui.fill('#story-rotation','-45');await ui.fill('#story-rotation','22.5');assert.equal(angle(ui),-45);
    await key(ui,stickerSelector,'ArrowRight');assert.equal(ui.node('#story-x').value,'51');assert.equal(angle(ui),-45);
    await ui.fill('#story-size','130');const before=position(ui);const reset=[...ui.doc.querySelectorAll('button')].find(el=>el.textContent==='Zerar rotação');await act(async()=>reset.click());await pause();
    assert.equal(angle(ui),0);assert.equal(ui.node('#story-size').value,'130');assert.deepEqual(position(ui),before);
  }finally{await ui.close();}
});

test('desligar link durante gesto desmonta alça, zera giro e envia payload normal sem resíduo',async()=>{
  const ui=await mountStory();try{
    await editor(ui);geometry(ui);const old=ui.node(handleSelector);await pointer(ui,old,'pointerdown');await pointer(ui,old,'pointermove',{x:280,y:370});
    await ui.click('#story-include-link');assert.equal(ui.doc.querySelector(handleSelector),null);assert.equal(ui.doc.querySelector('#story-rotation'),null);
    await pointer(ui,old,'pointermove',{x:120,y:330});await ui.submit();const payload=ui.posts('/templates')[0].body;
    assert.equal(payload.get('stickerRotation'),'0');assert.equal(payload.get('linkUrl'),'');assert.equal(payload.get('linkTitle'),'');assert.equal(payload.get('highlightName'),'');assert.equal(payload.get('createHighlight'),'false');
    await ui.click('#story-include-link');assert.equal(angle(ui),0);
  }finally{await ui.close();}
});

test('biblioteca e revisão aplicam giro persistido; legado permanece 0 e sem link não desenha controle',async()=>{
  const templates=[template({id:'tilted',linkUrl:'https://example.test/',linkTitle:'Visitar',stickerRotation:-70}),template({id:'legacy',linkUrl:'https://example.test/',linkTitle:'Legado',createHighlight:undefined,highlightName:'Arquivo'}),template({id:'plain'})];
  const ui=await mountStory({state:snapshot({templates})});try{
    const cards=[...ui.doc.querySelectorAll('.templateGrid article')];assert.equal(cards[0].querySelector('.sticker').style.getPropertyValue('--rotation'),'-70deg');assert.equal(cards[1].querySelector('.sticker').style.getPropertyValue('--rotation'),'0deg');assert.equal(cards[2].querySelector('.sticker'),null);assert.equal(ui.doc.querySelector('.templateGrid .rotationHandle'),null);
    await ui.fill('#story-template','tilted');assert.match(ui.node('.templateDetails').textContent,/Rotação do link: -70°/);assert.equal(ui.node('#story-section-publish .sticker').style.getPropertyValue('--rotation'),'-70deg');
  }finally{await ui.close();}
});

for(const [label,templateOptions,capabilities,expected] of [
  ['044 legado sem giro',{createHighlight:undefined,linkUrl:'https://example.test/'},undefined,true],
  ['045 opções sem giro',{createHighlight:false,linkUrl:'https://example.test/',stickerRotation:0},{storyOptions:1},true],
  ['045 não gira',{createHighlight:false,linkUrl:'https://example.test/',stickerRotation:45},{storyOptions:1},false],
  ['rotation independente no modo legado',{createHighlight:true,linkUrl:'https://example.test/',stickerRotation:45},{stickerRotation:1},true],
  ['rotation não substitui storyOptions',{createHighlight:false,linkUrl:'https://example.test/',stickerRotation:45},{stickerRotation:1},false],
  ['046 ambos suportados',{createHighlight:false,linkUrl:'https://example.test/',stickerRotation:45},{storyOptions:1,stickerRotation:1},true],
  ['capacidade malformada',{createHighlight:false,linkUrl:'https://example.test/',stickerRotation:-180},{storyOptions:1,stickerRotation:true},false],
  ['sem link não exige giro',{createHighlight:false,linkUrl:'',stickerRotation:0},{storyOptions:1},true],
  ['template giro inválido não é liberado',{createHighlight:true,linkUrl:'https://example.test/',stickerRotation:181},{storyOptions:1,stickerRotation:1},false],
])test('preflight '+label,async()=>{
  const ui=await mountStory({state:snapshot({templates:[template({...templateOptions,linkTitle:templateOptions.linkUrl?'Visitar':'',highlightName:templateOptions.createHighlight===false?'':'Arquivo'})],browsers:[browser({capabilities})]})});try{
    await ui.fill('#story-template','template-1');assert.equal(ui.node('.browserList input').disabled,!expected);
    if(expected){await ui.click('.browserList input');assert.equal(ui.node(publishSelector).disabled,false);}else{assert.equal(ui.node(publishSelector).disabled,true);assert.match(ui.node('#story-section-publish').textContent,/Atualize/);}
    assert.equal(ui.posts().length,0);
  }finally{await ui.close();}
});

test('downgrade de capability preserva seleção mas bloqueia novo despacho',async()=>{
  const t=template({linkUrl:'https://example.test/',linkTitle:'Visitar',stickerRotation:90});const b=browser({capabilities:{storyOptions:1,stickerRotation:1}});
  const ui=await mountStory({state:snapshot({templates:[t],browsers:[b]})});try{
    await ui.fill('#story-template',t.id);await ui.click('.browserList input');ui.setState(snapshot({templates:[t],browsers:[{...b,capabilities:{storyOptions:1}}]}));await ui.refresh();assert.equal(ui.node('.browserList input').checked,true);assert.equal(ui.node(publishSelector).disabled,true);assert.match(ui.node('#story-section-publish').textContent,/rotação do link/);assert.equal(ui.posts().length,0);
  }finally{await ui.close();}
});

test('resposta de save com giro inválido não anuncia template confirmado',async()=>{
  const ui=await mountStory({fetcher:call=>call.url.endsWith('/templates')&&call.method==='POST'?json({template:template({stickerRotation:'45'})}):undefined});try{
    await editor(ui);await ui.fill('#story-rotation','45');await ui.submit();assert.equal(ui.posts('/templates').length,1);assert.doesNotMatch(ui.node('.notice').textContent,/Template salvo/);assert.match(ui.node('[role=alert]').textContent,/confirmar o template/);
  }finally{await ui.close();}
});
