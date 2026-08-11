import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

export interface OEMInstructions {
  brand: string;
  steps: string[];
  detailsUrl: string;
}

export async function getOEMBatteryInstructions(): Promise<OEMInstructions | null> {
  const hasShown = await AsyncStorage.getItem('hasShownOEMGuide');
  if (hasShown === 'true') {
    return null;
  }

  const brand = Device.brand?.toLowerCase() || '';

  if (['xiaomi', 'redmi', 'poco'].includes(brand)) {
    return {
      brand: 'Xiaomi',
      steps: [
        'Enable Autostart for this app',
        'Set Battery saver to "No restrictions"',
        'Lock the app in Recent apps'
      ],
      detailsUrl: 'https://dontkillmyapp.com/xiaomi'
    };
  }
  
  if (brand === 'samsung') {
    return {
      brand: 'Samsung',
      steps: [
        'Go to Battery > Background usage limits',
        'Add this app to "Never sleeping apps"'
      ],
      detailsUrl: 'https://dontkillmyapp.com/samsung'
    };
  }

  if (['huawei', 'honor'].includes(brand)) {
    return {
      brand: 'Huawei',
      steps: [
        'Go to App launch settings',
        'Manage manually and allow all 3 toggles'
      ],
      detailsUrl: 'https://dontkillmyapp.com/huawei'
    };
  }

  if (['oppo', 'realme', 'oneplus'].includes(brand)) {
    return {
      brand: 'Oppo/OnePlus',
      steps: [
        'Go to Battery > Background restrictions',
        'Exclude this app from restrictions'
      ],
      detailsUrl: 'https://dontkillmyapp.com/oppo'
    };
  }

  if (['vivo', 'iqoo'].includes(brand)) {
    return {
      brand: 'Vivo',
      steps: [
        'Go to Battery management',
        'Allow Background power consumption'
      ],
      detailsUrl: 'https://dontkillmyapp.com/vivo'
    };
  }

  return null;
}

export async function dismissOEMGuide(): Promise<void> {
  await AsyncStorage.setItem('hasShownOEMGuide', 'true');
}

export function openOEMGuide(url: string) {
  Linking.openURL(url).catch(() => {});
}
