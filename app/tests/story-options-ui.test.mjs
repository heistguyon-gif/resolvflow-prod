import test from 'node:test';
import assert from 'node:assert/strict';
import { mountStory, template, browser, snapshot, json, act, pause } from './helpers/story-options-runtime.mjs';

async function basic(ui) { await ui.click('#story-tab-templates'); await ui.fill('#story-name', 'Campanha de exemplo'); await ui.upload(); }
async function link(ui) { await ui.click('#story-include-link'); await ui.fill('#story-url', 'https://example.test/oferta'); await ui.fill('#story-title', 'Saiba mais'); }
async function highlight(ui) { await ui.click('#story-create-highlight'); await ui.fill('#story-highlight', 'Novidades'); }
const publishButton = '#story-section-publish button.primary';
const targets = '.browserList input[type=checkbox]';

test('novo template: switches nativos nomeados, destaque e link desligados, sem sticker nem campos condicionais', async () => {
  const ui = await mountStory(); try {
    await ui.click('#story-tab-templates');
    assert.equal(ui.node('#story-create-highlight').getAttribute('role'), 'switch');
    assert.equal(ui.node('#story-create-highlight').checked, false);
    assert.equal(ui.node('label[for=story-create-highlight] > span:not([aria-hidden])').textContent.trim(), 'Criar destaque');
    assert.equal(ui.node('label[for=story-create-highlight] .optionState').textContent, 'Desligado');
    assert.equal(ui.node('#story-include-link').checked, false);
    for (const selector of ['#story-highlight','#story-url','#story-title','.sticker','.appearance','#story-size']) assert.equal(ui.doc.querySelector(selector), null);
    ui.node('#story-create-highlight').focus(); assert.equal(ui.doc.activeElement.id, 'story-create-highlight');
    await ui.click('label[for=story-create-highlight]'); assert.equal(ui.node('#story-highlight').required, true);
    assert.equal(ui.node('label[for=story-create-highlight] .optionState').textContent, 'Ligado');
    assert.equal(ui.node('#story-include-link').checked, false);
    await ui.click('#story-include-link'); assert.equal(ui.node('#story-url').required, true); assert.equal(ui.node('#story-title').required, true);
    assert.ok(ui.doc.querySelector('.customization .sticker'));
  } finally { await ui.close(); }
});

for (const createHighlight of [false,true]) for (const includeLink of [false,true]) {
  test(`salva combinação destaque=${createHighlight}, link=${includeLink} com payload explícito`, async () => {
    const ui = await mountStory(); try {
      await basic(ui); if (includeLink) await link(ui); if (createHighlight) await highlight(ui);
      await ui.submit(); assert.equal(ui.posts('/templates').length, 1);
      const form = ui.posts('/templates')[0].body;
      assert.equal(form.get('createHighlight'), String(createHighlight));
      assert.equal(form.get('highlightName'), createHighlight ? 'Novidades' : '');
      assert.equal(form.get('linkUrl'), includeLink ? 'https://example.test/oferta' : '');
      assert.equal(form.get('linkTitle'), includeLink ? 'Saiba mais' : '');
      assert.equal(form.has('includeLink'), false); assert.equal(form.has('image'), true);
      assert.equal(form.has('stickerStyle'), includeLink);
      assert.match(ui.node('.notice').textContent, /Template salvo/);
    } finally { await ui.close(); }
  });
}

test('desativar opções limpa valores e payload, oculta sticker/posição e não altera permissão', async () => {
  const ui = await mountStory(); try {
    await basic(ui); await link(ui); await highlight(ui);
    await ui.click('#story-include-link'); await ui.click('#story-create-highlight');
    assert.equal(ui.doc.querySelector('.customization .sticker'), null);
    assert.equal(ui.doc.querySelector('#story-x'), null);
    await ui.click('#story-include-link'); assert.equal(ui.node('#story-url').value, ''); assert.equal(ui.node('#story-title').value, '');
    await ui.click('#story-create-highlight'); assert.equal(ui.node('#story-highlight').value, '');
    await ui.click('#story-include-link'); await ui.click('#story-create-highlight'); await ui.submit();
    const form = ui.posts('/templates')[0].body;
    assert.equal(form.get('linkUrl'), ''); assert.equal(form.get('linkTitle'), ''); assert.equal(form.get('highlightName'), ''); assert.equal(form.get('createHighlight'), 'false');
  } finally { await ui.close(); }
});

test('validação condicional impede nome vazio, excessos e link inválido; desligado não exige campos ocultos', async () => {
  const ui = await mountStory(); try {
    await basic(ui); await highlight(ui); await ui.fill('#story-highlight', '   '); await ui.submit(); assert.equal(ui.posts().length, 0);
    await ui.fill('#story-highlight', 'a'.repeat(31)); await ui.submit(); assert.match(ui.doc.querySelector('[role=alert]').textContent, /30 caracteres/);
    await ui.click('#story-create-highlight'); await link(ui);
    for (const url of ['javascript:alert(1)','https://user:password@example.test/','not-a-url']) { await ui.fill('#story-url', url); await ui.submit(); assert.equal(ui.posts().length, 0); }
    await ui.fill('#story-url', 'https://example.test/'); await ui.fill('#story-title', 'x'.repeat(41)); await ui.submit(); assert.equal(ui.posts().length, 0);
    await ui.fill('#story-title', '  '); await ui.submit(); assert.equal(ui.posts().length, 0);
    await ui.click('#story-include-link'); await ui.submit(); assert.equal(ui.posts('/templates').length, 1);
  } finally { await ui.close(); }
});

test('template legado sem boolean mantém destaque/link e não exige storyOptions; novo draft segue desligado', async () => {
  const legacy = template({ createHighlight: undefined, highlightName: 'Arquivo legado', linkUrl: 'https://example.test/', linkTitle: 'Legado' });
  const ui = await mountStory({ state: snapshot({ templates: [legacy], browsers: [browser({ capabilities: undefined })] }) }); try {
    await ui.fill('#story-template', legacy.id);
    assert.match(ui.node('.templateDetails').textContent, /Arquivo legado/); assert.ok(ui.doc.querySelector('.templateDetails a'));
    assert.equal(ui.node(targets).disabled, false); await ui.click(targets); assert.equal(ui.node(publishButton).disabled, false);
    assert.match(ui.node('.templateGrid article').textContent, /Destaque · Arquivo legado · Com link/);
    assert.ok(ui.doc.querySelector('.templateGrid .sticker'));
    assert.equal(ui.node('#story-create-highlight').checked, false);
    await ui.click(publishButton); assert.equal(ui.posts('/publish').length, 1);
    assert.deepEqual(Object.keys(JSON.parse(ui.posts('/publish')[0].body)).sort(), ['requestId','targets','templateId']);
  } finally { await ui.close(); }
});

test('biblioteca e preflight sem link/destaque ignoram valores antigos irrelevantes e não mostram sticker', async () => {
  const plain = template({ linkTitle: 'Título antigo', highlightName: 'Nome antigo' });
  const ui = await mountStory({ state: snapshot({ templates: [plain], browsers: [browser()] }) }); try {
    await ui.fill('#story-template', plain.id);
    assert.match(ui.node('.templateGrid article').textContent, /Sem destaque · Sem link/);
    assert.doesNotMatch(ui.node('.templateDetails').textContent, /Nome antigo/);
    assert.match(ui.node('.templateDetails').textContent, /não será criado.*sem link/);
    assert.equal(ui.doc.querySelector('.templateDetails a'), null); assert.equal(ui.doc.querySelector('.sticker'), null);
  } finally { await ui.close(); }
});

for (const options of [{createHighlight:false,linkUrl:'https://example.test/'},{createHighlight:true,linkUrl:''},{createHighlight:false,linkUrl:''}]) {
  test(`preflight exige versão 1 declarada para ${JSON.stringify(options)}`, async () => {
    const ui = await mountStory({ state: snapshot({ templates: [template({...options,linkTitle:options.linkUrl?'Visitar':'',highlightName:options.createHighlight?'Coleção':''})], browsers: [browser({id:'old',capabilities:undefined}),browser({id:'new',sessionId:'s2',instagramUserId:'102'}),browser({id:'invalid',sessionId:'s3',instagramUserId:'103',capabilities:{storyOptions:true}})] }) }); try {
      await ui.fill('#story-template', 'template-1');
      const boxes=[...ui.doc.querySelectorAll(targets)]; assert.equal(boxes.filter(box=>!box.disabled).length,1);
      assert.equal(ui.doc.querySelectorAll('.browserStatus').length,3);
      assert.equal([...ui.doc.querySelectorAll('.browserStatus')].filter(el=>el.textContent==='Atualize a extensão').length,2);
      await ui.click('.selectionActions button'); await ui.click(publishButton);
      assert.deepEqual(JSON.parse(ui.posts('/publish')[0].body).targets.map(item=>item.browserId),['new']);
    } finally { await ui.close(); }
  });
}

test('troca de template e perda de capacidade bloqueiam seleção antiga sem descartá-la silenciosamente', async () => {
  const templates=[template({id:'legacy',createHighlight:undefined,linkUrl:'https://example.test/',linkTitle:'Visitar',highlightName:'Coleção'}),template({id:'plain'})];
  let state=snapshot({templates,browsers:[browser({capabilities:undefined})]});
  const ui=await mountStory({state}); try {
    await ui.fill('#story-template','legacy'); await ui.click(targets); await ui.fill('#story-template','plain');
    assert.equal(ui.node(targets).checked,true); assert.equal(ui.node(targets).disabled,false); assert.equal(ui.node(publishButton).disabled,true);
    await ui.click(targets); assert.equal(ui.node(targets).checked,false); assert.equal(ui.node(targets).disabled,true);
    state={...state,browsers:[browser()]}; ui.setState(state); await ui.refresh(); assert.equal(ui.node(targets).checked,false); await ui.click(targets);
    ui.setState({...state,browsers:[browser({capabilities:undefined})]}); await ui.refresh(); assert.equal(ui.node(publishButton).disabled,true); assert.equal(ui.node(targets).checked,true);
    assert.equal(ui.posts().length,0);
  } finally { await ui.close(); }
});

test('origem principal também aplica capacidades autoritativas', async () => {
  const ui=await mountStory({storiesOnly:false,state:snapshot({templates:[template()],browsers:[browser({extensionSource:'principal',capabilities:undefined})]})});try{
    await ui.fill('#story-template','template-1');assert.equal(ui.node(targets).disabled,true);assert.equal(ui.node('.browserStatus').textContent,'Atualize a extensão');
    ui.setState(snapshot({templates:[template()],browsers:[browser({extensionSource:'principal'})]}));await ui.refresh();assert.equal(ui.node(targets).disabled,false);
  }finally{await ui.close();}
});

test('modo storiesOnly preserva isolamento da origem workspace', async () => {
  // storiesOnly preserves workspace filtering; principal is not silently borrowed.
  const ui=await mountStory({state:snapshot({templates:[template()],browsers:[browser({extensionSource:'principal'})]})}); try {
    await ui.fill('#story-template','template-1'); assert.equal(ui.doc.querySelectorAll(targets).length,0); assert.equal(ui.node(publishButton).disabled,true);
  } finally { await ui.close(); }
});

test('histórico distingue story sem destaque, legado, parcial, incerto e recibo incompleto', async () => {
  const dispatch=(id,options,job)=>({id,templateName:id,createdAt:'2026-11-18T00:00:00Z',...options,jobs:[{id:'j',browserId:'b',label:'Perfil exemplo',status:'published',message:'published',storyId:'story-1',...job}]});
  const dispatches=[dispatch('simples',{createHighlight:false},{message:'story_published'}),dispatch('legado',{}, {highlightId:'highlight-1'}),dispatch('parcial',{createHighlight:true},{status:'partial',message:'highlight_failed'}),dispatch('incerto',{createHighlight:false},{status:'uncertain',message:'story_unconfirmed',storyId:undefined}),dispatch('incompleto',{createHighlight:false},{message:'story_published',storyId:undefined})];
  const ui=await mountStory({state:snapshot({dispatches})}); try {
    await ui.click('#story-tab-history'); const articles=[...ui.doc.querySelectorAll('.dispatch')];
    assert.equal(articles[0].querySelector('.badge').textContent,'Story publicado');assert.match(articles[0].textContent,/Destaque: não solicitado/);assert.doesNotMatch(articles[0].textContent,/destaque confirmados|Destaque: não confirmado/);
    assert.match(articles[1].textContent,/Story e destaque publicados.*highlight-1/);
    assert.match(articles[2].textContent,/Parcial · story publicado/);assert.match(articles[3].textContent,/Incerto/);
    assert.equal(articles[4].querySelector('.badge').dataset.status,'uncertain');assert.match(articles[4].textContent,/confirmação incompleta/);
  } finally { await ui.close(); }
});

test('viewer continua sem mutações e 403 revoga edição da interface', async () => {
  const viewer=await mountStory({role:'viewer'}); try { await basic(viewer); assert.ok(viewer.node('#story-create-highlight').closest('fieldset').disabled); await viewer.submit(); assert.equal(viewer.posts().length,0); } finally { await viewer.close(); }
  const ui=await mountStory({fetcher:call=>call.method==='POST'?json({code:'forbidden'},403):undefined}); try {
    await basic(ui);await ui.submit();assert.equal(ui.posts().length,1);assert.ok(ui.node('#story-create-highlight').closest('fieldset').disabled);await ui.submit();assert.equal(ui.posts().length,1);
  } finally { await ui.close(); }
});

test('falha de leitura preserva biblioteca, mas impede publicar com snapshot desatualizado', async () => {
  let fail=false;const ui=await mountStory({state:snapshot({templates:[template()],browsers:[browser()]}),fetcher:call=>{if(fail&&call.method==='GET')throw Error('Leitura indisponível');}});try{
    await ui.fill('#story-template','template-1');await ui.click(targets);fail=true;await ui.refresh();assert.equal(ui.doc.querySelectorAll('.templateGrid article').length,1);assert.equal(ui.node(publishButton).disabled,true);assert.equal(ui.posts().length,0);
  }finally{await ui.close();}
});

test('resultado incerto não repete automaticamente; ação explícita mantém requestId e destinatários', async () => {
  let fail=true;const ui=await mountStory({state:snapshot({templates:[template()],browsers:[browser()]}),fetcher:call=>{if(call.url.endsWith('/publish')&&fail)throw Error('Resposta perdida');}});try{
    await ui.fill('#story-template','template-1');await ui.click(targets);await ui.click(publishButton);assert.equal(ui.posts('/publish').length,1);assert.equal(ui.node(publishButton).disabled,true);
    const retry=[...ui.doc.querySelectorAll('button')].find(el=>el.textContent==='Consultar/repetir a mesma solicitação');assert.ok(retry);fail=false;
    await act(async()=>retry.click());await pause();assert.equal(ui.posts('/publish').length,2);assert.deepEqual(JSON.parse(ui.posts('/publish')[0].body),JSON.parse(ui.posts('/publish')[1].body));
  }finally{await ui.close();}
});
