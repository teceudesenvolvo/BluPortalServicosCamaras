const admin = require('firebase-admin');
// Configure como no script de migração

async function verifyMigration() {
  const rtdbCount = await countRTDB('paraipaba/balcao-cidadao');
  const firestoreCount = await countFirestore('balcao-cidadao');

  console.log(`RTDB: ${rtdbCount} documentos`);
  console.log(`Firestore: ${firestoreCount} documentos`);

  if (rtdbCount === firestoreCount) {
    console.log('✅ Contagens coincidem!');
  } else {
    console.log('❌ Contagens diferem. Verifique a migração.');
  }
}

async function countRTDB(path) {
  const snapshot = await admin.database().ref(path).once('value');
  return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
}

async function countFirestore(collection) {
  const snapshot = await admin.firestore().collection(collection).count().get();
  return snapshot.data().count;
}

verifyMigration().catch(console.error);