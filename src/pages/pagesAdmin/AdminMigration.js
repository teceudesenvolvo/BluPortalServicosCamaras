import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { collection, writeBatch, doc, setDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, firestore, auth } from '../../firebase';
import config from '../../config';
import AdminSidebar from '../../components/AdminSidebar';
import { LiaArrowLeftSolid } from "react-icons/lia";

const AdminMigration = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [migrationStatus, setMigrationStatus] = useState('idle'); // idle | in-progress | completed | error
    const [migrationLog, setMigrationLog] = useState([]);
    const [progress, setProgress] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    // Nova funcionalidade: Seleção de Coleção
    const [selectedCollection, setSelectedCollection] = useState('balcao-cidadao');

    const collectionsToMigrate = [
        { id: 'balcao-cidadao', name: 'Balcão do Cidadão' },
        { id: 'balcao-config', name: 'Configurações do Balcão (Geral)' },
        { id: 'availability', name: 'Horários de Disponibilidade' },
        { id: 'blockedDates', name: 'Datas Bloqueadas (Feriados)' },
        { id: 'bookedSlots', name: 'Slots Agendados (Ocupação)' },
        { id: 'users', name: 'Usuários' },
        { id: 'notifications', name: 'Notificações' },
        { id: 'mail', name: 'E-mails (Fila)' },
        { id: 'ouvidoria', name: 'Ouvidoria' },
        { id: 'atendimento-juridico', name: 'Atendimento Jurídico' },
        { id: 'procuradoria-mulher', name: 'Procuradoria da Mulher' },
        { id: 'procuradoria-mulher-btn-panico', name: 'Configuração Botão Pânico' },
        { id: 'panic-alerts', name: 'Alertas de Pânico' },
        { id: 'vereadores', name: 'Vereadores' },
        { id: 'piel', name: 'Informativos PIEL' },
        { id: 'denuncias-procon', name: 'Procon (Denúncias)' },
    ];

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) setIsAuthReady(true);
            else navigate('/');
        });
        return () => unsubscribe();
    }, [navigate]);

    const addLog = (message, type = 'info') => {
        setMigrationLog(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
    };

    const checkFirestoreHealth = async () => {
        try {
            const projId = firestore._databaseId?.projectId || process.env.REACT_APP_FIREBASE_PROJECT_ID;
            addLog(`🩺 Verificando conexão (Projeto: ${projId})...`, 'info');
            
            if (!projId) {
                addLog('❌ ID do Projeto não encontrado. Verifique se o arquivo .env.local foi carregado.', 'error');
                return false;
            }

            if (!auth.currentUser) {
                addLog('❌ Usuário não autenticado. O Firestore exige login ativo para escrita.', 'error');
                return false;
            }
            addLog(`👤 Autenticado como: ${auth.currentUser.email}`, 'info');

            if (!navigator.onLine) {
                addLog('❌ Navegador detectado como Offline.', 'error');
                return false;
            }

            const healthRef = doc(firestore, '_system', 'migration_test');
            
            // Tenta uma escrita simples com timeout de 15s para conexões lentas
            const testPromise = setDoc(healthRef, { 
                lastCheck: new Date().toISOString(),
                city: config.cityCollection 
            }, { merge: true });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout de 20s. A conexão foi iniciada mas não houve resposta do servidor.')), 20000)
            );

            await Promise.race([testPromise, timeoutPromise]);
            addLog('✅ Conexão Firestore: OK', 'success');
            return true;
        } catch (error) {
            console.error("Erro detalhado de conexão:", error);
            addLog(`❌ Falha: ${error.code || error.message}`, 'error');
            addLog('Dica: Teste em Aba Anônima ou use a rede 4G do celular. Redes Wi-Fi corporativas costumam bloquear o Firestore.', 'warning');
            return false;
        }
    };

    const migrateToFirestore = async () => {
        setMigrating(true);
        setMigrationStatus('in-progress');
        setMigrationLog([]);
        setProgress(0);

        try {
            if (!(await checkFirestoreHealth())) {
                setMigrationStatus('error');
                setMigrating(false);
                return;
            }

            addLog(`🔄 Iniciando migração da coleção [${selectedCollection}]...`, 'info');

            // Buscar dados do RTDB
            const rtdbRef = ref(db, `${config.cityCollection}/${selectedCollection}`);
            const snapshot = await get(rtdbRef);

            if (!snapshot.exists()) {
                addLog('Nenhum dado encontrado no Realtime Database.', 'warning');
                setMigrationStatus('completed');
                setMigrating(false);
                return;
            }

            const data = snapshot.val();
            const entries = Object.entries(data);
            setTotalCount(entries.length);

            addLog(`${entries.length} documentos encontrados no RTDB. Iniciando transferência...`, 'info');

            // Migrar em lotes para Firestore (tamanho muito pequeno: 25 documentos por batch)
            const BATCH_SIZE = 25;
            let successCount = 0;
            let errorCount = 0;
            const MAX_COMMIT_TIMEOUT = 30000; // 30 segundos max por commit

            addLog(`📤 Iniciando transferência de ${entries.length} documentos em lotes de ${BATCH_SIZE}...`, 'info');

            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batchEntries = entries.slice(i, Math.min(i + BATCH_SIZE, entries.length));
                const batch = writeBatch(firestore);
                let batchSuccessCount = 0;
                let totalBatchSize = 0;

                for (const [key, value] of batchEntries) {
                    try {
                        // Validar documento
                        if (!key || typeof value !== 'object') {
                            console.warn(`Documento ${key} inválido, ignorando...`);
                            errorCount++;
                            continue;
                        }

                        // Estimar tamanho do documento (Firestore tem limite de 1MB por doc)
                        const docSize = JSON.stringify(value).length;
                        if (docSize > 1000000) {
                            console.warn(`Documento ${key} muito grande (${docSize} bytes), ignorando...`);
                            addLog(`⚠️ Documento ${key} muito grande (${docSize} bytes)`, 'warning');
                            errorCount++;
                            continue;
                        }
                        totalBatchSize += docSize;

                        const docRef = doc(firestore, selectedCollection, key);
                        batch.set(docRef, {
                            ...value,
                            migratedAt: new Date().toISOString(),
                            source: 'RTDB'
                        });
                        batchSuccessCount++;
                    } catch (error) {
                        console.error(`Erro ao preparar documento ${key}:`, error);
                        errorCount++;
                    }
                }

                try {
                    // Commit do lote com timeout
                    if (batchSuccessCount > 0) {
                        const loteNum = Math.floor(i / BATCH_SIZE) + 1;
                        console.log(`[Lote ${loteNum}] Enviando ${batchSuccessCount} documentos (${Math.round(totalBatchSize / 1024)}KB) para Firestore...`);
                        addLog(`⏳ Lote ${loteNum}: Enviando ${batchSuccessCount} documentos (${Math.round(totalBatchSize / 1024)}KB)...`, 'info');
                        
                        console.log(`[Lote ${loteNum}] Iniciando commit do lote...`);
                        
                        // Criar uma promessa de timeout para não travar a UI
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error(`Timeout de ${MAX_COMMIT_TIMEOUT / 1000}s atingido no commit do Firestore. Verifique as regras de segurança e se o banco foi criado.`)), MAX_COMMIT_TIMEOUT)
                        );

                        // Race entre o commit real e o timeout
                        await Promise.race([batch.commit(), timeoutPromise]);
                        
                        successCount += batchSuccessCount;
                        const progress = Math.round((successCount / entries.length) * 100);
                        addLog(`✅ Lote ${loteNum}: ${batchSuccessCount} documentos salvos (Total: ${successCount}/${entries.length} - ${progress}%)`, 'success');
                        setProgress(progress);
                        console.log(`[Progress] ${successCount}/${entries.length} (${progress}%)`);
                    }
                } catch (commitError) {
                    console.error(`Erro ao salvar lote:`, commitError);
                    addLog(`❌ Erro ao salvar lote: ${commitError.message}`, 'error');
                    errorCount += batchSuccessCount;
                }

                // Delay maior entre commits
                if (i + BATCH_SIZE < entries.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            setProgress(100);
            const summary = `✅ Migração de [${selectedCollection}] concluída! ${successCount} documentos transferidos`;
            const errorMsg = errorCount > 0 ? ` (${errorCount} erros).` : '.';
            addLog(summary + errorMsg, 'success');
            console.log(`Migração finalizada: ${successCount} sucesso, ${errorCount} erros`);
            setMigrationStatus('completed');
        } catch (error) {
            addLog(`❌ Erro durante a migração: ${error.message}`, 'error');
            setMigrationStatus('error');
        } finally {
            setMigrating(false);
        }
    };

    const verifyMigration = async () => {
        try {
            addLog('Iniciando verificação...', 'info');

            // Contar documentos no RTDB
            const rtdbRef = ref(db, `${config.cityCollection}/${selectedCollection}`);
            const rtdbSnapshot = await get(rtdbRef);
            const rtdbCount = rtdbSnapshot.exists() ? Object.keys(rtdbSnapshot.val()).length : 0;

            // Contar documentos no Firestore
            const firestoreRef = collection(firestore, selectedCollection);
            const fsSnapshot = await getDocs(firestoreRef);
            const firestoreCount = fsSnapshot.size;

            addLog(`📊 [${selectedCollection}] RTDB: ${rtdbCount} documentos | Firestore: ${firestoreCount} documentos`, 'info');

            if (rtdbCount === firestoreCount) {
                addLog(`✅ Verificação bem-sucedida! Contagens coincidem.`, 'success');
            } else {
                addLog(`⚠️ Contagens diferem. RTDB: ${rtdbCount}, Firestore: ${firestoreCount}`, 'warning');
            }
        } catch (error) {
            addLog(`Erro na verificação: ${error.message}`, 'error');
        }
    };

    if (!isAuthReady) return <div className="loading-screen">Carregando...</div>;

    return (
        <div className="dashboard-layout">
            <AdminSidebar />
            <div className="dashboard-content" style={{ padding: '40px' }}>
                {/* Header */}
                <header className="page-header-container">
                    <div className="header-title-section">
                        <button
                            onClick={() => navigate('/admin-balcao')}
                            className="btn-secondary"
                            style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                        >
                            <LiaArrowLeftSolid size={18} /> Voltar ao Dashboard
                        </button>
                        <h1>Migração para Firestore</h1>
                        <p>Migre dados do Realtime Database para o Firestore com segurança</p>
                    </div>
                    <div className="user-profile">
                        <div className="user-text">
                            <p className="user-name-display">{auth.currentUser?.email || 'Admin'}</p>
                            <p className="user-type-display">Administrador</p>
                        </div>
                        <div className="user-avatar"></div>
                    </div>
                </header>

                {/* Seleção de Coleção */}
                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3>Configuração da Migração</h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Selecione a Coleção para Migrar</label>
                            <select 
                                value={selectedCollection} 
                                onChange={(e) => {
                                    setSelectedCollection(e.target.value);
                                    setMigrationStatus('idle');
                                    setMigrationLog([]);
                                    setProgress(0);
                                    setTotalCount(0);
                                }}
                                className="form-input"
                                disabled={migrating}
                            >
                                {collectionsToMigrate.map(col => (
                                    <option key={col.id} value={col.id}>{col.name} ({col.id})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="data-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3>Painel de Migração</h3>
                    </div>

                    <div style={{ padding: '20px' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ marginBottom: '12px' }}>Informações da Migração</h4>
                            <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                                <p style={{ margin: '8px 0' }}>
                                    <strong>Status:</strong>{' '}
                                    {migrationStatus === 'idle' && '⏳ Pronto'}
                                    {migrationStatus === 'in-progress' && '🔄 Migrando...'}
                                    {migrationStatus === 'completed' && '✅ Concluído'}
                                    {migrationStatus === 'error' && '❌ Erro'}
                                </p>
                                {totalCount > 0 && (
                                    <p style={{ margin: '8px 0' }}>
                                        <strong>Total de Documentos:</strong> {totalCount}
                                    </p>
                                )}
                                {progress > 0 && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div style={{
                                            background: '#e5e7eb',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            height: '24px'
                                        }}>
                                            <div style={{
                                                background: '#10b981',
                                                height: '100%',
                                                width: `${progress}%`,
                                                transition: 'width 0.3s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#fff',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}>
                                                {progress}%
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Botões de Ação */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                            <button
                                onClick={migrateToFirestore}
                                disabled={migrating || migrationStatus === 'completed'}
                                className="btn-primary"
                                style={{
                                    padding: '12px 24px',
                                    fontSize: '1rem',
                                    opacity: (migrating || migrationStatus === 'completed') ? 0.5 : 1,
                                    cursor: (migrating || migrationStatus === 'completed') ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {migrating ? '⏳ Migrando...' : '🚀 Iniciar Migração'}
                            </button>
                            <button
                                onClick={verifyMigration}
                                disabled={migrating}
                                className="btn-secondary"
                                style={{
                                    padding: '12px 24px',
                                    fontSize: '1rem',
                                    opacity: migrating ? 0.5 : 1,
                                    cursor: migrating ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ✓ Verificar Migração
                            </button>
                        </div>

                        {/* Log de Migração */}
                        <div style={{ marginTop: '24px' }}>
                            <h4 style={{ marginBottom: '12px' }}>Log de Atividades</h4>
                            <div style={{
                                background: '#1f2937',
                                color: '#f3f4f6',
                                padding: '16px',
                                borderRadius: '8px',
                                fontFamily: 'monospace',
                                maxHeight: '400px',
                                overflowY: 'auto',
                                fontSize: '0.9rem'
                            }}>
                                {migrationLog.length === 0 ? (
                                    <p style={{ color: '#9ca3af' }}>Nenhuma atividade ainda.</p>
                                ) : (
                                    migrationLog.map((log, idx) => (
                                        <div key={idx} style={{
                                            marginBottom: '8px',
                                            color: log.type === 'error' ? '#f87171' : log.type === 'success' ? '#86efac' : log.type === 'warning' ? '#fbbf24' : '#e5e7eb'
                                        }}>
                                            <span style={{ color: '#9ca3af' }}>[{log.timestamp}]</span> {log.message}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Informações Adicionais */}
                        <div style={{ marginTop: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>ℹ️ Informações Importantes</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e' }}>
                                <li>Os dados originais no Realtime Database <strong>não serão apagados</strong>.</li>
                                <li>A migração pode levar alguns minutos dependendo do volume de dados.</li>
                                <li>Você pode verificar o progresso através do log acima.</li>
                                <li>Após migração bem-sucedida, novas solicitações serão salvas no Firestore.</li>
                                <li>O Realtime Database será descontinuado gradualmente.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminMigration;
