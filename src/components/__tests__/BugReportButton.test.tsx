import React from 'react';
import renderer, { act } from 'react-test-renderer';
import BugReportButton from '../BugReportButton';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import { useDatabaseContext } from '@/context/DatabaseContext';

jest.mock('@/context/SettingsContext');
jest.mock('@/context/DebugContext');
jest.mock('@/context/DatabaseContext');
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  nativeAppVersion: '1.0.0'
}));
jest.mock('expo-device', () => ({
  brand: 'Apple',
  modelName: 'iPhone',
  osName: 'iOS',
  osVersion: '16.0'
}));
jest.mock('@/components/CustomModal', () => 'CustomModal');

describe('BugReportButton', () => {
  const mockSettings = { showBugReportButton: true, serverUrl: 'http://example.com' };
  const mockGetDebugData = jest.fn().mockReturnValue({});
  const mockDb = {
    getSessions: jest.fn().mockResolvedValue([]),
    getSessionWithChunks: jest.fn().mockResolvedValue({ session: {}, chunks: [] })
  };

  beforeEach(() => {
    (useSettingsContext as jest.Mock).mockReturnValue({ settings: mockSettings, isLoaded: true });
    (useDebugContext as jest.Mock).mockReturnValue({ getDebugData: mockGetDebugData });
    (useDatabaseContext as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    let tree;
    act(() => {
      tree = renderer.create(<BugReportButton />);
    });
    expect(tree.toJSON()).not.toBeNull();
  });
});
