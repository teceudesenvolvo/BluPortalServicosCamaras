import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { LiaCalendarAltSolid, LiaCheckSquareSolid, LiaClockSolid, LiaCogSolid, LiaMicrophoneSolid, LiaUsersSolid } from 'react-icons/lia';
import { firestore } from '../firebase';
import { LEGISLATIVE_COLLECTIONS } from '../config/legislativeDataModel';

const clockValue = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const panelBackgrounds = {
  nocturno: 'radial-gradient(circle at 50% 10%, #12365b 0, #061221 48%, #02070f 100%)',
  institucional: 'radial-gradient(circle at 50% 4%, #0b7a83 0, #074866 42%, #061b35 100%)',
  azul: 'radial-gradient(circle at 18% 8%, #1d78bb 0, #0a345f 45%, #04172d 100%)',
  claro: 'radial-gradient(circle at 50% 0, #f4fbff 0, #dceefa 52%, #c7e0f2 100%)',
};
const initialPanelConfig = { background: 'nocturno', imageUrl: '' };

export default function LegislativeVotingPanel() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [votes, setVotes] = useState([]);
  const [councilors, setCouncilors] = useState([]);
  const [matters, setMatters] = useState([]);
  const [clock, setClock] = useState(clockValue());
  const [now, setNow] = useState(Date.now());
  const [configOpen, setConfigOpen] = useState(false);
  const [panelConfig, setPanelConfig] = useState(initialPanelConfig);
  useEffect(() => { const timer = window.setInterval(() => { setClock(clockValue()); setNow(Date.now()); }, 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => onSnapshot(doc(firestore, LEGISLATIVE_COLLECTIONS.sessions, sessionId), snapshot => setSession(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)), [sessionId]);
  useEffect(() => onSnapshot(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')), snapshot => setCouncilors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setCouncilors([])), []);
  useEffect(() => {
    if (!session?.gabineteId) return undefined;
    return onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.matters), where('gabineteId', '==', session.gabineteId)), snapshot => setMatters(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setMatters([]));
  }, [session?.gabineteId]);
  useEffect(() => onSnapshot(query(collection(firestore, LEGISLATIVE_COLLECTIONS.votes), where('sessionId', '==', sessionId), where('publicPanel', '==', true)), snapshot => setVotes(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), () => setVotes([])), [sessionId]);
  useEffect(() => {
    const storageKey = `legislative-voting-panel:${session?.camaraId || sessionId}`;
    try { setPanelConfig({ ...initialPanelConfig, ...JSON.parse(window.localStorage.getItem(storageKey) || '{}') }); } catch { setPanelConfig(initialPanelConfig); }
  }, [session?.camaraId, sessionId]);
  useEffect(() => {
    const storageKey = `legislative-voting-panel:${session?.camaraId || sessionId}`;
    try { window.localStorage.setItem(storageKey, JSON.stringify(panelConfig)); } catch { /* Configuração local indisponível neste navegador. */ }
  }, [panelConfig, session?.camaraId, sessionId]);
  const latestVote = useMemo(() => [...votes].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0], [votes]);
  const totals = latestVote?.totals || { Sim: 0, Não: 0, Abstenção: 0 };
  const presentCouncilors = useMemo(() => (session?.attendanceIds || []).map(id => {
    const person = councilors.find(item => item.id === id);
    const name = person?.name || person?.nome || person?.email || id;
    return { id, name, avatar: person?.photoURL || person?.photoUrl || person?.fotoUrl || person?.foto || person?.avatarUrl || '', initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?' };
  }), [session?.attendanceIds, councilors]);
  const sessionMatters = useMemo(() => matters.filter(item => (session?.matterIds || []).includes(item.id)), [matters, session?.matterIds]);
  const speechTimerStart = session?.speakerTimerStartedAt?.toDate ? session.speakerTimerStartedAt.toDate().getTime() : session?.speakerTimerStartedAt ? new Date(session.speakerTimerStartedAt).getTime() : 0;
  const speechElapsed = (session?.speakerElapsedSeconds || 0) + (session?.speakerTimerRunning && speechTimerStart ? Math.max(0, Math.floor((now - speechTimerStart) / 1000)) : 0);
  const speakerBonusSeconds = Object.values(session?.speakerTimeConcessions || {}).filter(item => item?.speakerId === session?.activeSpeakerId && item?.matterId === session?.currentMatterId).reduce((total, item) => total + (item.seconds || 0), 0);
  const speechRemaining = Math.max(0, (session?.speakerDurationSeconds || 300) + speakerBonusSeconds - speechElapsed);
  const speechClock = `${String(Math.floor(speechRemaining / 60)).padStart(2, '0')}:${String(speechRemaining % 60).padStart(2, '0')}`;
  const activeSpeaker = councilors.find(item => item.id === session?.activeSpeakerId);
  const activeSpeakerName = activeSpeaker?.name || activeSpeaker?.nome || activeSpeaker?.email || 'Orador na tribuna';
  const panelStyle = panelConfig.imageUrl.trim() ? { backgroundImage: `linear-gradient(rgba(2, 14, 29, .78), rgba(2, 14, 29, .9)), url("${panelConfig.imageUrl.trim().replace(/"/g, '%22')}")` } : { background: panelBackgrounds[panelConfig.background] || panelBackgrounds.nocturno };
  return <main className={`legislative-voting-panel panel-background-${panelConfig.background}`} style={panelStyle} aria-live="polite">
    <header className="legislative-voting-panel-header"><div><span>PAINEL DIGITAL DO PLENÁRIO</span><h1>{session?.title || 'Sessão legislativa'}</h1><p>{session?.type || 'Sessão'} · {session?.status || 'Aguardando abertura'}</p></div><div className="legislative-voting-header-tools">{session?.activeSpeakerId && <div className={`legislative-voting-speech-clock ${speechRemaining === 0 ? 'finished' : ''}`}><LiaMicrophoneSolid /><span>TRIBUNA</span><strong>{speechClock}</strong></div>}<div className="legislative-voting-clock"><LiaClockSolid /><strong>{clock}</strong><small>{new Date().toLocaleDateString('pt-BR')}</small></div><button type="button" className="legislative-panel-config-button" onClick={() => setConfigOpen(open => !open)} aria-expanded={configOpen} aria-label="Configurar visual do painel" title="Configurar painel"><LiaCogSolid /></button>{configOpen && <section className="legislative-panel-config-popover"><strong>Fundo do painel</strong><div className="legislative-panel-background-options">{Object.keys(panelBackgrounds).map(background => <button type="button" key={background} className={panelConfig.background === background && !panelConfig.imageUrl ? 'active' : ''} onClick={() => setPanelConfig(current => ({ ...current, background, imageUrl: '' }))}>{background}</button>)}</div><label>Imagem de fundo (URL)<input type="url" value={panelConfig.imageUrl} onChange={event => setPanelConfig(current => ({ ...current, imageUrl: event.target.value }))} placeholder="https://..." /></label><button type="button" className="legislative-panel-reset" onClick={() => setPanelConfig(initialPanelConfig)}>Restaurar padrão</button></section>}</div></header>
    <section className="legislative-voting-panel-grid"><article className="legislative-panel-attendance"><h2><LiaUsersSolid /> Parlamentares presentes ({presentCouncilors.length})</h2>{presentCouncilors.length ? presentCouncilors.map(person => <div key={person.id}><span className="legislative-panel-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : person.initials}</span><span className="online" /> <strong>{person.name}</strong><small>Presente</small></div>) : <p>Aguardando o registro de presença.</p>}</article><article className="legislative-panel-main legislative-panel-session-matters"><header><span>PAUTA DA SESSÃO</span><h2>{session?.currentMatterPhase === 'voting' ? 'Matéria em votação' : session?.currentMatterPhase === 'discussion' ? 'Matéria em discussão' : 'Matérias da sessão'}</h2></header><div>{sessionMatters.map(item => { const phase = item.id === session?.currentMatterId ? session?.currentMatterPhase : ''; return <article key={item.id} className={`legislative-panel-matter-card ${phase || ''}`}><small>{phase === 'voting' ? 'EM VOTAÇÃO' : phase === 'discussion' ? 'EM DISCUSSÃO' : item.status || 'EM PAUTA'}</small><strong>{item.type || 'Matéria'} nº {item.number}/{item.year}</strong><p>{item.title || item.summary || item.subject || 'Sem ementa informada.'}</p></article>; })}{!sessionMatters.length && <div className="legislative-panel-empty-matters"><div className="legislative-panel-icon"><LiaMicrophoneSolid /></div><strong>Aguardando pauta</strong><p>As matérias vinculadas à sessão aparecerão aqui.</p></div>}</div></article><article className="legislative-panel-results"><h2><LiaCheckSquareSolid /> Placar de votação</h2><div><strong className="yes">{totals.Sim || 0}</strong><span>SIM</span></div><div><strong className="no">{totals.Não || 0}</strong><span>NÃO</span></div><div><strong className="abstention">{totals.Abstenção || 0}</strong><span>ABST.</span></div>{latestVote && <b className={latestVote.outcome === 'Aprovada' ? 'approved' : 'rejected'}>{latestVote.outcome}</b>}{session?.activeSpeakerId && <section className={`legislative-panel-speaker ${session.speakerMicrophoneCut || speechRemaining === 0 ? 'paused' : ''}`}><span>ORADOR NA TRIBUNA</span><strong>{activeSpeakerName}</strong><b><LiaMicrophoneSolid /> {speechClock}</b></section>}</article></section>
    <footer><LiaCalendarAltSolid /> {session?.date ? `${session.date}${session.time ? ` · ${session.time}` : ''}` : 'Data da sessão a definir'}</footer>
  </main>;
}
