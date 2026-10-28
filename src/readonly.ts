import { createContext, useContext } from 'react'

/** True when rendering a published page for visitors: nothing is editable. */
export const ReadOnly = createContext(false)
export const useReadOnly = () => useContext(ReadOnly)
