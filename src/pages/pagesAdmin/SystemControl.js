import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { LiaCheckCircleSolid, LiaCloudSolid, LiaCogSolid, LiaImageSolid, LiaMobileSolid, LiaPaletteSolid, LiaSaveSolid, LiaShieldAltSolid, LiaUploadSolid, LiaUserCogSolid } from 'react-icons/lia';
import AdminSidebar from '../../components/AdminSidebar';
import { auth, firestore } from '../../firebase';
import { buildDefaultModuleSettings, DEFAULT_CMS_SETTINGS, normalizeRootEmails, SYSTEM_MODULES } from '../../config/systemModules';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';

const TABS = [
    { id: 'general', label: 'Geral', icon: LiaCogSolid },
    { id: 'modules', label: 'Módulos e páginas', icon: LiaUserCogSolid },
    { id: 'design', label: 'Design e cores', icon: LiaPaletteSolid },
    { id: 'branding', label: 'Logomarca', icon: LiaImageSolid },
    { id: 'integrations', label: 'Endpoints e APIs', icon: LiaCloudSolid },
];
const TENANT_FIELDS = [['name','Nome oficial'],['shortName','Nome curto'],['slug','Identificador da câmara'],['city','Município'],['state','UF'],['portalTitle','Título do portal'],['address','Endereço'],['postalCode','CEP'],['phone','Telefone'],['email','E-mail institucional'],['website','Site institucional']];
const DESIGN_FIELDS = [['primaryColor','Cor principal'],['secondaryColor','Cor secundária'],['accentColor','Cor de destaque'],['backgroundColor','Fundo'],['textColor','Texto']];
const BRAND_ASSETS = [
    ['logoUrl','Logomarca principal','Usada na página inicial, login e documentos.'],
    ['compactLogoUrl','Marca compacta','Usada no menu lateral e espaços reduzidos.'],
    ['faviconUrl','Favicon','Ícone exibido na aba do navegador.'],
    ['loginCoverUrl','Imagem de login','Imagem de destaque da tela de autenticação.'],
];
const INTEGRATION_FIELDS = [['functionsBaseUrl','URL base das Cloud Functions'],['publicApiUrl','Endpoint da API pública'],['youtubeApiUrl','Endpoint da TV Câmara'],['appDownloadUrl','Página para baixar o aplicativo'],['androidStoreUrl','Google Play'],['iosStoreUrl','App Store'],['privacyUrl','Política de privacidade'],['supportEmail','E-mail de suporte']];
const API_FEATURES = [['youtube','Integração YouTube'],['notifications','Notificações push'],['email','Envio de e-mails'],['artificialIntelligence','Recursos de inteligência artificial'],['publicBalance','Consulta de saldo público']];

const SystemControl = () => {
    const { settings } = useSystemControl();
    const [activeTab, setActiveTab] = useState('general');
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [saved, setSaved] = useState(false);
    const current = useMemo(() => draft || {
        ...DEFAULT_CMS_SETTINGS, ...settings,
        modules: { ...buildDefaultModuleSettings(), ...settings.modules },
        tenant: { ...DEFAULT_CMS_SETTINGS.tenant, ...settings.tenant },
        design: { ...DEFAULT_CMS_SETTINGS.design, ...settings.design },
        branding: { ...DEFAULT_CMS_SETTINGS.branding, ...settings.branding },
        integrations: { ...DEFAULT_CMS_SETTINGS.integrations, ...settings.integrations },
        apiFeatures: { ...DEFAULT_CMS_SETTINGS.apiFeatures, ...settings.apiFeatures },
        security: { ...DEFAULT_CMS_SETTINGS.security, ...settings.security },
    }, [draft, settings]);

    const update = (section, field, value) => {
        setSaved(false);
        setDraft(previous => { const base = previous || current; return { ...base, [section]: { ...base[section], [field]: value } }; });
    };
    const updateGlobal = (field, value) => { setSaved(false); setDraft(previous => ({ ...(previous || current), [field]: value })); };
    const updateRootEmails = value => update('security', 'rootEmails', value.split(/[\n,;]+/).map(email => email.trim()));
    const uploadBrandAsset = async (field, file) => {
        if (!file) return;
        setUploading(field); setUploadError('');
        try { const result = await uploadFileToStorage(file, `system-control/${current.tenant.slug || 'camara'}/branding`); update('branding', field, result.url); }
        catch (error) { setUploadError(error.message || 'Não foi possível enviar a imagem.'); }
        finally { setUploading(''); }
    };
    const save = async () => {
        setSaving(true); setSaveError('');
        try {
            const rootEmails = normalizeRootEmails(current.security?.rootEmails);
            if (!rootEmails.length) throw new Error('Informe pelo menos um usuário root válido.');
            await setDoc(doc(firestore, 'system-control', 'portal'), { ...current, security: { ...current.security, rootEmails }, schemaVersion: 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '' }, { merge: true });
            setDraft(null); setSaved(true);
        } catch (error) {
            setSaveError(error.message || 'Não foi possível salvar as configurações.');
        } finally { setSaving(false); }
    };

    return <div className="dashboard-layout"><AdminSidebar /><main className="dashboard-content system-control-page">
        <header className="system-control-header"><div><span><LiaShieldAltSolid /> CMS da Câmara</span><h1>Controle do sistema</h1><p>Personalize a instituição, o portal, o painel administrativo e o aplicativo.</p></div><button onClick={save} disabled={saving}><LiaSaveSolid /> {saving ? 'Salvando...' : 'Salvar configurações'}</button></header>
        <nav className="system-control-tabs" aria-label="Seções de configuração">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}><Icon />{tab.label}</button>; })}</nav>
        {saved && <div className="system-save-feedback"><LiaCheckCircleSolid /> Configurações salvas e distribuídas para o portal.</div>}
        {saveError && <div className="system-upload-error">{saveError}</div>}

        {activeTab === 'general' && <>
            <section className="system-control-summary"><article><LiaCogSolid /><div><strong>{SYSTEM_MODULES.length}</strong><span>Módulos configuráveis</span></div></article><article><LiaUserCogSolid /><div><strong>{SYSTEM_MODULES.filter(item => current.modules[item.id]?.admin !== false).length}</strong><span>Ativos no admin</span></div></article><article><LiaMobileSolid /><div><strong>{SYSTEM_MODULES.filter(item => current.modules[item.id]?.app && item.app).length}</strong><span>Ativos no aplicativo</span></div></article></section>
            <SettingsCard title="Identificação da Câmara" description="Esses dados formam a identidade do tenant e permitem reutilizar o projeto em outros municípios."><div className="system-fields-grid">{TENANT_FIELDS.map(([field,label]) => <Field key={field} label={label} value={current.tenant[field]} onChange={value => update('tenant', field, value)} />)}</div></SettingsCard>
            <SettingsCard title="Usuários root" description="Estes usuários podem acessar o controle do sistema e administrar toda a instalação."><label className="system-field"><span>E-mails dos usuários root</span><textarea value={(current.security?.rootEmails || []).join('\n')} onChange={event => updateRootEmails(event.target.value)} placeholder="administrador@camara.gov.br" rows="4" /><small>Informe um e-mail por linha. Mantenha ao menos um usuário root ativo.</small></label></SettingsCard>
            <section className="data-card system-global-card"><div><h2>Funcionamento geral</h2><p>Defina um aviso de manutenção compartilhado com o portal e o aplicativo.</p></div><Switch checked={Boolean(current.maintenance)} onChange={value => updateGlobal('maintenance', value)} label="Modo manutenção" /><textarea value={current.maintenanceMessage || ''} onChange={event => updateGlobal('maintenanceMessage', event.target.value)} placeholder="Mensagem exibida durante a manutenção" rows="2" /></section>
        </>}

        {activeTab === 'modules' && <section className="data-card system-modules-card"><SectionHeader title="Páginas e módulos" description="Desative uma superfície para ocultar atalhos e impedir o acesso pela rota." /><div className="system-module-head"><span>Módulo</span><span>Admin</span><span>Portal</span><span>Aplicativo</span></div><div className="system-module-list">{SYSTEM_MODULES.map(module => <article key={module.id}><div><strong>{module.name}</strong><small>{module.description}</small></div>{['admin','portal','app'].map(surface => <Switch key={surface} compact disabled={surface === 'app' && !module.app} checked={surface === 'app' && !module.app ? false : current.modules[module.id]?.[surface] !== false} onChange={value => update('modules', module.id, { ...current.modules[module.id], [surface]: value })} />)}</article>)}</div></section>}

        {activeTab === 'design' && <SettingsCard title="Design e cores" description="Tema visual aplicado globalmente por variáveis CSS."><div className="system-design-layout"><div className="system-fields-grid colors">{DESIGN_FIELDS.map(([field,label]) => <label key={field} className="system-field"><span>{label}</span><div className="system-color-field"><input type="color" value={current.design[field]} onChange={event => update('design',field,event.target.value)} /><input value={current.design[field]} onChange={event => update('design',field,event.target.value)} /></div></label>)}<Field label="Arredondamento dos componentes" type="number" value={current.design.borderRadius} onChange={value => update('design','borderRadius',Number(value))} /><Field label="Família tipográfica" value={current.design.fontFamily} onChange={value => update('design','fontFamily',value)} /></div><div className="system-theme-preview" style={{ '--preview-primary': current.design.primaryColor, '--preview-secondary': current.design.secondaryColor, '--preview-accent': current.design.accentColor, '--preview-bg': current.design.backgroundColor, '--preview-text': current.design.textColor, '--preview-radius': `${current.design.borderRadius}px` }}><span>Pré-visualização</span><h3>{current.tenant.portalTitle}</h3><p>Identidade visual da {current.tenant.shortName}.</p><button>Botão principal</button><b>Informação em destaque</b></div></div></SettingsCard>}

        {activeTab === 'branding' && <SettingsCard title="Logomarca e imagens" description="Envie cada arquivo diretamente para o Firebase Storage. Limite de 5 MB por imagem."><div className="system-brand-assets">{BRAND_ASSETS.map(([field,label,description]) => <article key={field}><div className={`system-brand-thumbnail ${field === 'loginCoverUrl' ? 'cover' : ''}`}>{current.branding[field] ? <img src={current.branding[field]} alt={label} /> : <LiaImageSolid />}</div><div><strong>{label}</strong><span>{description}</span>{current.branding[field] && <small>Imagem carregada</small>}</div><label className="system-upload-button"><LiaUploadSolid />{uploading === field ? 'Enviando...' : current.branding[field] ? 'Substituir arquivo' : 'Selecionar arquivo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" disabled={Boolean(uploading)} onChange={event => uploadBrandAsset(field,event.target.files?.[0])} /></label></article>)}</div>{uploadError && <p className="system-upload-error">{uploadError}</p>}<div className="system-fields-grid branding-meta"><Field label="Descrição acessível da logomarca" value={current.branding.logoAlt} onChange={value => update('branding','logoAlt',value)} /></div></SettingsCard>}

        {activeTab === 'integrations' && <><SettingsCard title="Endpoints públicos" description="URLs consumidas pelo portal e pelo aplicativo. Chaves secretas permanecem nas variáveis protegidas das Cloud Functions."><div className="system-fields-grid">{INTEGRATION_FIELDS.map(([field,label]) => <Field key={field} label={label} type={field === 'supportEmail' ? 'email' : 'url'} value={current.integrations[field]} onChange={value => update('integrations',field,value)} />)}</div></SettingsCard><SettingsCard title="Serviços e APIs" description="Controle quais integrações podem ser utilizadas pelas interfaces."><div className="system-api-grid">{API_FEATURES.map(([field,label]) => <article key={field}><div><strong>{label}</strong><small>{current.apiFeatures[field] ? 'Disponível' : 'Desativado'}</small></div><Switch checked={Boolean(current.apiFeatures[field])} onChange={value => update('apiFeatures',field,value)} /></article>)}</div><p className="system-security-note"><LiaShieldAltSolid /> Tokens, senhas e chaves privadas devem ser configurados como secrets das Cloud Functions e nunca salvos neste documento.</p></SettingsCard></>}
    </main></div>;
};

const SectionHeader = ({ title, description }) => <div className="card-header"><div><h2>{title}</h2><p>{description}</p></div></div>;
const SettingsCard = ({ title, description, children }) => <section className="data-card system-settings-card"><SectionHeader title={title} description={description} />{children}</section>;
const Field = ({ label, value = '', onChange, type = 'text' }) => <label className="system-field"><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} /></label>;
const Switch = ({ checked, onChange, label = '', disabled = false, compact = false }) => <label className={`system-switch ${compact ? 'compact' : ''}`}><input type="checkbox" disabled={disabled} checked={checked} onChange={event => onChange(event.target.checked)} /><span />{label}</label>;

export default SystemControl;
