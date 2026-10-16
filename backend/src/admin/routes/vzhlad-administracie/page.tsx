import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Swatch } from '@medusajs/icons'
import Appearance from './Appearance'
export const config = defineRouteConfig({ label: 'Vzhľad administrácie', icon: Swatch })
export default Appearance
