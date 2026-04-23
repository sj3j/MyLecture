import { db, auth } from '../lib/firebase';
import { doc, writeBatch, collection, serverTimestamp, getDocs, query, where, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { GradeBatch, MatchedResult } from '../types/grades.types';

export async function confirmDegreeBatchClient(
  examName: string,
  confirmedResults: MatchedResult[],
  maxDegree?: number | string
) {
  const user = auth.currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول");

  if (!examName || !Array.isArray(confirmedResults)) {
    throw new Error('بيانات غير صالحة');
  }

  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const examId = `exam_${batchId}`;
  
  let saved = 0;
  let failed = 0;
  const studentIds: string[] = [];

  const chunkSize = 400; // Safe chunk size limit for Firestore batches
  
  try {
    for (let i = 0; i < confirmedResults.length; i += chunkSize) {
      const chunk = confirmedResults.slice(i, i + chunkSize);
      const firestoreBatch = writeBatch(db);
      
      for (const result of chunk) {
        if (result.matchedUserId) {
          const studentId = result.matchedUserId;
          studentIds.push(studentId);
          const degreeRef = doc(db, `degrees/${studentId}/exams/${examId}`);
          
          const degreeData: any = {
            examName,
            degree: result.degree || 0,
            batchId: batchId,
            createdAt: serverTimestamp()
          };
          if (maxDegree) degreeData.maxDegree = maxDegree;

          firestoreBatch.set(degreeRef, degreeData);
          saved++;
        } else {
          failed++;
        }
      }
      
      // On the last chunk, attach the main degreeBatches manifest
      if (i + chunkSize >= confirmedResults.length) {
        const batchRef = doc(db, 'degreeBatches', batchId);
        const batchDocData: any = {
          id: batchId,
          examName,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          status: 'confirmed',
          studentIds: studentIds,
          stats: {
            totalRows: confirmedResults.length,
            matched: saved,
            unmatched: failed
          }
        };
        if (maxDegree) batchDocData.maxDegree = maxDegree;
        firestoreBatch.set(batchRef, batchDocData);
      }

      await firestoreBatch.commit();
    }

    // Handle empty batches
    if (confirmedResults.length === 0) {
      const firestoreBatch = writeBatch(db);
      const batchRef = doc(db, 'degreeBatches', batchId);
      const emptyBatchData: any = {
        id: batchId,
        examName,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        status: 'confirmed',
        studentIds: studentIds,
        stats: {
          totalRows: 0,
          matched: 0,
          unmatched: 0
        }
      };
      if (maxDegree) emptyBatchData.maxDegree = maxDegree;
      firestoreBatch.set(batchRef, emptyBatchData);
      await firestoreBatch.commit();
    }

    return { saved, failed, batchId };
  } catch (err: any) {
    console.error("Firestore Client Batch Error:", err);
    throw new Error(err.message || "حدث خطأ أثناء حفظ درجات الطلاب");
  }
}

export async function undoDegreeBatch(batchId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول");

  const batchRef = doc(db, 'degreeBatches', batchId);
  const batchSnap = await getDoc(batchRef);
  
  if (!batchSnap.exists()) throw new Error("السجل غير موجود");

  const studentIds = batchSnap.data().studentIds || [];
  const examId = `exam_${batchId}`;

  const chunkSize = 400;
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    const firestoreBatch = writeBatch(db);
    
    for (const studentId of chunk) {
      const degreeRef = doc(db, `degrees/${studentId}/exams/${examId}`);
      firestoreBatch.delete(degreeRef);
    }
    
    await firestoreBatch.commit();
  }

  // Delete the batch doc itself in a final operation
  const finalBatch = writeBatch(db);
  finalBatch.delete(batchRef);
  await finalBatch.commit();
}
