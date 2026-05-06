import { createContext, useContext, useCallback, useRef } from 'react'

const TooltipContext = createContext<{ onTooltipHide: () => void }>({
  onTooltipHide: () => {},
})

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onTooltipHide = useCallback(() => {
    document.body.setAttribute('data-recent-tooltip', '1')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      document.body.removeAttribute('data-recent-tooltip')
    }, 1500)
  }, [])

  return (
    <TooltipContext.Provider value={{ onTooltipHide }}>
      {children}
    </TooltipContext.Provider>
  )
}

export const useTooltipContext = () => useContext(TooltipContext)
