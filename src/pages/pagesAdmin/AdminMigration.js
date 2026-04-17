import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
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
            addLog('🩺 Verificando conexão com Firestore...', 'info');

            if (!auth.currentUser) {
                addLog('❌ Usuário não autenticado. Faça login primeiro.', 'error');
                return false;
            }
            addLog(`👤 Autenticado como: ${auth.currentUser.email}`, 'info');

            // Teste simples de escrita
            const healthRef = doc(firestore, '_system', 'migration_test');
            await setDoc(healthRef, { 
                lastCheck: new Date().toISOString(),
                user: auth.currentUser.email
            });

            addLog('✅ Conexão Firestore: OK', 'success');
            return true;
        } catch (error) {
            console.error("Erro de conexão Firestore:", error);
            addLog(`❌ Erro de conexão: ${error.message}`, 'error');
            addLog('💡 Dica: Verifique regras de segurança e conectividade de rede.', 'warning');
            return false;
        }
    };

    const migrateToFirestore = async () => {
        setMigrating(true);
        setMigrationStatus('in-progress');
        setMigrationLog([]);
        setProgress(0);

        try {
            addLog('🔄 Iniciando migração dos dados...', 'info');

            // Buscar dados do RTDB
            const rtdbRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
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

            // Migrar documento por documento (mais lento, mas mais confiável)
            addLog(`📤 Iniciando migração individual de ${entries.length} documentos...`, 'info');

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < entries.length; i++) {
                const [key, value] = entries[i];

                try {
                    console.log(`[DEBUG] Iniciando processamento do documento ${i + 1}/${entries.length}: ${key}`);
                    addLog(`⏳ Migrando documento ${i + 1}/${entries.length}: ${key}`, 'info');

                    // Validar documento
                    if (!key || typeof value !== 'object') {
                        console.warn(`Documento ${key} inválido, ignorando...`);
                        addLog(`⚠️ Documento ${key} inválido`, 'warning');
                        errorCount++;
                        continue;
                    }

                    console.log(`[DEBUG] Documento válido, verificando tamanho...`);
                    // Estimar tamanho do documento
                    const docSize = JSON.stringify(value).length;
                    if (docSize > 1000000) {
                        console.warn(`Documento ${key} muito grande (${docSize} bytes), ignorando...`);
                        addLog(`⚠️ Documento ${key} muito grande (${docSize} bytes)`, 'warning');
                        errorCount++;
                        continue;
                    }

                    console.log(`[DEBUG] Tamanho OK (${Math.round(docSize / 1024)}KB), preparando dados para Firestore...`);

                    // Preparar dados para Firestore
                    const firestoreData = {
                        ...value,
                        migratedAt: new Date().toISOString(),
                        source: 'RTDB'
                    };

                    console.log(`[DEBUG] Dados preparados, tentando salvar no Firestore...`);

                    // Salvar documento individualmente com timeout
                    const docRef = doc(firestore, 'balcao-cidadao', key);

                    // Criar uma promise com timeout
                    const savePromise = setDoc(docRef, firestoreData);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout ao salvar documento')), 30000)
                    );

                    await Promise.race([savePromise, timeoutPromise]);

                    console.log(`[DEBUG] Documento salvo com sucesso!`);
                    successCount++;
                    const progress = Math.round((successCount / entries.length) * 100);
                    setProgress(progress);

                    addLog(`✅ Documento ${key} migrado com sucesso (${progress}%)`, 'success');
                    console.log(`[Progress] ${successCount}/${entries.length} (${progress}%)`);

                    // Pequeno delay entre documentos para não sobrecarregar
                    if (i < entries.length - 1) {
                        console.log(`[DEBUG] Aguardando 50ms antes do próximo documento...`);
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                } catch (error) {
                    console.error(`[ERROR] Erro ao migrar documento ${key}:`, error);
                    addLog(`❌ Erro ao migrar ${key}: ${error.message}`, 'error');
                    errorCount++;
                }
            }

            setProgress(100);
            const summary = `✅ Migração concluída! ${successCount} documentos transferidos`;
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

    const migrateToFirestoreBatch = async () => {
        setMigrating(true);
        setMigrationStatus('in-progress');
        setMigrationLog([]);
        setProgress(0);

        try {
            addLog('🔄 Iniciando migração em lote (batch)...', 'info');

            // Buscar dados do RTDB
            const rtdbRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
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

            addLog(`${entries.length} documentos encontrados no RTDB. Iniciando transferência em lote...`, 'info');

            // Migrar em lotes de 10 documentos
            const batchSize = 10;
            let successCount = 0;
            let errorCount = 0;

            for (let batchIndex = 0; batchIndex < entries.length; batchIndex += batchSize) {
                const batchEntries = entries.slice(batchIndex, batchIndex + batchSize);
                const currentBatch = Math.floor(batchIndex / batchSize) + 1;
                const totalBatches = Math.ceil(entries.length / batchSize);

                addLog(`📦 Processando lote ${currentBatch}/${totalBatches} (${batchEntries.length} documentos)...`, 'info');

                try {
                    const batch = writeBatch(firestore);

                    for (const [key, value] of batchEntries) {
                        // Validar documento
                        if (!key || typeof value !== 'object') {
                            console.warn(`Documento ${key} inválido, ignorando...`);
                            errorCount++;
                            continue;
                        }

                        // Estimar tamanho do documento
                        const docSize = JSON.stringify(value).length;
                        if (docSize > 1000000) {
                            console.warn(`Documento ${key} muito grande (${docSize} bytes), ignorando...`);
                            addLog(`⚠️ Documento ${key} muito grande (${docSize} bytes)`, 'warning');
                            errorCount++;
                            continue;
                        }

                        // Adicionar ao batch
                        const docRef = doc(firestore, 'balcao-cidadao', key);
                        batch.set(docRef, {
                            ...value,
                            migratedAt: new Date().toISOString(),
                            source: 'RTDB'
                        });
                    }

                    // Executar batch
                    await batch.commit();

                    successCount += batchEntries.length - (batchEntries.length - (batchEntries.length - errorCount)); // Ajustar contagem
                    const progress = Math.round((successCount / entries.length) * 100);
                    setProgress(progress);

                    addLog(`✅ Lote ${currentBatch}/${totalBatches} migrado com sucesso (${progress}%)`, 'success');

                    // Delay entre lotes
                    if (batchIndex + batchSize < entries.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo entre lotes
                    }

                } catch (error) {
                    console.error(`Erro no lote ${currentBatch}:`, error);
                    addLog(`❌ Erro no lote ${currentBatch}: ${error.message}`, 'error');
                    errorCount += batchEntries.length;
                }
            }

            setProgress(100);
            const summary = `✅ Migração em lote concluída! ${successCount} documentos transferidos`;
            const errorMsg = errorCount > 0 ? ` (${errorCount} erros).` : '.';
            addLog(summary + errorMsg, 'success');
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
            const rtdbRef = ref(db, `${config.cityCollection}/balcao-cidadao`);
            const rtdbSnapshot = await get(rtdbRef);
            const rtdbCount = rtdbSnapshot.exists() ? Object.keys(rtdbSnapshot.val()).length : 0;

            // Contar documentos no Firestore
            const firestoreRef = collection(firestore, 'balcao-cidadao');
            // Para contar, vamos tentar um getDocs com limit
            const { getDocs } = await import('firebase/firestore');
            const fsSnapshot = await getDocs(firestoreRef);
            const firestoreCount = fsSnapshot.size;

            addLog(`📊 RTDB: ${rtdbCount} documentos | Firestore: ${firestoreCount} documentos`, 'info');

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
                                onClick={migrateToFirestoreBatch}
                                disabled={migrating || migrationStatus === 'completed'}
                                className="btn-primary"
                                style={{
                                    padding: '12px 24px',
                                    fontSize: '1rem',
                                    backgroundColor: '#059669',
                                    opacity: (migrating || migrationStatus === 'completed') ? 0.5 : 1,
                                    cursor: (migrating || migrationStatus === 'completed') ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {migrating ? '⏳ Migrando...' : '📦 Migração em Lote'}
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
