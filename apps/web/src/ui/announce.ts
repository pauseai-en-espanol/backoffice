'use client';

import { createContext, useContext } from 'react';

/** The page's live region (Announcer): says a result in words. Outside one, saying anything does nothing. */
export const AnnounceContext = createContext<(message: string) => void>(() => undefined);

/** Says a result in the page's live region. */
export const useAnnounce = () => useContext(AnnounceContext);
