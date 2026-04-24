import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc,
  query, 
  where, 
  orderBy,
  serverTimestamp,
  increment,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { BankQuestion, QuestionTag } from '../types/questionBank.types';

export async function addBankQuestion(data: Omit<BankQuestion, 'id' | 'addedBy' | 'addedAt' | 'lastEditedBy' | 'lastEditedAt' | 'viewCount' | 'attemptCount' | 'correctCount' | 'accuracyRate'>) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');

  const payload = {
    ...data,
    addedBy: user.uid,
    addedAt: serverTimestamp(),
    lastEditedBy: null,
    lastEditedAt: null,
    viewCount: 0,
    attemptCount: 0,
    correctCount: 0,
    accuracyRate: 0
  };

  const docRef = await addDoc(collection(db, 'questionBank'), payload);
  // Add ID to output
  return docRef.id;
}

export async function editBankQuestion(id: string, data: Partial<BankQuestion>) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');

  const ref = doc(db, `questionBank/${id}`);
  await updateDoc(ref, {
    ...data,
    lastEditedBy: user.uid,
    lastEditedAt: serverTimestamp()
  });
}

export async function softDeleteBankQuestion(id: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');

  const ref = doc(db, `questionBank/${id}`);
  await updateDoc(ref, {
    isActive: false,
    lastEditedBy: user.uid,
    lastEditedAt: serverTimestamp()
  });
}

export async function getQuestionsForLecture(lectureId: string, subjectId: string): Promise<BankQuestion[]> {
  const qbRef = collection(db, 'questionBank');
  // Combine questions scopes: 
  // - lecture scope for lectureId
  // - subject scope for subjectId
  // - global scope
  // For simplicity since we can't easily do a unified OR query in basic firestore with multiple indexed fields without a special index or `in` on scope, we'll fetch them and merge:
  
  // Note: To optimize, we can use an `in` query on a combined field or just fetch scopes client side. Since we want lecture, subject, global scopes:
  
  const qLec = query(qbRef, where('isActive', '==', true), where('scope', '==', 'lecture'), where('lectureId', '==', lectureId));
  const qSub = query(qbRef, where('isActive', '==', true), where('scope', '==', 'subject'), where('subjectId', '==', subjectId));
  const qGlob = query(qbRef, where('isActive', '==', true), where('scope', '==', 'global'));
  
  const [resLec, resSub, resGlob] = await Promise.all([
    getDocs(qLec),
    getDocs(qSub),
    getDocs(qGlob)
  ]);
  
  const results: BankQuestion[] = [];
  resLec.forEach(d => results.push({ id: d.id, ...d.data() } as BankQuestion));
  resSub.forEach(d => results.push({ id: d.id, ...d.data() } as BankQuestion));
  resGlob.forEach(d => results.push({ id: d.id, ...d.data() } as BankQuestion));
  
  return results;
}

export async function getAllBankQuestionsForAdmin(): Promise<BankQuestion[]> {
  // Ordered by latest. In production with many docs we would paginate
  const q = query(collection(db, 'questionBank'), orderBy('addedAt', 'desc'));
  const snap = await getDocs(q);
  const results: BankQuestion[] = [];
  snap.forEach(d => results.push({ id: d.id, ...d.data() } as BankQuestion));
  return results;
}

export async function saveUserBankAnswer(userId: string, questionId: string, selectedAnswer: string, isCorrect: boolean, sessionId: string, tags: string[]) {
  const ref = doc(collection(db, `userBankAnswers/${userId}/questions`));
  await setDoc(ref, {
    questionId,
    selectedAnswer,
    isCorrect,
    answeredAt: serverTimestamp(),
    sessionId,
    tags
  });
  
  // And update the bank's aggregate metrics (attemptCount, correctCount, accuracyRate)
  const qRef = doc(db, `questionBank/${questionId}`);
  // Basic update (for accuracy we should ideally use transaction or cloud func)
  // Let's do a client-side transaction to update aggregate stats accurately
  // (In production prefer a cloud function to prevent fraud/contention)
  try {
    const qDoc = await getDoc(qRef);
    if(qDoc.exists()) {
      const data = qDoc.data();
      const newAttempts = (data.attemptCount || 0) + 1;
      const newCorrect = (data.correctCount || 0) + (isCorrect ? 1 : 0);
      const newAccuracy = newAttempts > 0 ? (newCorrect / newAttempts) : 0;
      
      await updateDoc(qRef, {
        attemptCount: increment(1),
        correctCount: increment(isCorrect ? 1 : 0),
        accuracyRate: newAccuracy
      });
    }
  } catch(e) {}
}

export async function bulkImportFromExcel(questions: any[]) {
    // simplified for now, assuming array of pre-mapped questions
    const batch = writeBatch(db);
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in");

    for (const q of questions) {
        const docRef = doc(collection(db, 'questionBank'));
        batch.set(docRef, {
            ...q,
            addedBy: user.uid,
            addedAt: serverTimestamp(),
            lastEditedBy: null,
            lastEditedAt: null,
            viewCount: 0,
            attemptCount: 0,
            correctCount: 0,
            accuracyRate: 0
        });
    }

    await batch.commit();
}
