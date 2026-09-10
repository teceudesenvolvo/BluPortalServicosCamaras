import React, { useMemo, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  LiaArrowLeftSolid,
  LiaArrowRightSolid,
  LiaCheckCircleSolid,
  LiaCloudSolid,
  LiaDownloadSolid,
  LiaFireSolid,
  LiaLandmarkSolid,
  LiaLockSolid,
  LiaRocketSolid,
  LiaUserShieldSolid,
} from 'react-icons/lia';
import { auth, firestore, hasRuntimeFirebaseConfig, runtimeFirebaseConfig } from '../firebase';
import { buildDefaultModuleSettings, DEFAULT_CMS_SETTINGS } from '../config/systemModules';

const STORAGE_KEY = 'portal-installation-draft-v1';
const CONFIG_FIELDS = [
  ['apiKey', 'API key', 'REACT_APP_FIREBASE_API_KEY'],
  ['authDomain', 'Domínio de autenticação', 'REACT_APP_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'ID do projeto', 'REACT_APP_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'Bucket do Storage', 'REACT_APP_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'ID do remetente', 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'ID do aplicativo Web', 'REACT_APP_FIREBASE_APP_ID'],
  ['measurementId', 'Measurement ID', 'REACT_APP_FIREBASE_MEASUREMENT_ID'],
  ['databaseURL', 'URL do Realtime Database', 'REACT_APP_FIREBASE_DATABASE_URL'],
];
const REQUIRED_CONFIG = CONFIG_FIELDS.slice(0, 6).map(([key]) => key);

const loadDraft = () => {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
};
const parseConfig = value => {
  const parsed = {};
  CONFIG_FIELDS.forEach(([key, , env]) => {
    const objectMatch = value.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`));
    const envMatch = value.match(new RegExp(`^${env}=(.*)$`, 'm'));
    parsed[key] = (objectMatch?.[1] || envMatch?.[1] || '').trim();
  });
  return parsed;
};
const envContent = config => `${CONFIG_FIELDS.map(([key, , env]) => `${env}=${config[key] || ''}`).join('\n')}\n`;
const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const InstallationWizard = () => {
  const saved = loadDraft();
  const [step, setStep] = useState(hasRuntimeFirebaseConfig ? 2 : Number(saved.step || 0));
  const [firebaseText, setFirebaseText] = useState(saved.firebaseText || '');
  const [config, setConfig] = useState(saved.config || (hasRuntimeFirebaseConfig ? runtimeFirebaseConfig : {}));
  const [tenant, setTenant] = useState(saved.tenant || { name: '', shortName: '', city: '', state: '', portalTitle: 'Portal de Serviços' });
  const [root, setRoot] = useState({ name: '', email: '', password: '', confirmation: '' });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const runtimeMatches = hasRuntimeFirebaseConfig && config.projectId === runtimeFirebaseConfig.projectId;
  const missingConfig = useMemo(() => REQUIRED_CONFIG.filter(key => !config[key]), [config]);

  const persist = (nextStep = step) => sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step: nextStep, firebaseText, config, tenant }));
  const go = direction => { setError(''); const next = Math.max(0, Math.min(4, step + direction)); persist(next); setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const importFirebase = () => {
    const parsed = parseConfig(firebaseText);
    if (REQUIRED_CONFIG.some(key => !parsed[key])) { setError('Cole o objeto firebaseConfig completo fornecido pelo Console do Firebase.'); return; }
    setConfig(parsed); setError('');
  };
  const downloadEnv = () => {
    const blob = new Blob([envContent(config)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = '.env.local'; link.click(); URL.revokeObjectURL(url);
    persist(2);
  };
  const finish = async event => {
    event.preventDefault(); setError('');
    if (!runtimeMatches) { setError('Reinicie o portal com o arquivo .env.local antes de criar o usuário root.'); return; }
    if (!tenant.name.trim() || !tenant.city.trim() || !tenant.state.trim()) { setError('Informe o nome da Câmara, a cidade e o estado.'); return; }
    if (!root.name.trim() || !/^\S+@\S+\.\S+$/.test(root.email)) { setError('Informe o nome e um e-mail válido para o usuário root.'); return; }
    if (root.password.length < 6 || root.password !== root.confirmation) { setError('Use uma senha com pelo menos 6 caracteres e confirme-a corretamente.'); return; }
    setWorking(true);
    try {
      let credential;
      try { credential = await createUserWithEmailAndPassword(auth, root.email.trim().toLowerCase(), root.password); }
      catch (authError) {
        if (authError.code !== 'auth/email-already-in-use') throw authError;
        credential = await signInWithEmailAndPassword(auth, root.email.trim().toLowerCase(), root.password);
      }
      const email = credential.user.email.toLowerCase();
      await setDoc(doc(firestore, 'users', credential.user.uid), { name: root.name.trim(), email, tipo: 'Admin', role: 'root', createdAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(firestore, 'system-control', 'portal'), {
        ...DEFAULT_CMS_SETTINGS,
        modules: buildDefaultModuleSettings(),
        tenant: { ...DEFAULT_CMS_SETTINGS.tenant, ...tenant, slug: slugify(tenant.city || tenant.name) },
        security: { rootEmails: [email] },
        installation: { completed: true, completedAt: serverTimestamp(), version: 1 },
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
        updatedBy: email,
      }, { merge: true });
      sessionStorage.removeItem(STORAGE_KEY); setStep(4);
    } catch (installError) {
      console.error('Falha na instalação:', installError);
      setError(installError.code === 'permission-denied'
        ? 'O Firebase recusou a gravação. Publique as regras do projeto e tente novamente.'
        : 'Não foi possível concluir. Confira o Authentication, o Firestore e as credenciais informadas.');
    } finally { setWorking(false); }
  };

  const steps = ['Preparar', 'Firebase', 'Câmara', 'Usuário root', 'Concluído'];
  return <main className="installation-page">
    <div className="installation-shell">
      <header className="installation-brand"><span><LiaLandmarkSolid /></span><div><small>PORTAL DE SERVIÇOS</small><h1>Instalação inicial</h1><p>Configure uma nova Câmara em poucos passos.</p></div></header>
      <ol className="installation-progress">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><b>{index < step ? <LiaCheckCircleSolid /> : index + 1}</b><span>{label}</span></li>)}</ol>
      <section className="installation-card">
        {step === 0 && <><div className="installation-heading"><LiaRocketSolid /><div><small>PASSO 1</small><h2>Prepare o Firebase</h2><p>Crie a infraestrutura que armazenará os dados desta Câmara.</p></div></div><div className="installation-checklist"><article><b>1</b><div><strong>Crie um projeto</strong><span>No Console do Firebase, crie um projeto com o nome da Câmara.</span></div></article><article><b>2</b><div><strong>Adicione um aplicativo Web</strong><span>Copie o objeto <code>firebaseConfig</code> mostrado ao registrar o aplicativo.</span></div></article><article><b>3</b><div><strong>Ative os serviços</strong><span>Ative Authentication por e-mail e senha, Firestore, Storage e Realtime Database.</span></div></article><article><b>4</b><div><strong>Instale o Firebase CLI</strong><span>Execute <code>npm install -g firebase-tools</code> e <code>firebase login</code> no servidor.</span></div></article></div></>}
        {step === 1 && <><div className="installation-heading"><LiaFireSolid /><div><small>PASSO 2</small><h2>Conecte o projeto Firebase</h2><p>Cole a configuração do aplicativo Web. Esses identificadores são próprios do SDK cliente.</p></div></div><label className="installation-field"><span>Objeto firebaseConfig</span><textarea rows="9" value={firebaseText} onChange={event => setFirebaseText(event.target.value)} placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "..."\n};'} /></label><button className="installation-secondary" type="button" onClick={importFirebase}><LiaCloudSolid /> Ler configuração</button>{config.projectId && <div className="installation-validation success"><LiaCheckCircleSolid /> Projeto identificado: <strong>{config.projectId}</strong></div>}</>}
        {step === 2 && <><div className="installation-heading"><LiaDownloadSolid /><div><small>PASSO 3</small><h2>Ative a conexão</h2><p>O React lê esta configuração ao iniciar. Baixe o arquivo e coloque-o na raiz do projeto.</p></div></div>{hasRuntimeFirebaseConfig ? <div className={`installation-validation ${runtimeMatches ? 'success' : 'error'}`}><LiaCheckCircleSolid /><div><strong>{runtimeMatches ? 'Firebase conectado' : 'Outro projeto está conectado'}</strong><span>Projeto em execução: {runtimeFirebaseConfig.projectId}</span></div></div> : <><button className="installation-download" type="button" disabled={missingConfig.length > 0} onClick={downloadEnv}><LiaDownloadSolid /> Baixar .env.local</button><pre className="installation-commands">npm install{`\n`}npm start</pre><p className="installation-help">Depois de salvar o arquivo na raiz, reinicie o portal e volte para <code>/instalacao</code>. O preenchimento desta sessão será preservado.</p></>}</>}
        {step === 3 && <><div className="installation-heading"><LiaLandmarkSolid /><div><small>PASSO 4</small><h2>Identifique a Câmara</h2><p>Estas informações serão usadas no portal, no painel e no aplicativo.</p></div></div><div className="installation-grid"><label className="installation-field wide"><span>Nome institucional</span><input value={tenant.name} onChange={event => setTenant({ ...tenant, name: event.target.value })} placeholder="Câmara Municipal de ..." /></label><label className="installation-field"><span>Nome curto</span><input value={tenant.shortName} onChange={event => setTenant({ ...tenant, shortName: event.target.value })} placeholder="Câmara de ..." /></label><label className="installation-field"><span>Título do portal</span><input value={tenant.portalTitle} onChange={event => setTenant({ ...tenant, portalTitle: event.target.value })} /></label><label className="installation-field"><span>Cidade</span><input value={tenant.city} onChange={event => setTenant({ ...tenant, city: event.target.value })} /></label><label className="installation-field"><span>UF</span><input maxLength="2" value={tenant.state} onChange={event => setTenant({ ...tenant, state: event.target.value.toUpperCase() })} /></label></div></>}
        {step === 4 && <div className="installation-finished"><LiaCheckCircleSolid /><h2>Instalação concluída</h2><p>O portal está conectado, a Câmara foi configurada e o usuário root está pronto.</p><a href="/controle-sistema">Abrir controle do sistema <LiaArrowRightSolid /></a></div>}
        {step === 3 && <form className="installation-root" onSubmit={finish}><div className="installation-heading compact"><LiaUserShieldSolid /><div><small>ADMINISTRAÇÃO</small><h2>Crie o primeiro usuário root</h2></div></div><div className="installation-grid"><label className="installation-field wide"><span>Nome completo</span><input value={root.name} onChange={event => setRoot({ ...root, name: event.target.value })} /></label><label className="installation-field wide"><span>E-mail</span><input type="email" value={root.email} onChange={event => setRoot({ ...root, email: event.target.value })} /></label><label className="installation-field"><span>Senha</span><input type="password" autoComplete="new-password" value={root.password} onChange={event => setRoot({ ...root, password: event.target.value })} /></label><label className="installation-field"><span>Confirmar senha</span><input type="password" autoComplete="new-password" value={root.confirmation} onChange={event => setRoot({ ...root, confirmation: event.target.value })} /></label></div><button className="installation-finish" disabled={working || !runtimeMatches}><LiaLockSolid /> {working ? 'Configurando...' : 'Concluir instalação'}</button></form>}
        {error && <div className="installation-validation error">{error}</div>}
        {step < 4 && <footer className="installation-actions"><button type="button" onClick={() => go(-1)} disabled={step === 0}><LiaArrowLeftSolid /> Voltar</button>{step === 0 && <button className="primary" onClick={() => go(1)}>Começar <LiaArrowRightSolid /></button>}{step === 1 && <button className="primary" onClick={() => go(1)} disabled={missingConfig.length > 0}>Continuar <LiaArrowRightSolid /></button>}{step === 2 && <button className="primary" onClick={() => go(1)} disabled={!runtimeMatches}>Continuar <LiaArrowRightSolid /></button>}</footer>}
      </section>
    </div>
  </main>;
};

export default InstallationWizard;
