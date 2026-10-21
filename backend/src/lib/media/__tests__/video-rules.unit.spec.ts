import { describe, expect, it } from 'vitest'
import {
  HERO_VIDEO_MAX_SIZE,
  HERO_VIDEO_TYPES,
  checkHeroUpload,
  heroVideoVariant,
  isHeroVideo,
} from '../video-rules'

describe('Hero video – pravidlá nahrávania', () => {
  it('prijíma len mp4 a webm', () => {
    expect([...HERO_VIDEO_TYPES]).toEqual(['video/mp4', 'video/webm'])
    expect(isHeroVideo({ type: 'video/mp4' })).toBe(true)
    expect(isHeroVideo({ type: 'video/webm' })).toBe(true)
    expect(isHeroVideo({ type: 'image/jpeg' })).toBe(false)
    expect(isHeroVideo({ type: 'application/pdf' })).toBe(false)
  })

  it('odmietne video iného typu s prehľadnou hláškou', () => {
    const message = checkHeroUpload({ name: 'hero.mov', type: 'video/quicktime', size: 1000 })
    expect(message).toContain('MP4')
    expect(message).toContain('hero.mov')
  })

  it('odmietne príliš veľké video', () => {
    const message = checkHeroUpload({ name: 'hero.mp4', type: 'video/mp4', size: HERO_VIDEO_MAX_SIZE + 1 })
    expect(message).toContain('príliš veľké')
  })

  it('poster musí byť obrázok a nie príliš veľký', () => {
    expect(checkHeroUpload({ name: 'poster.png', type: 'image/png', size: 1000 }, 'poster')).toBeNull()
    expect(checkHeroUpload({ name: 'poster.mp4', type: 'video/mp4', size: 1000 }, 'poster')).toContain('Poster musí byť obrázok')
    expect(checkHeroUpload({ name: 'poster.png', type: 'image/png', size: 6 * 1024 * 1024 }, 'poster')).toContain('príliš veľký')
  })

  it('akceptuje len rozmery 1080p, 720p a 480p', () => {
    expect(heroVideoVariant(1920, 1080)?.label).toBe('1080p')
    expect(heroVideoVariant(1280, 720)?.label).toBe('720p')
    expect(heroVideoVariant(854, 480)?.label).toBe('480p')
    expect(heroVideoVariant(1234, 567)).toBeNull()
  })
})
