import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { LiaCheckCircleSolid, LiaCloudSolid, LiaCogSolid, LiaDatabaseSolid, LiaEnvelopeSolid, LiaImageSolid, LiaMobileSolid, LiaPaletteSolid, LiaSaveSolid, LiaShieldAltSolid, LiaUploadSolid, LiaUserCogSolid, LiaSyncSolid } from 'react-icons/lia';
import SystemRolePermissions from '../../components/SystemRolePermissions';
import AdminSidebar from '../../components/AdminSidebar';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './SystemControlAppHome.css';
import SystemCollectionsManager from '../../components/SystemCollectionsManager';
import { auth, firestore } from '../../firebase';
import { APP_BOTTOM_BAR_MODULE_IDS, APP_BOTTOM_BAR_OPTIONS, APP_HOME_MODULE_IDS, APP_HOME_SHORTCUT_OPTIONS, buildDefaultModuleSettings, DEFAULT_APP_BOTTOM_BAR_MODULES, DEFAULT_APP_HOME_MODULES, DEFAULT_APP_HOME_SHORTCUTS, DEFAULT_CMS_SETTINGS, normalizeRootEmails, SYSTEM_MODULES } from '../../config/systemModules';
import { useSystemControl } from '../../contexts/SystemControlContext';
import { uploadFileToStorage } from '../../utils/firebaseStorageUtils';
import { DEFAULT_LEGISLATIVE_CONFIGURATION } from '../../services/LegislativeProcessService';

const TABS = [
    { id: 'permissions', label: 'Permissões', icon: LiaShieldAltSolid },
    { id: 'general', label: 'Geral', icon: LiaCogSolid },
    { id: 'modules', label: 'Módulos e páginas', icon: LiaUserCogSolid },
    { id: 'design', label: 'Design e cores', icon: LiaPaletteSolid },
    { id: 'branding', label: 'Logomarca', icon: LiaImageSolid },
    { id: 'integrations', label: 'Endpoints e APIs', icon: LiaCloudSolid },
    { id: 'legislative', label: 'API legislativa', icon: LiaCloudSolid },
    { id: 'collections', label: 'Coleções', icon: LiaDatabaseSolid },
    { id: 'updates', label: 'Atualizações', icon: LiaSyncSolid },
    { id: 'notifications', label: 'Notificações e e-mails', icon: LiaEnvelopeSolid },
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
    const [moduleConfigId, setModuleConfigId] = useState('');
    const [councilors, setCouncilors] = useState([]);
    const current = useMemo(() => draft || {
        ...DEFAULT_CMS_SETTINGS, ...settings,
        modules: { ...buildDefaultModuleSettings(), ...settings.modules },
        tenant: { ...DEFAULT_CMS_SETTINGS.tenant, ...settings.tenant },
        design: { ...DEFAULT_CMS_SETTINGS.design, ...settings.design },
        branding: { ...DEFAULT_CMS_SETTINGS.branding, ...settings.branding },
        integrations: { ...DEFAULT_CMS_SETTINGS.integrations, ...settings.integrations, legislativeApi: { ...DEFAULT_CMS_SETTINGS.integrations.legislativeApi, ...settings.integrations?.legislativeApi, fields: { ...DEFAULT_CMS_SETTINGS.integrations.legislativeApi.fields, ...settings.integrations?.legislativeApi?.fields } }, procurementApi: { ...DEFAULT_CMS_SETTINGS.integrations.procurementApi, ...settings.integrations?.procurementApi, fields: { ...DEFAULT_CMS_SETTINGS.integrations.procurementApi.fields, ...settings.integrations?.procurementApi?.fields } } },
        apiFeatures: { ...DEFAULT_CMS_SETTINGS.apiFeatures, ...settings.apiFeatures },
        security: { ...DEFAULT_CMS_SETTINGS.security, ...settings.security },
        updates: { ...DEFAULT_CMS_SETTINGS.updates, ...settings.updates },
        email: { ...DEFAULT_CMS_SETTINGS.email, ...settings.email },
        notificationTemplates: { ...DEFAULT_CMS_SETTINGS.notificationTemplates, ...settings.notificationTemplates },
        legislative: { ...DEFAULT_LEGISLATIVE_CONFIGURATION, ...settings.legislative },
    }, [draft, settings]);

    useEffect(() => {
        getDocs(query(collection(firestore, 'users'), where('tipo', '==', 'Vereador')))
            .then(snapshot => setCouncilors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))))
            .catch(() => setCouncilors([]));
    }, []);

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
            const homeModules = current.appHomeModules || DEFAULT_APP_HOME_MODULES;
            const selectedHomeModules = homeModules.filter(Boolean);
            if (!Array.isArray(homeModules) || selectedHomeModules.length < 1 || selectedHomeModules.length > 6 || new Set(selectedHomeModules).size !== selectedHomeModules.length || selectedHomeModules.some(id => !APP_HOME_MODULE_IDS.includes(id) || current.modules[id]?.app === false)) {
                throw new Error('Escolha entre um e seis módulos diferentes e ativos no aplicativo para a página inicial.');
            }
            const bottomBarModules = current.appBottomBarModules || DEFAULT_APP_BOTTOM_BAR_MODULES;
            if (!Array.isArray(bottomBarModules) || bottomBarModules.length !== 3 || new Set(bottomBarModules).size !== 3 || bottomBarModules.some(id => !APP_BOTTOM_BAR_MODULE_IDS.includes(id) || (APP_BOTTOM_BAR_OPTIONS.find(option => option.id === id)?.moduleId && current.modules[APP_BOTTOM_BAR_OPTIONS.find(option => option.id === id).moduleId]?.app === false))) {
                throw new Error('Escolha três módulos diferentes e ativos para os atalhos intermediários da barra inferior.');
            }
            const homeShortcuts = current.appHomeShortcuts || DEFAULT_APP_HOME_SHORTCUTS;
            const selectedHomeShortcuts = homeShortcuts.filter(Boolean);
            if (!Array.isArray(homeShortcuts) || selectedHomeShortcuts.length < 1 || selectedHomeShortcuts.length > 4 || new Set(selectedHomeShortcuts).size !== selectedHomeShortcuts.length || selectedHomeShortcuts.some(id => !APP_HOME_SHORTCUT_OPTIONS.some(option => option.id === id && (!option.moduleId || current.modules[option.moduleId]?.app !== false)))) {
                throw new Error('Escolha entre um e quatro atalhos diferentes e disponíveis para a Home do aplicativo.');
            }
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

        {activeTab === 'permissions' && <SystemRolePermissions settings={current} onRolePermissionsChange={value => update('security', 'rolePermissions', value)} onActionPermissionsChange={value => update('security', 'actionPermissions', value)} />}
        {activeTab === 'general' && <>
            <section className="system-control-summary"><article><LiaCogSolid /><div><strong>{SYSTEM_MODULES.length}</strong><span>Módulos configuráveis</span></div></article><article><LiaUserCogSolid /><div><strong>{SYSTEM_MODULES.filter(item => current.modules[item.id]?.admin !== false).length}</strong><span>Ativos no admin</span></div></article><article><LiaMobileSolid /><div><strong>{SYSTEM_MODULES.filter(item => current.modules[item.id]?.app && item.app).length}</strong><span>Ativos no aplicativo</span></div></article></section>
            <SettingsCard title="Identificação da Câmara" description="Esses dados formam a identidade do tenant e permitem reutilizar o projeto em outros municípios."><div className="system-fields-grid">{TENANT_FIELDS.map(([field,label]) => <Field key={field} label={label} value={current.tenant[field]} onChange={value => update('tenant', field, value)} />)}</div></SettingsCard>
            <SettingsCard title="Usuários root" description="Estes usuários podem acessar o controle do sistema e administrar toda a instalação."><label className="system-field"><span>E-mails dos usuários root</span><textarea value={(current.security?.rootEmails || []).join('\n')} onChange={event => updateRootEmails(event.target.value)} placeholder="administrador@camara.gov.br" rows="4" /><small>Informe um e-mail por linha. Mantenha ao menos um usuário root ativo.</small></label></SettingsCard>
            <section className="data-card system-global-card"><div><h2>Funcionamento geral</h2><p>Defina um aviso de manutenção compartilhado com o portal e o aplicativo.</p></div><Switch checked={Boolean(current.maintenance)} onChange={value => updateGlobal('maintenance', value)} label="Modo manutenção" /><textarea value={current.maintenanceMessage || ''} onChange={event => updateGlobal('maintenanceMessage', event.target.value)} placeholder="Mensagem exibida durante a manutenção" rows="2" /></section>
        </>}

        {activeTab === 'modules' && <section className="data-card system-modules-card">
            <SectionHeader title="Páginas e módulos" description="Desative uma superfície para ocultar atalhos e impedir o acesso pela rota. Use a engrenagem para definir parâmetros próprios de cada módulo." />
            <div className="system-module-head"><span>Módulo</span><span>Admin</span><span>Portal</span><span>Aplicativo</span><span aria-label="Configurações"><LiaCogSolid /></span></div>
            <div className="system-module-list">{SYSTEM_MODULES.map(module => <article key={module.id}><div><strong>{module.name}</strong><small>{module.description}</small></div>{['admin','portal','app'].map(surface => <Switch key={surface} compact disabled={surface === 'app' && !module.app} checked={surface === 'app' && !module.app ? false : current.modules[module.id]?.[surface] !== false} onChange={value => update('modules', module.id, { ...current.modules[module.id], [surface]: value })} />)}<button type="button" className="btn-secondary system-module-config-button" aria-label={`Configurar ${module.name}`} title={`Configurar ${module.name}`} onClick={() => setModuleConfigId(module.id)}><LiaCogSolid /></button></article>)}</div>
            <div className="system-app-home-config">
                <h3>Serviços da Home do aplicativo</h3>
                <p>Escolha entre um e seis serviços ativos. Deixe os demais espaços vazios quando necessário.</p>
                <div className="system-app-home-slots">{Array.from({ length: 6 }, (_, index) => <label key={index}>
                    <span>{index + 1}º atalho</span>
                    <select value={(current.appHomeModules || DEFAULT_APP_HOME_MODULES)[index] || ''} onChange={event => {
                        const next = [...(current.appHomeModules || DEFAULT_APP_HOME_MODULES)];
                        next[index] = event.target.value;
                        updateGlobal('appHomeModules', next);
                    }}>
                        <option value="">Selecione um módulo</option>
                        {APP_HOME_MODULE_IDS.map(id => <option key={id} value={id} disabled={current.modules[id]?.app === false || ((current.appHomeModules || DEFAULT_APP_HOME_MODULES).includes(id) && (current.appHomeModules || DEFAULT_APP_HOME_MODULES)[index] !== id)}>{SYSTEM_MODULES.find(module => module.id === id)?.name || id}</option>)}
                    </select>
                </label>)}</div>
            </div>
            <div className="system-app-home-config">
                <h3>Atalhos rápidos da Home</h3>
                <p>Escolha de um a quatro ações exibidas logo após os serviços. Deixe os demais espaços vazios quando necessário.</p>
                <div className="system-app-home-slots">{Array.from({ length: 4 }, (_, index) => <label key={index}>
                    <span>{index + 1}º atalho</span>
                    <select value={(current.appHomeShortcuts || DEFAULT_APP_HOME_SHORTCUTS)[index] || ''} onChange={event => {
                        const next = [...(current.appHomeShortcuts || DEFAULT_APP_HOME_SHORTCUTS)];
                        next[index] = event.target.value;
                        updateGlobal('appHomeShortcuts', next);
                    }}>
                        <option value="">Selecione um atalho</option>
                        {APP_HOME_SHORTCUT_OPTIONS.map(option => <option key={option.id} value={option.id} disabled={(option.moduleId && current.modules[option.moduleId]?.app === false) || ((current.appHomeShortcuts || DEFAULT_APP_HOME_SHORTCUTS).includes(option.id) && (current.appHomeShortcuts || DEFAULT_APP_HOME_SHORTCUTS)[index] !== option.id)}>{option.name}</option>)}
                    </select>
                </label>)}</div>
            </div>
            <div className="system-app-home-config">
                <h3>Atalhos da barra inferior do aplicativo</h3>
                <p>Início e Perfil são fixos. Escolha os três atalhos intermediários exibidos entre eles, na ordem desejada.</p>
                <div className="system-app-home-slots system-app-bottom-bar-slots">
                    <label><span>1º item · fixo</span><input value="Início" disabled /></label>
                    {Array.from({ length: 3 }, (_, index) => <label key={index}>
                        <span>{index + 2}º item</span>
                        <select value={(current.appBottomBarModules || DEFAULT_APP_BOTTOM_BAR_MODULES)[index] || ''} onChange={event => {
                            const next = [...(current.appBottomBarModules || DEFAULT_APP_BOTTOM_BAR_MODULES)];
                            next[index] = event.target.value;
                            updateGlobal('appBottomBarModules', next);
                        }}>
                            <option value="">Selecione um módulo</option>
                            {APP_BOTTOM_BAR_OPTIONS.map(option => <option key={option.id} value={option.id} disabled={(option.moduleId && current.modules[option.moduleId]?.app === false) || ((current.appBottomBarModules || DEFAULT_APP_BOTTOM_BAR_MODULES).includes(option.id) && (current.appBottomBarModules || DEFAULT_APP_BOTTOM_BAR_MODULES)[index] !== option.id)}>{option.name}</option>)}
                        </select>
                    </label>)}
                    <label><span>5º item · fixo</span><input value="Perfil" disabled /></label>
                </div>
            </div>
        </section>}

        {activeTab === 'design' && <SettingsCard title="Design e cores" description="Tema visual aplicado globalmente por variáveis CSS."><div className="system-design-layout"><div className="system-fields-grid colors">{DESIGN_FIELDS.map(([field,label]) => <label key={field} className="system-field"><span>{label}</span><div className="system-color-field"><input type="color" value={current.design[field]} onChange={event => update('design',field,event.target.value)} /><input value={current.design[field]} onChange={event => update('design',field,event.target.value)} /></div></label>)}<Field label="Arredondamento dos componentes" type="number" value={current.design.borderRadius} onChange={value => update('design','borderRadius',Number(value))} /><Field label="Família tipográfica" value={current.design.fontFamily} onChange={value => update('design','fontFamily',value)} /></div><div className="system-theme-preview" style={{ '--preview-primary': current.design.primaryColor, '--preview-secondary': current.design.secondaryColor, '--preview-accent': current.design.accentColor, '--preview-bg': current.design.backgroundColor, '--preview-text': current.design.textColor, '--preview-radius': `${current.design.borderRadius}px` }}><span>Pré-visualização</span><h3>{current.tenant.portalTitle}</h3><p>Identidade visual da {current.tenant.shortName}.</p><button>Botão principal</button><b>Informação em destaque</b></div></div></SettingsCard>}

        {activeTab === 'branding' && <SettingsCard title="Logomarca e imagens" description="Envie cada arquivo diretamente para o Firebase Storage. Limite de 5 MB por imagem."><div className="system-brand-assets">{BRAND_ASSETS.map(([field,label,description]) => <article key={field}><div className={`system-brand-thumbnail ${field === 'loginCoverUrl' ? 'cover' : ''}`}>{current.branding[field] ? <img src={current.branding[field]} alt={label} /> : <LiaImageSolid />}</div><div><strong>{label}</strong><span>{description}</span>{current.branding[field] && <small>Imagem carregada</small>}</div><label className="system-upload-button"><LiaUploadSolid />{uploading === field ? 'Enviando...' : current.branding[field] ? 'Substituir arquivo' : 'Selecionar arquivo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" disabled={Boolean(uploading)} onChange={event => uploadBrandAsset(field,event.target.files?.[0])} /></label></article>)}</div>{uploadError && <p className="system-upload-error">{uploadError}</p>}<div className="system-fields-grid branding-meta"><Field label="Descrição acessível da logomarca" value={current.branding.logoAlt} onChange={value => update('branding','logoAlt',value)} /></div></SettingsCard>}

        {activeTab === 'integrations' && <><SettingsCard title="Endpoints públicos" description="URLs consumidas pelo portal e pelo aplicativo. Chaves secretas permanecem nas variáveis protegidas das Cloud Functions."><div className="system-fields-grid">{INTEGRATION_FIELDS.map(([field,label]) => <Field key={field} label={label} type={field === 'supportEmail' ? 'email' : 'url'} value={current.integrations[field]} onChange={value => update('integrations',field,value)} />)}</div></SettingsCard><SettingsCard title="E-mail institucional" description="Configure o endereço usado nas mensagens transacionais, como boas-vindas e avisos de documentos prontos."><div className="system-email-status"><LiaEnvelopeSolid /><div><strong>{current.email.enabled ? 'Envio habilitado' : 'Envio desabilitado'}</strong><span>Provedor atual: Cloudflare Email Routing + Cloud Functions</span></div><Switch checked={Boolean(current.email.enabled)} onChange={value => update('email','enabled',value)} label="Ativo" /></div><div className="system-fields-grid"><label className="system-field"><span>Provedor</span><select value={current.email.provider} onChange={event => update('email','provider',event.target.value)}><option value="cloudflare">Cloudflare Email Routing</option><option value="smtp">SMTP externo</option><option value="sendgrid">SendGrid</option><option value="resend">Resend</option></select></label><Field label="Domínio de envio" value={current.email.domain} onChange={value => update('email','domain',value)} placeholder="camara.gov.br" /><Field label="Nome do remetente" value={current.email.senderName} onChange={value => update('email','senderName',value)} placeholder="Câmara Municipal" /><Field label="E-mail do remetente" type="email" value={current.email.senderEmail} onChange={value => update('email','senderEmail',value)} placeholder="nao-responda@camara.gov.br" /><Field label="E-mail para respostas" type="email" value={current.email.replyTo} onChange={value => update('email','replyTo',value)} placeholder="atendimento@camara.gov.br" /><Field label="Endereço de roteamento Cloudflare" type="email" value={current.email.routingAddress} onChange={value => update('email','routingAddress',value)} placeholder="caixa@provedor.com" /><Field label="Endpoint da Cloud Function de e-mail" type="url" value={current.email.functionsEndpoint} onChange={value => update('email','functionsEndpoint',value)} placeholder="https://us-central1-projeto.cloudfunctions.net/sendEmail" /></div><div className="system-email-instructions"><strong>Configuração no gerenciador do domínio</strong><ol><li>Adicione o domínio no Cloudflare e altere no registrador os nameservers para os informados pelo Cloudflare.</li><li>Em <b>Email Routing</b>, crie o endereço personalizado e confirme o endereço de destino.</li><li>No DNS, mantenha os registros MX e TXT/SPF fornecidos pelo Cloudflare. Remova MX conflitantes do provedor anterior.</li><li>Configure DKIM e DMARC conforme os valores fornecidos pelo serviço que efetivamente envia as mensagens.</li><li>Salve o domínio e o remetente nesta tela. Tokens, chaves SMTP e secrets ficam nas variáveis protegidas das Functions.</li></ol><label className="system-email-verify"><input type="checkbox" checked={Boolean(current.email.dnsVerified)} onChange={event => update('email','dnsVerified',event.target.checked)} /> DNS e roteamento verificados no Cloudflare</label></div></SettingsCard><SettingsCard title="Serviços e APIs" description="Controle quais integrações podem ser utilizadas pelas interfaces."><div className="system-api-grid">{API_FEATURES.map(([field,label]) => <article key={field}><div><strong>{label}</strong><small>{current.apiFeatures[field] ? 'Disponível' : 'Desativado'}</small></div><Switch checked={Boolean(current.apiFeatures[field])} onChange={value => update('apiFeatures',field,value)} /></article>)}</div><p className="system-security-note"><LiaShieldAltSolid /> Tokens, senhas e chaves privadas devem ser configurados como secrets das Cloud Functions e nunca salvos neste documento.</p></SettingsCard></>}
        {activeTab === 'integrations' && <ProcurementApiSettings value={current.integrations.procurementApi} onChange={value => update('integrations', 'procurementApi', value)} />}
        {activeTab === 'legislative' && <LegislativeApiSettings value={current.integrations.legislativeApi} onChange={value => update('integrations', 'legislativeApi', value)} />}
        {activeTab === 'updates' && <SettingsCard title="Atualizações do núcleo" description="Configure como esta instalação acompanha as mudanças publicadas no repositório base da Blu Câmara."><div className="system-update-status"><LiaSyncSolid /><div><strong>Sincronização por Pull Request</strong><span>O workflow semanal compara este clone com o núcleo e abre uma revisão no GitHub.</span></div><Switch checked={current.updates.enabled !== false} onChange={value => update('updates','enabled',value)} label="Ativa" /></div><div className="system-fields-grid"><Field label="Repositório do núcleo (owner/repository)" value={current.updates.upstream} onChange={value => update('updates','upstream',value)} /><label className="system-field"><span>Frequência</span><select value={current.updates.schedule} onChange={event => update('updates','schedule',event.target.value)}><option value="weekly">Semanal</option><option value="daily">Diária</option><option value="manual">Somente manual</option></select></label><Field label="Comando de deploy após merge" value={current.updates.deployCommand} onChange={value => update('updates','deployCommand',value)} /></div><div className="system-api-grid"><article><div><strong>Merge automático</strong><small>{current.updates.autoMerge ? 'Ativado no GitHub' : 'Requer revisão'}</small></div><Switch checked={Boolean(current.updates.autoMerge)} onChange={value => update('updates','autoMerge',value)} /></article><article><div><strong>Publicar após merge</strong><small>{current.updates.deployOnMerge ? 'Pipeline de deploy necessário' : 'Deploy manual'}</small></div><Switch checked={Boolean(current.updates.deployOnMerge)} onChange={value => update('updates','deployOnMerge',value)} /></article></div><div className="system-update-instructions"><strong>Configuração necessária no GitHub</strong><p>O CMS salva as preferências desta instalação. Para o workflow atuar, configure a variável do repositório:</p><code>BLU_PLATFORM_UPSTREAM={current.updates.upstream || 'owner/repository'}</code><p>Se o merge automático estiver ativo, também defina <code>BLU_PLATFORM_AUTO_MERGE=true</code> e habilite <b>Allow auto-merge</b>. O workflow está em <code>.github/workflows/sync-platform.yml</code>.</p></div></SettingsCard>}
        {activeTab === 'notifications' && <NotificationEditor templates={current.notificationTemplates} onChange={value => updateGlobal('notificationTemplates', value)} />}
        {activeTab === 'collections' && <SystemCollectionsManager externalApis={current.externalApis || []} onExternalApisChange={value => updateGlobal('externalApis', value)} />}
        {moduleConfigId && <ModuleConfigModal module={SYSTEM_MODULES.find(item => item.id === moduleConfigId)} settings={current} councilors={councilors} onChange={(section, value) => section === 'legislative' || section === 'email' ? updateGlobal(section, value) : update('modules', moduleConfigId, value)} onClose={() => setModuleConfigId('')} />}
    </main></div>;
};

const SectionHeader = ({ title, description }) => <div className="card-header"><div><h2>{title}</h2><p>{description}</p></div></div>;
const SettingsCard = ({ title, description, children }) => <section className="data-card system-settings-card"><SectionHeader title={title} description={description} />{children}</section>;
const Field = ({ label, value = '', onChange, type = 'text' }) => <label className="system-field"><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} /></label>;
const LegislativeApiSettings = ({ value, onChange }) => { const patch = (field, next) => onChange({ ...value, [field]: next }); const patchField = (field, next) => patch('fields', { ...value.fields, [field]: next }); return <><SettingsCard title="Fonte de vereadores" description="Use SAPL ou um sistema legislativo próprio como fonte de leitura dos vereadores. O Firebase continua como contingência quando a API estiver desativada ou indisponível."><div className="system-email-status"><LiaCloudSolid /><div><strong>{value.enabled ? 'Leitura externa ativada' : 'Usando cadastro interno'}</strong><span>Não informe tokens nesta tela. APIs autenticadas devem passar por uma Cloud Function.</span></div><Switch checked={Boolean(value.enabled)} onChange={checked => patch('enabled', checked)} label="Ativar API legislativa" /></div><div className="system-fields-grid"><label className="system-field"><span>Fornecedor</span><select value={value.provider} onChange={event => patch('provider', event.target.value)}><option value="sapl">SAPL</option><option value="proprio">Sistema legislativo próprio</option></select></label><Field label="URL da lista de vereadores" type="url" value={value.url} onChange={next => patch('url', next)} /><Field label="Caminho da lista na resposta" value={value.responsePath} onChange={next => patch('responsePath', next)} placeholder="results" /></div></SettingsCard><SettingsCard title="Mapeamento de campos" description="Informe os caminhos que a API utiliza. Os valores abaixo seguem o formato mais comum do SAPL e podem ser adaptados ao sistema próprio."><div className="system-fields-grid">{[['id','Identificador externo'],['name','Nome'],['cargo','Nome parlamentar / cargo'],['party','Partido'],['photo','Foto'],['email','E-mail'],['userId','UID do usuário no portal, se existir']].map(([field, label]) => <Field key={field} label={label} value={value.fields?.[field] || ''} onChange={next => patchField(field, next)} />)}</div></SettingsCard></> };
const ProcurementApiSettings = ({ value, onChange }) => {
    const patch = next => onChange({ ...value, ...next });
    const patchField = (field, next) => patch({ fields: { ...value.fields, [field]: next } });
    const fields = [['id', 'Identificador'], ['number', 'Número/edital'], ['object', 'Objeto'], ['supplier', 'Fornecedor'], ['value', 'Valor'], ['status', 'Situação'], ['startDate', 'Data de abertura'], ['endDate', 'Data de encerramento'], ['detailUrl', 'URL de detalhes']];
    return <SettingsCard title="API de licitações" description="A consulta do PNCP é filtrada pelo CNPJ do órgão. O portal e o aplicativo só devem exibir contratações pertencentes a esta Câmara."><div className="system-email-status"><LiaCloudSolid /><div><strong>{value.enabled ? 'Consulta habilitada' : 'Consulta desabilitada'}</strong><span>A configuração publicada será compartilhada pelo portal e pelo aplicativo.</span></div><Switch checked={Boolean(value.enabled)} onChange={enabled => patch({ enabled })} label="Ativar API" /></div><div className="system-fields-grid"><Field label="Provedor" value={value.provider || ''} onChange={provider => patch({ provider })} placeholder="PNCP" /><Field label="CNPJ do órgão no PNCP" value={value.organizationCnpj || ''} onChange={organizationCnpj => patch({ organizationCnpj: organizationCnpj.replace(/\D/g, '').slice(0, 14) })} placeholder="35076017000107" /><Field label="URL da API" type="url" value={value.url || ''} onChange={url => patch({ url })} placeholder="https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras" /><Field label="Caminho da lista na resposta" value={value.responsePath || ''} onChange={responsePath => patch({ responsePath })} placeholder="data.items" /></div><div className="system-fields-grid">{fields.map(([field, label]) => <Field key={field} label={label} value={value.fields?.[field] || ''} onChange={next => patchField(field, next)} placeholder="caminho.na.resposta" />)}</div><p className="system-security-note"><LiaShieldAltSolid /> A URL usa o marcador <code>{'{cnpj}'}</code>; o adaptador deve substituí-lo pelo CNPJ configurado antes da consulta. Não informe tokens ou chaves na URL.</p></SettingsCard>;
};
const Switch = ({ checked, onChange, label = '', disabled = false, compact = false }) => <label className={`system-switch ${compact ? 'compact' : ''}`}><input type="checkbox" disabled={disabled} checked={checked} onChange={event => onChange(event.target.checked)} /><span />{label}</label>;

const ModuleConfigModal = ({ module, settings, councilors, onChange, onClose }) => {
    const [types, setTypes] = useState('');
    const [memberId, setMemberId] = useState('');
    const [boardRole, setBoardRole] = useState('Presidente');
    const [permissions, setPermissions] = useState([]);
    const legislative = settings.legislative || {};
    const isLegislative = module?.id === 'legislativo';
    const isEmail = module?.id === 'email';
    const email = settings.email || {};
    useEffect(() => { setTypes((legislative.propositionTypes || []).join('\n')); }, [legislative.propositionTypes]);
    if (!module) return null;
    const patchModule = (surface, value) => onChange('modules', { ...(settings.modules[module.id] || {}), [surface]: value });
    const patchLegislative = value => onChange('legislative', { ...legislative, ...value });
    const permissionOptions = [['legislative.secretariat', 'Protocolar e tramitar'], ['legislative.minutes', 'Cadastrar atas'], ['legislative.presidency', 'Despachos e plenário'], ['legislative.commissionPresident', 'Presidir comissão e designar relator'], ['legislative.rapporteur', 'Emitir parecer de relatoria'], ['legislative.legalOpinion', 'Emitir parecer jurídico']];
    const addBoardAssignment = () => { if (!memberId) return; const person = councilors.find(item => item.id === memberId); const boardAssignments = [...(legislative.boardAssignments || []).filter(item => item.userId !== memberId && item.role !== boardRole), { userId: memberId, name: person?.name || person?.nome || person?.email || 'Vereador(a)', role: boardRole, permissions }]; patchLegislative({ boardAssignments }); setMemberId(''); setPermissions([]); };
    return createPortal(<div className="modal-overlay system-module-config-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}><section className="modal-content system-module-config-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-header"><div><h2>Configurações · {module.name}</h2><p>{module.description}</p></div><button type="button" className="modal-close-btn" aria-label="Fechar" onClick={onClose}>×</button></div>{isEmail ? <div className="system-module-config-form"><section><h3>Contas e domínio institucional</h3><p>Somente administradores podem editar estas configurações. Segredos SMTP devem ser armazenados nas Cloud Functions.</p><div className="system-fields-grid"><label className="system-field"><span>Provedor</span><select value={email.provider || 'cloudflare'} onChange={event => onChange('email', { ...email, provider: event.target.value })}><option value="cloudflare">Cloudflare Email Routing</option><option value="smtp">SMTP externo</option><option value="resend">Resend</option></select></label><label className="system-field"><span>Domínio</span><input value={email.domain || ''} onChange={event => onChange('email', { ...email, domain: event.target.value })} placeholder="camara.gov.br" /></label><label className="system-field"><span>Servidor SMTP</span><input value={email.smtpHost || ''} onChange={event => onChange('email', { ...email, smtpHost: event.target.value })} placeholder="smtp.provedor.com" /></label><label className="system-field"><span>Porta SMTP</span><input value={email.smtpPort || ''} onChange={event => onChange('email', { ...email, smtpPort: event.target.value })} placeholder="587" /></label><label className="system-field"><span>Remetente padrão</span><input type="email" value={email.senderEmail || ''} onChange={event => onChange('email', { ...email, senderEmail: event.target.value })} placeholder="atendimento@camara.gov.br" /></label><label className="system-field"><span>Endereço de roteamento</span><input type="email" value={email.routingAddress || ''} onChange={event => onChange('email', { ...email, routingAddress: event.target.value })} /></label></div><label className="system-email-verify"><input type="checkbox" checked={Boolean(email.dnsVerified)} onChange={event => onChange('email', { ...email, dnsVerified: event.target.checked })} /> DNS, SPF, DKIM e MX verificados</label></section></div> : isLegislative ? <div className="system-module-config-form"><section><h3>Regras da Câmara</h3><label className="system-field"><span>Tipos de proposição</span><textarea rows="6" value={types} onChange={event => { const value = event.target.value; setTypes(value); patchLegislative({ propositionTypes: value.split('\n').map(item => item.trim()).filter(Boolean) }); }} /><small>Informe um tipo por linha.</small></label><div className="system-fields-grid"><label className="system-field"><span>Quóruns</span><input value={(legislative.quorums || []).join(', ')} onChange={event => patchLegislative({ quorums: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} /></label><label className="system-field"><span>Modalidades de votação</span><input value={(legislative.votingTypes || []).join(', ')} onChange={event => patchLegislative({ votingTypes: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} /></label></div></section><section><h3>Mesa diretora e acessos</h3><div className="system-fields-grid"><label className="system-field"><span>Vereador</span><select value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">Selecione</option>{councilors.map(item => <option key={item.id} value={item.id}>{item.name || item.nome || item.email}</option>)}</select></label><label className="system-field"><span>Função</span><select value={boardRole} onChange={event => setBoardRole(event.target.value)}>{['Presidente', 'Vice-presidente', '1º Secretário', '2º Secretário', 'Secretária Legislativa', 'Membro da Mesa'].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="legislative-permission-checks">{permissionOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={permissions.includes(value)} onChange={event => setPermissions(event.target.checked ? [...permissions, value] : permissions.filter(item => item !== value))} /> {label}</label>)}</div><button type="button" className="btn-secondary" onClick={addBoardAssignment}>Adicionar função</button><div className="cabinet-list">{(legislative.boardAssignments || []).map(item => <article className="cabinet-event-row" key={`${item.userId}-${item.role}`}><div><strong>{item.name}</strong><p>{item.role}</p><small>{(item.permissions || []).map(value => permissionOptions.find(option => option[0] === value)?.[1] || value).join(' · ') || 'Permissões próprias da função'}</small></div><button type="button" className="btn-secondary" onClick={() => patchLegislative({ boardAssignments: (legislative.boardAssignments || []).filter(entry => !(entry.userId === item.userId && entry.role === item.role)) })}>Remover</button></article>)}{!(legislative.boardAssignments || []).length && <p>Nenhuma função definida.</p>}</div></section></div> : <div className="system-module-config-form"><p>Defina em quais superfícies este módulo ficará disponível. Parâmetros específicos adicionais serão exibidos aqui conforme cada módulo os utilizar.</p>{['admin', 'portal', 'app', 'adminApp'].map(surface => <Switch key={surface} label={surface === 'admin' ? 'Painel administrativo' : surface === 'adminApp' ? 'Admin aplicativo' : surface === 'portal' ? 'Portal do cidadão' : 'Aplicativo'} disabled={['app', 'adminApp'].includes(surface) && !module.app} checked={['app', 'adminApp'].includes(surface) && !module.app ? false : settings.modules[module.id]?.[surface] !== false} onChange={value => patchModule(surface, value)} />)}</div>}<div className="form-actions"><button type="button" className="btn-primary" onClick={onClose}>Concluir</button></div></section></div>, document.body);
};

const NotificationEditor = ({ templates = {}, onChange }) => { const [selected, setSelected] = useState(Object.keys(templates)[0] || 'welcome'); const item = templates[selected]; if (!item) return null; const patch = value => onChange({ ...templates, [selected]: { ...item, ...value } }); return <SettingsCard title="Notificações e e-mails" description={<>Edite os textos usados pelo aplicativo e pelos e-mails transacionais. Use variáveis como {'{{nome}}'} e {'{{protocolo}}'}.</>}><div className="notification-template-tabs">{Object.entries(templates).map(([key, value]) => <button key={key} className={selected === key ? 'active' : ''} onClick={() => setSelected(key)}>{value.label || key}</button>)}</div><div className="notification-editor-toolbar"><label className="system-field"><span>Assunto do e-mail</span><input value={item.subject || ''} onChange={event => patch({ subject: event.target.value })} /></label><Switch checked={item.enabled !== false} onChange={value => patch({ enabled: value })} label="Modelo ativo" /></div><div className="notification-channels"><strong>Canais de envio</strong><Switch checked={item.channels?.push !== false} onChange={value => patch({ channels: { ...item.channels, push: value } })} label="Notificação no aplicativo" /><Switch checked={Boolean(item.channels?.email)} onChange={value => patch({ channels: { ...item.channels, email: value } })} label="E-mail" /></div><ReactQuill theme="snow" value={item.body || ''} onChange={value => patch({ body: value })} modules={{ toolbar: [[{ header: [1, 2, false] }], ['bold', 'italic', 'underline', 'link'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] }} /><div className="notification-token-help"><strong>Variáveis disponíveis</strong><span>{'{{nome}} · {{protocolo}} · {{data}} · {{horario}} · {{senha}} · {{guiche}}'}</span></div></SettingsCard>; };

export default SystemControl;
