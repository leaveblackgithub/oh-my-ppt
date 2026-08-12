import { useCallback } from 'react'
import { ipc } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { useT } from '@renderer/i18n'
import type { SessionPreviewPage } from '../shared/types'
import { useSessionExportActions } from './useSessionExportActions'

export function useSessionPageActions(sessionId: string): {
  isExportingPptx: boolean
  exportPagePptx: (page: SessionPreviewPage, options?: { imageOnly?: boolean }) => void
  exportOutlinesMarkdown: () => void
  renamePage: (page: SessionPreviewPage) => void
  deletePage: (page: SessionPreviewPage) => void
  deleteSelectedPages: (pageIds: string[]) => void
  duplicatePage: (page: SessionPreviewPage) => void
} {
  const t = useT()
  const isExportingPptx = useSessionDetailUiStore((state) => state.isExportingPptx)
  const openPageTitleEdit = useSessionDetailUiStore((state) => state.openPageTitleEdit)
  const setDeleteConfirmPageId = useSessionDetailUiStore((state) => state.setDeleteConfirmPageId)
  const loadSession = useSessionStore((state) => state.loadSession)
  const toastError = useToastStore((state) => state.error)
  const exportActions = useSessionExportActions(sessionId)

  const exportPagePptx = useCallback(
    (page: SessionPreviewPage, options?: { imageOnly?: boolean }) => {
      void exportActions.exportPptx({ pageId: page.id, ...options })
    },
    [exportActions]
  )

  const exportOutlinesMarkdown = useCallback(() => {
    void exportActions.exportOutlinesMarkdown()
  }, [exportActions])

  const renamePage = useCallback(
    (page: SessionPreviewPage) => {
      openPageTitleEdit(page.id, page.title || '')
    },
    [openPageTitleEdit]
  )

  const deletePage = useCallback(
    (page: SessionPreviewPage) => {
      setDeleteConfirmPageId(page.id)
    },
    [setDeleteConfirmPageId]
  )

  const deleteSelectedPages = useCallback(
    async (pageIds: string[]): Promise<void> => {
      if (!sessionId || pageIds.length === 0) return
      const ui = useSessionDetailUiStore.getState()
      if (ui.isManagingPages) return
      ui.setIsManagingPages(true)
      try {
        const selectedPageId = ui.selectedPageId || ui.selectedPageIds[0]
        const result = await ipc.deleteSessionPages({
          sessionId,
          pageIds,
          selectedPageId: selectedPageId || undefined
        })
        useGenerateStore.getState().setPages(result.generatedPages)
        useSessionDetailUiStore.getState().setSelectedPageId(result.selectedPageId)
        useSessionDetailUiStore.getState().bumpPreviewKey()
        ui.setSelectedPageIds([])
        ui.setMultiSelectLastIndex(null)
        void ipc
          .clearSpeechScript(sessionId)
          .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
      } catch (error) {
        toastError(error instanceof Error ? error.message : t('pageManagement.deleteFailed'))
      } finally {
        useSessionDetailUiStore.getState().setIsManagingPages(false)
      }
    },
    [sessionId, t, toastError]
  )

  const duplicatePage = useCallback(
    (page: SessionPreviewPage) => {
      if (!sessionId || !page.id) return
      const ui = useSessionDetailUiStore.getState()
      if (ui.isAddingPage || ui.isManagingPages) return
      ui.setIsAddingPage(true)
      let targetSelection: string | null | undefined
      void (async () => {
        try {
          const result = await ipc.duplicateSessionPage({
            sessionId,
            sourcePageId: page.id
          })
          useGenerateStore.getState().setPages(result.generatedPages)
          await loadSession(sessionId)
          useGenerateStore.getState().setPages(useSessionStore.getState().currentGeneratedPages)
          targetSelection = result.selectedPageId || null
          useSessionDetailUiStore.getState().bumpPreviewKey()
          void ipc
            .clearSpeechScript(sessionId)
            .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
        } catch (err) {
          const message =
            err instanceof Error ? err.message : t('pageManagement.duplicatePageFailed')
          toastError(message)
        } finally {
          useSessionDetailUiStore.getState().finishAddPage(targetSelection)
        }
      })()
    },
    [sessionId, loadSession, t, toastError]
  )

  return {
    isExportingPptx,
    exportPagePptx,
    exportOutlinesMarkdown,
    renamePage,
    deletePage,
    deleteSelectedPages,
    duplicatePage
  }
}
