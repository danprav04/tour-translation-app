import React from 'react';
import renderer, { act } from 'react-test-renderer';
import VersionCheck from '../VersionCheck';
import { useSettingsContext } from '@/context/SettingsContext';
import { Linking, TouchableOpacity } from 'react-native';

jest.mock('@/context/SettingsContext');
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.5.5' },
}));

describe('VersionCheck', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const waitForMicrotasks = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('renders nothing if version is supported', async () => {
    (useSettingsContext as jest.Mock).mockReturnValue({
      isLoaded: true,
      settings: { serverUrl: 'http://test.server' },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ minSupportedVersion: '1.4.0' }),
    });

    let tree: any;
    act(() => {
      tree = renderer.create(<VersionCheck />);
    });
    
    await waitForMicrotasks();
    
    expect(mockFetch).toHaveBeenCalled();
    expect(tree.toJSON()).toBeNull();
  });

  it('renders update screen if version is unsupported', async () => {
    (useSettingsContext as jest.Mock).mockReturnValue({
      isLoaded: true,
      settings: { serverUrl: 'http://test.server' },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ minSupportedVersion: '1.6.0' }),
    });

    let tree: any;
    act(() => {
      tree = renderer.create(<VersionCheck />);
    });
    
    await waitForMicrotasks();
    
    expect(tree.toJSON()).not.toBeNull();
    const button = tree.root.findByType(TouchableOpacity);
    act(() => {
      button.props.onPress();
    });
    
    expect(Linking.openURL).toHaveBeenCalledWith('http://test.server');
  });
  
  it('does nothing if not loaded or no server url', () => {
    (useSettingsContext as jest.Mock).mockReturnValue({
      isLoaded: false,
      settings: {},
    });
    
    let tree: any;
    act(() => {
      tree = renderer.create(<VersionCheck />);
    });
    
    expect(mockFetch).not.toHaveBeenCalled();
    expect(tree.toJSON()).toBeNull();
  });
});
