import { ModuleProvider, Modules } from '@medusajs/framework/utils'
import MembershipStripe from './service'
export default ModuleProvider(Modules.PAYMENT,{services:[MembershipStripe]})
