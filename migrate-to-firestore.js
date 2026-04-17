const admin = require('firebase-admin');
const serviceAccount = require('./path/to/serviceAccountKey.json'); // Baixe do Firebase Console > Configurações do Projeto > Contas de Serviço

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://blu-app-camara-default-rtdb.firebaseio.com',
  projectId: 'blu-app-camara'
});

const rtdb = admin.database();
const firestore = admin.firestore();

// Função para migrar uma coleção específica
async function migrateCollection(rtdbPath, firestoreCollection) {
  console.log(`Migrando ${rtdbPath} para Firestore...`);

  const rtdbRef = rtdb.ref(rtdbPath);
  const snapshot = await rtdbRef.once('value');
  const data = snapshot.val();

  if (!data) {
    console.log(`Nenhum dado encontrado em ${rtdbPath}.`);
    return 0;
  }

  const batch = firestore.batch();
  let count = 0;

  for (const [key, value] of Object.entries(data)) {
    const docRef = firestore.collection(firestoreCollection).doc(key);
    batch.set(docRef, value);
    count++;

    // Commit a cada 500 documentos para evitar limites do Firestore
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Migrados ${count} documentos de ${rtdbPath}...`);
      // Novo batch
    }
  }

  // Commit final
  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log(`Migração de ${rtdbPath} concluída! Total: ${count} documentos.`);
  return count;
}

// Função principal de migração
async function migrateAll() {
  try {
    console.log('Iniciando migração completa para Firestore...');

    // Migre as principais coleções (ajuste conforme suas necessidades)
    const cityCollection = 'paraipaba'; 

    await migrateCollection(`${cityCollection}/balcao-cidadao`, 'balcao-cidadao');
    await migrateCollection(`${cityCollection}/users`, 'users');
    await migrateCollection(`${cityCollection}/notifications`, 'notifications');
    await migrateCollection(`${cityCollection}/mail`, 'mail');
    // Adicione outras coleções conforme necessário

    console.log('Migração completa finalizada com sucesso!');
  } catch (error) {
    console.error('Erro durante a migração:', error);
  }
}

// Execute apenas se chamado diretamente
if (require.main === module) {
  migrateAll();
}

module.exports = { migrateCollection, migrateAll };