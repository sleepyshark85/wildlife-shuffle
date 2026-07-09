import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    const loadValue = async () => {
      try {
        const item = await AsyncStorage.getItem(key);
        if (item) {
          setStoredValue(JSON.parse(item));
        }
        setIsLoaded(true);
      } catch (error) {
        console.error(`Error reading from AsyncStorage: ${key}`, error);
        setIsLoaded(true);
      }
    };

    loadValue();
  }, [key]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      // Save to AsyncStorage asynchronously
      AsyncStorage.setItem(key, JSON.stringify(valueToStore)).catch(error => {
        console.error(`Error writing to AsyncStorage: ${key}`, error);
      });
    } catch (error) {
      console.error(`Error in setValue: ${key}`, error);
    }
  };

  return [storedValue, setValue];
}
