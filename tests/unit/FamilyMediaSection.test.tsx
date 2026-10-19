import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FamilyMediaSection } from '@/features/media/components/FamilyMediaSection'

vi.mock('@/features/media/services/familyMedia.service', () => ({
  getFamilyAlbums: vi.fn().mockResolvedValue({ data: [], error: null }),
  getFamilyMedia: vi.fn().mockResolvedValue({ data: [], error: null }),
  getFamilyStories: vi.fn().mockResolvedValue({ data: [], error: null }),
  createFamilyAlbum: vi.fn(),
  uploadFamilyMedia: vi.fn(),
  deleteFamilyMedia: vi.fn(),
  createFamilyStory: vi.fn(),
}))

describe('FamilyMediaSection component', () => {
  const familyId = '11111111-1111-1111-1111-111111111111'

  it('renders section header, tabs and loading indicator', () => {
    const html = renderToStaticMarkup(
      <FamilyMediaSection familyId={familyId} canManage={true} />
    )

    expect(html).toContain('Family Media &amp; History')
    expect(html).toContain('Albums &amp; Photos')
    expect(html).toContain('Family History &amp; Stories')
    expect(html).toContain('Loading family archives')
  })

  it('renders consistent section container when canManage is false', () => {
    const html = renderToStaticMarkup(
      <FamilyMediaSection familyId={familyId} canManage={false} />
    )

    expect(html).toContain('Family Media &amp; History')
    expect(html).toContain('Albums &amp; Photos')
    expect(html).toContain('Family History &amp; Stories')
    expect(html).toContain('Loading family archives')
  })
})
