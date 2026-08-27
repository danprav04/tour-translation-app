import React, { createContext, useContext, useEffect, useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { TranscriptDatabaseService } from '@/services/transcriptDatabase';

export const DatabaseContext = createContext<TranscriptDatabaseService | null>(null);

export const useDatabaseContext = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseContext must be used within a DatabaseProvider');
  }
  return context;
};

// Component that wraps children and provides the service instance
const DatabaseServiceProvider = ({ children }: { children: React.ReactNode }) => {
  const db = useSQLiteContext();
  const [service, setService] = useState<TranscriptDatabaseService | null>(null);

  useEffect(() => {
    const s = new TranscriptDatabaseService(db);
    setService(s);
  }, [db]);

  if (!service) {
    return null; // Or a loading spinner
  }

  return (
    <DatabaseContext.Provider value={service}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <SQLiteProvider 
      databaseName="tourcast_transcripts.db" 
      onInit={TranscriptDatabaseService.initDatabase}
    >
      <DatabaseServiceProvider>
        {children}
      </DatabaseServiceProvider>
    </SQLiteProvider>
  );
};
