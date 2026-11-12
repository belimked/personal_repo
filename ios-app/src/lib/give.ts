import { router } from 'expo-router'
import { useCallback } from 'react'
import { ActionSheetIOS, Alert } from 'react-native'
import { api } from './api'
import { useStore } from './store'
import { useRecorder, type Sent } from './recorder'

/** 交资料：拍照 / 相册 / 文件 / 录音文件 / 录会议，传上去后打开那份资料 */
export function useGive() {
  const rec = useRecorder()
  const { token } = useStore()
  return useCallback((delay = 0) => {
    const open = (sent: Sent | null) => { if (sent) router.push({ pathname: '/minutes', params: { id: sent.recording.id } }) }
    const acts = [
      { text: '拍照', run: () => { void rec.giveFile('camera').then(open) } },
      { text: '从相册选', run: () => { void rec.giveFile('photos').then(open) } },
      { text: '选文件（PDF、Word、txt）', run: () => { void rec.giveFile('files').then(open) } },
      { text: '粘贴链接', run: () => Alert.prompt('粘贴链接', '请输入 http 或 https 网页地址', [
        { text: '取消', style: 'cancel' }, { text: '交给小禾', onPress: (url?: string) => {
          if (!token || !url?.trim()) return
          void api.link(token, url.trim()).then((r) => router.push({ pathname: '/minutes', params: { id: r.recording.id } })).catch((e) => Alert.alert('交链接失败', e instanceof Error ? e.message : '打不开这个链接'))
        } },
      ], 'plain-text', 'https://') },
      { text: '导入录音文件', run: () => { void rec.importFile().then(open) } },
      { text: '录会议', run: () => router.push('/records') },
    ]
    setTimeout(() => ActionSheetIOS.showActionSheetWithOptions({
      title: '交资料',
      message: '照片和扫描件我会认出里面的字，文档直接读正文，然后整理成摘要和要办的事。原件保留 90 天。',
      options: [...acts.map((a) => a.text), '取消'], cancelButtonIndex: acts.length,
    }, (n) => { if (n < acts.length) acts[n].run() }), delay)
  }, [rec, token])
}
