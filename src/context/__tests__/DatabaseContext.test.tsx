import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DatabaseProvider, useDatabaseContext } from '../DatabaseContext';
import * as SQLite from 'expo-sqlite';

jest.mock('expo-sqlite', () => {
  return {
    SQLiteProvider: ({ children }: any) => <>{children}</>,
    useSQLiteContext: jest.fn().mockReturnValue({}),
  };
});

const TestChild = () => {
  const db = useDatabaseContext();
  return <>{db ? 'DB Loaded' : 'No DB'}</>;
};

describe('DatabaseContext', () => {
  it('provides the database context', () => {
    render(
      <DatabaseProvider>
        <TestChild />
      </DatabaseProvider>
    );

    expect(screen.getByText('DB Loaded')).toBeTruthy();
  });
});
