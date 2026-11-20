import { useReducer, useRef } from 'react';
import type { Action, SimulationState } from './simulation';
import { initialState, MEDIA, plural, PROFILES, queueFor, SCHEDULE, simulationReducer } from './simulation';
import type { Emit } from './events';
import { focusSection } from './Offer';

const titles = ['Escolha os perfis de destino.', 'Escolha as mídias da campanha.', 'Revise antes de simular.'];

export function CampaignDemo({ emit, introduction, onProgress }: { emit: Emit; introduction: { title: string; description: string }; onProgress?: (state: SimulationState) => void }) {
  const [state, dispatch] = useReducer(simulationReducer, undefined, () => initialState());
  const currentState = useRef(state);
  const title = useRef<HTMLHeadingElement>(null);
  const queue = queueFor(state);
  const profileCount = state.profiles.length;
  const mediaCount = state.media.length;
  const chosenMedia = MEDIA.filter(media => state.media.includes(media.id));

  function change(action: Action) {
    const previous = currentState.current;
    const next = simulationReducer(previous, action);
    if (next === previous) return;
    currentState.current = next;
    dispatch(action);
    onProgress?.(next);
    if (action.type === 'profile') emit('profiles_change', next);
    else if (action.type === 'media') emit('media_change', next);
    else if (action.type === 'simulate') emit('queue_simulated', next);
    else if (action.type === 'reset') emit('demo_reset', next);
    else emit('step_view', next);
    if (next.step !== previous.step || action.type === 'simulate' || action.type === 'reset') requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
  }

  function skip() { emit('demo_skip', state); focusSection('planos'); }

  return (
    <section className="demo-section" aria-labelledby="demo">
      <div className="section-shell">
        <div className="section-intro demo-intro"><div><p className="eyebrow"><span className="live-dot" />Demonstração interativa</p><h2 id="demo" tabIndex={-1}>{introduction.title}</h2></div><p>{introduction.description}</p></div>
        <div className="product-frame">
          <div className="product-topbar"><span className="product-wordmark"><span className="mini-mark" aria-hidden="true">r.</span> resolvflow <span>/ Campanhas</span></span><span className="simulation-label"><span />Simulação local</span></div>
          <div className="product-layout">
            <aside className="product-rail" aria-label="Contexto da campanha"><div className="rail-label">Workspace de exemplo</div><div className="rail-context"><span aria-hidden="true">▤</span><b>Nova campanha</b></div><div className="rail-campaign"><span className="eyebrow">Editorial da semana</span><strong>Do conteúdo<br />à programação.</strong><p>Uma preparação. Todas as peças nos perfis que você escolher.</p></div><div className="rail-bottom"><span className="rail-line" /><p>Dados fictícios.<br />Sem publicação real.</p></div></aside>
            <div className="campaign-main">
              <div className="campaign-toolbar"><span className="campaign-status">{state.confirmed ? 'Programação simulada' : 'Rascunho da campanha'}</span><a href="#planos" onClick={skip}>Pular demo / Ver planos <span aria-hidden="true">↗</span></a></div>
              <ol className="stepper" aria-label="Etapas da demonstração">{(['Perfis', 'Mídias e agenda', 'Revisão e fila'] as const).map((label, index) => <li key={label} aria-current={state.step === index + 1 ? 'step' : undefined}><button type="button" disabled={index + 1 > state.step} onClick={() => change({ type: 'step', step: (index + 1) as 1 | 2 | 3 })}><span>{index + 1 < state.step ? '✓' : `0${index + 1}`}</span>{label}</button></li>)}</ol>
              <div className="stage" key={`${state.step}-${state.confirmed}`}>
                <div className="stage-heading"><div><p className="eyebrow">{state.confirmed ? 'Resultado da simulação' : `Etapa ${state.step} de 3`}</p><h3 tabIndex={-1} ref={title}>{state.confirmed ? 'Sua campanha de exemplo está organizada.' : titles[state.step - 1]}</h3></div><button className="reset-button" type="button" onClick={() => change({ type: 'reset' })}>Reiniciar exemplo <span aria-hidden="true">↺</span></button></div>
                {state.step === 1 && <>
                  <p className="stage-description">Cada mídia escolhida será programada em todos os perfis selecionados.</p>
                  <fieldset className="profile-options"><legend className="sr-only">Perfis da campanha</legend>{PROFILES.map(profile => <label className={`profile-option ${state.profiles.includes(profile.id) ? 'selected' : ''} ${!profile.available ? 'unavailable' : ''}`} key={profile.id}><input type="checkbox" name="profiles" value={profile.id} disabled={!profile.available} checked={state.profiles.includes(profile.id)} onChange={() => change({ type: 'profile', id: profile.id })} aria-describedby={`profile-status-${profile.id}`} /><span className={`profile-avatar avatar-${profile.id}`} aria-hidden="true">{profile.monogram}</span><span className="profile-copy"><strong>{profile.handle}</strong><span>{profile.name}</span><small>{profile.description}</small></span><span className={`connection-state ${!profile.available ? 'needs-review' : ''}`} id={`profile-status-${profile.id}`}>{profile.available ? 'Conectado' : 'Revisar conexão'}</span></label>)}</fieldset>
                  <div className="stage-note"><span aria-hidden="true">↳</span><p>Uma conexão que precisa de revisão fica fora da programação. As outras continuam disponíveis.</p></div>
                </>}
                {state.step === 2 && <>
                  <p className="stage-description">Selecione uma ou duas mídias preparadas. Nesta demo, cada peça tem um horário fixo para todos os destinos.</p>
                  <fieldset className="media-options"><legend className="sr-only">Mídias da campanha</legend>{MEDIA.map((media, index) => <label key={media.id} htmlFor={`media-${media.id}`} aria-label={`${media.title}, preparada para ${media.time}`} className={`media-option ${state.media.includes(media.id) ? 'selected' : ''}`}><input id={`media-${media.id}`} type="checkbox" name="media" value={media.id} checked={state.media.includes(media.id)} onChange={() => change({ type: 'media', id: media.id })} /><span className={`media-visual crop-${media.crop}`} aria-hidden="true"><span className="piece-tag">PEÇA 0{index + 1}<span>REELS · 9:16</span></span><span className="play-symbol">▷</span><span className="piece-footer">EDITORIAL DA SEMANA<span>{media.title}</span></span></span><span className="media-info"><strong>{media.title}</strong><span><span className="ready-state">Preparada</span><time dateTime={`${SCHEDULE.date}T${media.time}:00-03:00`}>{media.time}</time></span></span></label>)}</fieldset>
                  <div className="schedule-strip"><span className="schedule-icon" aria-hidden="true">▦</span><div><strong>{SCHEDULE.longLabel}</strong><span>{SCHEDULE.timezone} · {SCHEDULE.offset} · agenda fixa desta demonstração</span></div></div><p className="image-note">Imagens sintéticas ilustram as mídias preparadas. Não são vídeos reproduzíveis.</p>
                </>}
                {state.step === 3 && <>
                  {state.confirmed && <p className="stage-description">Você selecionou {plural(mediaCount, 'mídia', 'mídias')} e {plural(profileCount, 'perfil', 'perfis')}: {plural(queue.length, 'item', 'itens')} na fila simulada.</p>}
                  <div className={`result-equation ${state.confirmed ? 'confirmed' : ''}`} aria-label={`${profileCount} perfis vezes ${mediaCount} mídias igual a ${queue.length} itens na fila`}><div><strong>{profileCount.toString().padStart(2, '0')}</strong><span>{profileCount === 1 ? 'perfil selecionado' : 'perfis selecionados'}</span></div><span aria-hidden="true">×</span><div><strong>{mediaCount.toString().padStart(2, '0')}</strong><span>{mediaCount === 1 ? 'mídia preparada' : 'mídias preparadas'}</span></div><span aria-hidden="true">=</span><div className="equation-total"><strong data-queue-count>{queue.length.toString().padStart(2, '0')}</strong><span>itens {state.confirmed ? 'na fila simulada' : 'a programar'}</span></div></div>
                  <div className="queue-heading"><h4>{state.confirmed ? 'Fila da campanha' : 'Confira cada destino'}</h4><span>{SCHEDULE.label} · {SCHEDULE.offset}</span></div>
                  <ol className="queue-list" aria-label={state.confirmed ? 'Itens da fila simulada' : 'Itens previstos'}>{queue.map(item => <li key={item.id} data-queue-item><time dateTime={`${SCHEDULE.date}T${item.time}:00-03:00`}>{item.time}</time><span className={`queue-thumb crop-${item.media.crop}`} aria-hidden="true" /><div className="queue-copy"><strong>{item.media.title}</strong><span>{item.profile.handle}</span></div><span className={`queue-status ${state.confirmed ? 'done' : ''}`}>{state.confirmed ? 'Programado' : 'A programar'}</span></li>)}</ol>
                  <details className="caption-details"><summary>Conferir legendas das mídias <span aria-hidden="true">+</span></summary><div>{chosenMedia.map(media => <p key={media.id}><strong>{media.title}</strong>{media.caption}</p>)}</div></details>
                  <p className="queue-explanation">Cada linha é uma combinação de mídia e perfil. {state.confirmed ? '“Programado” é um estado simulado: nada foi enviado ou publicado.' : 'A simulação não verifica nem executa publicações reais.'}</p>
                </>}
              </div>
              <div className="campaign-actions"><div className="selection-summary" role="status" aria-live="polite">{state.step === 1 ? profileCount ? plural(profileCount, 'perfil selecionado', 'perfis selecionados') : 'Selecione ao menos um perfil.' : state.step === 2 ? mediaCount ? `${plural(mediaCount, 'mídia', 'mídias')} para ${plural(profileCount, 'perfil', 'perfis')}` : 'Selecione ao menos uma mídia.' : state.confirmed ? `${queue.length} itens simulados. Nenhuma publicação real.` : `${plural(profileCount, 'perfil', 'perfis')} × ${plural(mediaCount, 'mídia', 'mídias')} = ${queue.length} itens`}</div><div className="action-buttons">{state.step > 1 && <button type="button" className="button button-quiet" onClick={() => change({ type: 'back' })}>← Voltar</button>}{state.step < 3 ? <button type="button" className="button button-orange" disabled={state.step === 1 ? !profileCount : !mediaCount} onClick={() => change({ type: 'next' })}>{state.step === 1 ? 'Escolher mídias' : 'Revisar campanha'} <span aria-hidden="true">→</span></button> : !state.confirmed ? <button type="button" className="button button-orange" onClick={() => change({ type: 'simulate' })}>Simular programação <span aria-hidden="true">→</span></button> : <a className="button button-orange" href="#planos" onClick={() => { emit('offer_view', state); focusSection('planos'); }}>Comparar planos <span aria-hidden="true">↗</span></a>}</div></div>
            </div>
          </div>
          <div className="product-footer"><span><span className="live-dot" />Ambiente demonstrativo · dados fictícios</span><span>Sem conexão, envio ou publicação real.</span></div>
        </div>
        <div className="demo-takeaway"><p>Você prepara a campanha.<br /><strong>O painel organiza o próximo passo.</strong></p><p>Na operação real, a programação depende das conexões, das permissões e dos estados de cada conta. A demo mostra o fluxo, sem prometer resultado de publicação ou alcance.</p></div>
      </div>
    </section>
  );
}
