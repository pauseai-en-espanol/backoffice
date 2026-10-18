'use client';

import { createContext, useContext } from 'react';

/** What closes EditInPlace's form; provided by EditInPlace. */
export const EditDone = createContext<(() => void) | undefined>(undefined);

/** Inside EditInPlace, what closes its form (once saved, or on "Cancelar"); outside one, nothing. */
export const useEditDone = (): (() => void) | undefined => useContext(EditDone);
