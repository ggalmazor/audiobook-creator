import { useState } from 'preact/hooks'
import type { Route } from '../types/index.ts'

export function useRouter(initialRoute: Route = 'main') {
  const [currentRoute, setCurrentRoute] = useState<Route>(initialRoute)
  
  const navigate = (route: Route) => {
    setCurrentRoute(route)
  }
  
  return {
    currentRoute,
    navigate,
    isMainView: currentRoute === 'main',
    isConversionView: currentRoute === 'conversion'
  }
}