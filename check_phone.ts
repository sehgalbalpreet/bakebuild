import { Firestore } from '@google-cloud/firestore';
import * as fs from 'fs';

async function main() {
  console.log('Reading config...');
  const rawConfig = fs.readFileSync('./firebase-applet-config.json', 'utf8');
  const config = JSON.parse(rawConfig);

  console.log(`Initializing Firestore on project: ${config.projectId}, database: ${config.firestoreDatabaseId}`);
  const db = new Firestore({
    projectId: config.projectId,
    databaseId: config.firestoreDatabaseId,
  });

  const targetPhones = ['+917696450433', '7696450433', '917696450433'];
  console.log('Searching for phones:', targetPhones);

  console.log('\n--- SEARCHING USERS COLLECTION ---');
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    let foundUsers = 0;
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const phone = data.phone ? String(data.phone).trim() : '';
      
      const isMatch = targetPhones.some(p => phone.includes(p) || p.includes(phone));
      if (isMatch || doc.id.includes('769645') || (data.displayName && data.displayName.toLowerCase().includes('tata'))) {
        foundUsers++;
        console.log(`Match Found in users - ID: ${doc.id}`);
        console.log(JSON.stringify({ id: doc.id, ...data }, null, 2));
        console.log('----------------------------');
      }
    });
    console.log(`Total matching user documents analyzed: ${foundUsers}`);
  } catch (err: any) {
    console.error('Error querying users:', err.message || err);
  }

  console.log('\n--- SEARCHING DEALERS COLLECTION ---');
  try {
    const dealersRef = db.collection('dealers');
    const snapshot = await dealersRef.get();
    let foundDealers = 0;
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const phone = data.phone ? String(data.phone).trim() : '';
      
      const isMatch = targetPhones.some(p => phone.includes(p) || p.includes(phone));
      if (isMatch || doc.id.includes('769645') || (data.companyName && data.companyName.toLowerCase().includes('tata')) || (data.staffName && data.staffName.toLowerCase().includes('tata'))) {
        foundDealers++;
        console.log(`Match Found in dealers - ID: ${doc.id}`);
        console.log(JSON.stringify({ id: doc.id, ...data }, null, 2));
        console.log('----------------------------');
      }
    });
    console.log(`Total matching dealer documents analyzed: ${foundDealers}`);
  } catch (err: any) {
    console.error('Error querying dealers:', err.message || err);
  }
}

main().catch(console.error);
