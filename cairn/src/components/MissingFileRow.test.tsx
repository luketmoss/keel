import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MissingFileRow } from './MissingFileRow'

describe('MissingFileRow', () => {
  it('renders the file name and a missing-file warning, with no visibility control', () => {
    render(<MissingFileRow file={{ id: 'missing-1', name: 'deleted.kml' }} />)

    expect(screen.getByText('deleted.kml')).toBeDefined()
    expect(screen.getByLabelText('deleted.kml — file missing')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
