import React, { createContext, useContext, useRef, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DebugContextType {
  setDebugState: (key: string, data: any) => void;
  addDebugEvent: (event: string) => void;
  getDebugData: () => Record<string, any>;
}

export const DebugContext = createContext<DebugContextType | undefined>(undefined);

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

  // Load from disk on startup
  useEffect(() => {
    AsyncStorage.getItem('tourcast_debug_data').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          debugDataRef.current = {
            state: { ...parsed.state, ...debugDataRef.current.state },
            events: [...parsed.events, ...debugDataRef.current.events].slice(-200)
          };
        } catch (e) {
          console.warn('Failed to parse debug data from disk', e);
        }
      }
    });

    // Save to disk every 10 seconds
    const interval = setInterval(() => {
      debugDataRef.current.state.lastAliveTimestamp = new Date().toISOString();
      AsyncStorage.setItem('tourcast_debug_data', JSON.stringify(debugDataRef.current))
        .catch(e => console.warn('Failed to save debug data', e));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const setDebugState = (key: string, data: any) => {
    debugDataRef.current.state[key] = data;
  };

  const addDebugEvent = (event: string) => {
    const newEvent = {
      timestamp: new Date().toISOString(),
      event,
    };
    debugDataRef.current.events.push(newEvent);
    // Keep only the last 200 events to prevent memory bloat
    if (debugDataRef.current.events.length > 200) {
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
