import { cleanup } from '@testing-library/preact'
import { afterEach } from 'vitest'

// Testing Library only auto-cleans when Vitest's globals are on. They are not,
// so without this the second test in a file renders into the first one's DOM.
afterEach(cleanup)
