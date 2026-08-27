import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { DatabaseProvider, useDatabaseContext } from '../DatabaseContext';

jest.mock('expo-sqlite', () => {
  return {
    SQLiteProvider: ({ children }: any) => <>{children}</>,
    useSQLiteContext: jest.fn().mockReturnValue({}),
  };
});

const TestChild = () => {
  const db = useDatabaseContext();
  return <Text>{db ? 'DB Loaded' : 'No DB'}</Text>;
};

describe('DatabaseContext', () => {
  it('provides the database context', async () => {
    const { getByText } = await render(
      <DatabaseProvider>
        <TestChild />
      </DatabaseProvider>
    );

    expect(getByText('DB Loaded')).toBeTruthy();
  });

  it('throws error when used outside provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<TestChild />)).rejects.toThrow('useDatabaseContext must be used within a DatabaseProvider');
  });
});
