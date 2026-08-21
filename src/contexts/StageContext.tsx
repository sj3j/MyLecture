import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Stage } from '../types';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query, setDoc, doc } from 'firebase/firestore';

interface StageContextType {
  stages: Stage[];
  currentAppStage: string | null;
  setCurrentAppStage: (stageId: string | null) => void;
  isLoadingStages: boolean;
}

const StageContext = createContext<StageContextType | undefined>(undefined);

export function StageProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [currentAppStage, setCurrentAppStage] = useState<string | null>(() => {
    return localStorage.getItem('selectedAdminStage') || null;
  });
  const [isLoadingStages, setIsLoadingStages] = useState(true);

  useEffect(() => {
    const fetchStages = async () => {
      try {
        const stagesRef = collection(db, 'stages');
        const q = query(stagesRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          console.log("No stages found. Seeding default stages...");
          const defaultStages: Stage[] = [
            { id: 'stage_1', nameEn: 'First Stage', nameAr: 'المرحلة الأولى', order: 1 },
            { id: 'stage_2', nameEn: 'Second Stage', nameAr: 'المرحلة الثانية', order: 2 },
            { id: 'stage_3', nameEn: 'Third Stage', nameAr: 'المرحلة الثالثة', order: 3 },
            { id: 'stage_4', nameEn: 'Fourth Stage', nameAr: 'المرحلة الرابعة', order: 4 },
            { id: 'stage_5', nameEn: 'Fifth Stage', nameAr: 'المرحلة الخامسة', order: 5 },
          ];
          
          for (const s of defaultStages) {
            await setDoc(doc(db, 'stages', s.id), s);
          }
          
          setStages(defaultStages);
          if (!currentAppStage) {
            setCurrentAppStage('stage_3');
          }
        } else {
          const stagesData = snapshot.docs.map(doc => doc.data() as Stage);
          setStages(stagesData);
          if (!currentAppStage && stagesData.length > 0) {
            setCurrentAppStage(stagesData[2]?.id || stagesData[0].id); // default to stage 3 or first
          }
        }
      } catch (error) {
        console.error("Failed to fetch stages:", error);
      } finally {
        setIsLoadingStages(false);
      }
    };
    fetchStages();
  }, []);

  const handleSetCurrentStage = (stageId: string | null) => {
    setCurrentAppStage(stageId);
    if (stageId) {
      localStorage.setItem('selectedAdminStage', stageId);
    } else {
      localStorage.removeItem('selectedAdminStage');
    }
  };

  return (
    <StageContext.Provider value={{ stages, currentAppStage, setCurrentAppStage: handleSetCurrentStage, isLoadingStages }}>
      {children}
    </StageContext.Provider>
  );
}

export function useStageContext() {
  const context = useContext(StageContext);
  if (context === undefined) {
    throw new Error('useStageContext must be used within a StageProvider');
  }
  return context;
}
