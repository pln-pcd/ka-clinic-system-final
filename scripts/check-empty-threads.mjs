
import { db } from '../api/_lib/firebaseAdmin.js';

async function checkThreads() {
  const threadsSnap = await db.collection('chatThreads').get();
  console.log('Total threads:', threadsSnap.size);
  let emptyCount = 0;
  for (const doc of threadsSnap.docs) {
    const data = doc.data();
    // Check if there are messages for this thread
    const msgsSnap = await db.collection('chatMessages').where('threadId', '==', doc.id).limit(1).get();
    const hasMessages = !msgsSnap.empty;
    const hasLastMessage = Boolean(data.lastMessage && data.lastMessage.trim());
    if (!hasMessages && !hasLastMessage) {
      emptyCount++;
      console.log(`Empty thread: ID=${doc.id}, patientName=${data.patientName}, patientUid=${data.patientUid}, unread=${data.unread}, createdAt=${new Date(data.createdAt || 0).toISOString()}`);
    } else {
      console.log(`Non-empty thread: ID=${doc.id}, patientName=${data.patientName}, msgsCount>=${msgsSnap.size}, lastMessage="${data.lastMessage}"`);
    }
  }
  console.log(`Summary: ${emptyCount} empty conversation(s) out of ${threadsSnap.size} total threads.`);
  process.exit(0);
}

checkThreads().catch(err => {
  console.error(err);
  process.exit(1);
});
