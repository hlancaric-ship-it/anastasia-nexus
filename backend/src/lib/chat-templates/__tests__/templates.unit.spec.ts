import { CHAT_TEMPLATES_METADATA_KEY, readChatTemplates, validateChatTemplate, writeChatTemplates } from '../../chat-templates'

describe('Šablóny odpovedí v chate', () => {
  const item = { id: 'tpl_1', title: 'Doručenie', text: 'Zásielka je na ceste.', updated_at: '2026-10-21T10:00:00.000Z', updated_by: 'admin_1' }

  it('uloží a prečíta šablóny bez toho, aby prepísal ostatné kľúče metadát', () => {
    const metadata = writeChatTemplates({ iny: 'hodnota' }, [item])
    expect(metadata.iny).toBe('hodnota')
    const list = readChatTemplates(metadata)
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('Zásielka je na ceste.')
  })

  it('ignoruje poškodené záznamy', () => {
    expect(readChatTemplates({ [CHAT_TEMPLATES_METADATA_KEY]: [{ id: 'a', text: 'ok' }, { id: '', text: 'x' }, 'nezmysel', { text: 'bez id' }] })).toHaveLength(1)
    expect(readChatTemplates(null)).toEqual([])
  })

  it('doplní názov, ak chýba', () => {
    const list = readChatTemplates({ [CHAT_TEMPLATES_METADATA_KEY]: [{ id: 'a', text: 'Krátky text odpovede pre zákazníka' }] })
    expect(list[0].title).toBe('Krátky text odpovede pre zákazníka')
  })

  it('overí vstup od administrácie', () => {
    expect(validateChatTemplate({ text: 'Ahoj' }).ok).toBe(true)
    expect(validateChatTemplate({ text: '' }).ok).toBe(false)
    expect(validateChatTemplate({ text: 'x'.repeat(1001) }).ok).toBe(false)
    const long = validateChatTemplate({ title: 'y'.repeat(100), text: 'ok' })
    expect(long.ok && long.title.length).toBe(60)
  })
})
