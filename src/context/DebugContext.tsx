import React, { createContext, useContext, useRef, ReactNode } from 'react';

interface DebugContextType {
  setDebugState: (key: string, data: any) => void;
  addDebugEvent: (event: string) => void;
  getDebugData: () => Record<string, any>;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export const DebugProvider = ({ children }: { children: ReactNode }) => {
  // We use a mutable ref so writing high-frequency data (like audio levels)
  // doesn't trigger UI re-renders across the whole app.
  const debugDataRef = useRef<{
    state: Record<string, any>;
    events: Array<{ timestamp: string; event: string }>;
  }>({
    state: {},
    events: [],
  });

  const setDebugState = (key: string, data: any) => {
    debugDataRef.current.state[key] = data;
  };

  const addDebugEvent = (event: string) => {
    const newEvent = {
      timestamp: new Date().toISOString(),
      event,
    };
    debugDataRef.current.events.push(newEvent);
    // Keep only the last 100 events to prevent memory bloat
    if (debugDataRef.current.events.length > 100) {
      debugDataRef.current.events.shift();
    }
  };

  const getDebugData = () => {
    return debugDataRef.current;
  };

  return (
    <DebugContext.Provider value={{ setDebugState, addDebugEvent, getDebugData }}>
      {children}
    </DebugContext.Provider>
  );
};

export const useDebugContext = () => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error('useDebugContext must be used within a DebugProvider');
  }
  return context;
};
