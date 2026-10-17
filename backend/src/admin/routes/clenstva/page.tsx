import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Users } from '@medusajs/icons'
import Memberships from './Memberships'
export const config=defineRouteConfig({label:'Členstvá',icon:Users})
export default Memberships
