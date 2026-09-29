import React, { useEffect, useState } from 'react';
import {
    auth,
    collection,
    doc,
    firestore,
    getDocs,
    runtimeFirebaseConfig,
    serverTimestamp,
    setDoc,
} from '../../services/firebaseApi';
import './CloneFirebaseProjectsSettings.css';

const EMPTY_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
    databaseURL: '',
};

const FIELDS = [
    ['apiKey', 'API key'],
    ['authDomain', 'Domínio de autenticação'],
    ['projectId', 'ID do projeto'],
    ['storageBucket', 'Bucket do Storage'],
    ['messagingSenderId', 'ID do remetente'],
    ['appId', 'ID do aplicativo Web'],
    ['measurementId', 'Measurement ID (opcional)'],
    ['databaseURL', 'URL do Realtime Database (opcional)'],
];

const REQUIRED_FIELDS = FIELDS.slice(0, 6).map(([key]) => key);
const safeEnvValue = value => `"${String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const slugify = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function CloneFirebaseProjectsSettings() {
    const [projects, setProjects] = useState([]);
    const [form, setForm] = useState({ name: '', slug: '', repository: '', ...EMPTY_CONFIG });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const loadProjects = async () => {
        setLoading(true);
        try {
            const snapshot = await getDocs(collection(firestore, 'clone-firebase-projects'));
            setProjects(snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')));
        } catch (loadError) {
            setError(`Não foi possível carregar os projetos Firebase cadastrados: ${loadError.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadProjects(); }, []);

    const update = (field, value) => {
        setMessage('');
        setError('');
        setForm(current => ({
            ...current,
            [field]: value,
            ...(field === 'name' && !current.slug ? { slug: slugify(value) } : {}),
        }));
    };

    const save = async event => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');
        const id = editingId || slugify(form.slug || form.name);
        try {
            if (!form.name.trim() || !id) throw new Error('Informe o nome da Câmara e um identificador válido.');
            const missing = REQUIRED_FIELDS.filter(key => !String(form[key] || '').trim());
            if (missing.length) throw new Error(`Preencha a configuração Firebase: ${missing.join(', ')}.`);
            if (form.projectId.trim() === String(runtimeFirebaseConfig.projectId || '').trim()) {
                throw new Error('O clone deve usar um projeto Firebase próprio, diferente do projeto conectado a este portal.');
            }
            if (!editingId && projects.some(project => project.id === id)) {
                throw new Error('Este identificador já está cadastrado. Selecione a Câmara na lista para editar sua configuração.');
            }
            const firebaseConfig = Object.fromEntries(
                FIELDS.map(([key]) => [key, String(form[key] || '').trim()]).filter(([, value]) => value),
            );
            await setDoc(doc(firestore, 'clone-firebase-projects', id), {
                name: form.name.trim(),
                slug: id,
                repository: form.repository.trim(),
                firebaseConfig,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.email || '',
            }, { merge: true });
            setForm({ name: '', slug: '', repository: '', ...EMPTY_CONFIG });
            setEditingId('');
            setMessage(`Configuração de ${form.name.trim()} salva. Baixe o arquivo de ambiente e configure o build do clone.`);
            await loadProjects();
        } catch (saveError) {
            setError(saveError.message || 'Não foi possível salvar a configuração.');
        } finally {
            setSaving(false);
        }
    };

    const edit = project => {
        setEditingId(project.id);
        setForm({
            name: project.name || '',
            slug: project.slug || project.id,
            repository: project.repository || '',
            ...EMPTY_CONFIG,
            ...(project.firebaseConfig || {}),
        });
        setMessage('');
        setError('');
    };

    const clearForm = () => {
        setEditingId('');
        setForm({ name: '', slug: '', repository: '', ...EMPTY_CONFIG });
        setMessage('');
        setError('');
    };

    const downloadEnv = project => {
        const config = project.firebaseConfig || {};
        const env = [
            '# Configuração do Firebase para este clone. Valores do SDK Web são públicos.',
            ...FIELDS.filter(([key]) => config[key]).map(([key]) =>
                `REACT_APP_FIREBASE_${key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}=${safeEnvValue(config[key])}`),
            '',
        ].join('\n');
        const url = URL.createObjectURL(new Blob([env], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `firebase-${project.slug || project.id}.env`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return <section className="clone-firebase-settings">
        <header className="clone-firebase-heading">
            <div><span>INSTÂNCIAS DO PORTAL</span><h2>Firebase dos clones</h2>
                <p>Cadastre o projeto Firebase próprio de cada Câmara e gere as variáveis de ambiente para o respectivo clone.</p></div>
        </header>

        <aside className="clone-firebase-notice">
            <strong>Como isso mantém cada Câmara independente</strong>
            <p>O arquivo gerado configura o Firebase no build do clone. Para desenvolvimento local, use-o como <code>.env.local</code>; em produção, cadastre as mesmas variáveis no ambiente do provedor de deploy e publique novamente. Authentication, Firestore, Storage e Functions passam a usar o projeto indicado pelo clone. O portal central não é consultado durante a execução do clone.</p>
            <small>Cadastre somente a configuração do SDK Web. Chaves de serviço, tokens e outros segredos ficam no Secret Manager/Cloud Functions do projeto de destino.</small>
        </aside>

        {message && <p className="clone-firebase-feedback success" role="status">{message}</p>}
        {error && <p className="clone-firebase-feedback error" role="alert">{error}</p>}

        <form className="clone-firebase-form" onSubmit={save}>
            <h3>{editingId ? 'Editar configuração' : 'Cadastrar Câmara'}</h3>
            <div className="clone-firebase-fields">
                <label><span>Nome da Câmara</span><input required value={form.name} onChange={event => update('name', event.target.value)} placeholder="Câmara Municipal de Aquiraz" /></label>
                <label><span>Identificador</span><input required readOnly={Boolean(editingId)} value={form.slug} onChange={event => update('slug', event.target.value)} placeholder="camara-aquiraz" /></label>
                <label className="wide"><span>Repositório GitHub do clone (opcional)</span><input value={form.repository} onChange={event => update('repository', event.target.value)} placeholder="teceudesenvolvo/camara-aquiraz" /></label>
                {FIELDS.map(([key, label]) => <label key={key}><span>{label}{!REQUIRED_FIELDS.includes(key) && ' · opcional'}</span><input value={form[key]} onChange={event => update(key, event.target.value)} autoComplete="off" /></label>)}
            </div>
            <div className="clone-firebase-actions"><button type="button" className="secondary-button" onClick={clearForm}>Limpar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuração'}</button></div>
        </form>

        <div className="clone-firebase-list">
            <div className="clone-firebase-list-heading"><h3>Câmaras cadastradas</h3><button type="button" className="secondary-button" onClick={loadProjects} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar lista'}</button></div>
            {loading ? <p>Carregando configurações...</p> : projects.length ? projects.map(project => <article key={project.id}>
                <div><strong>{project.name}</strong><span>{project.repository || project.slug || project.id}</span><small>Firebase: {project.firebaseConfig?.projectId || 'não informado'}</small></div>
                <div className="clone-firebase-actions"><button type="button" className="secondary-button" onClick={() => edit(project)}>Editar</button><button type="button" className="primary-button" onClick={() => downloadEnv(project)}>Baixar variáveis .env</button></div>
            </article>) : <p>Nenhuma Câmara cadastrada.</p>}
        </div>
    </section>;
}
