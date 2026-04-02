import { createContext } from 'react';

export const NumbersContext = createContext<Map<string, string>>(new Map());
export const ShowNumbersContext = createContext(false);
export const SearchTermContext = createContext('');
