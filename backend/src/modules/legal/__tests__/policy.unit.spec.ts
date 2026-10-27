import { assertTransition,assertWithdrawalWindow,csvCell,isCurrentConsent,validateAcceptance,versions,withdrawalItems } from "../policy"
const config={terms:"v1",privacy:"p1"}
describe("legal policy",()=>{
 it("fails closed for missing or unbounded deployment versions",()=>{
  expect(()=>versions({})).toThrow("LEGAL_NOT_CONFIGURED")
  expect(()=>versions({LEGAL_TERMS_VERSION:"x".repeat(101),LEGAL_PRIVACY_VERSION:"p1"})).toThrow()
 })
 it.each([{}, {terms_accepted:"true"}, {terms_accepted:true,privacy_acknowledged:true,terms_version:"old",privacy_version:"p1"}])("requires explicit current acceptance %j",body=>expect(()=>validateAcceptance(body,config)).toThrow("TERMS_NOT_ACCEPTED"))
 it("uses server versions and checks customer binding",()=>{
  expect(validateAcceptance({terms_accepted:true,privacy_acknowledged:true,terms_version:"v1",privacy_version:"p1"},config)).toEqual(config)
  const row={terms_version:"v1",privacy_version:"p1",customer_id:"a",accepted_at:new Date()}
  expect(()=>isCurrentConsent(row,"a",config)).not.toThrow()
  expect(()=>isCurrentConsent(row,"b",config)).toThrow("TERMS_NOT_ACCEPTED")
  expect(()=>isCurrentConsent({...row,accepted_at:"invalid"},"a",config)).toThrow()
 })
 it("validates quantities against original lines and rejects duplicates",()=>{
  const order={items:[{id:"i",quantity:2}]}
  expect(withdrawalItems([{item_id:"i",quantity:1}],order)).toEqual([{item_id:"i",quantity:1}])
  for(const items of [[{item_id:"foreign",quantity:1}],[{item_id:"i",quantity:3}],[{item_id:"i",quantity:1},{item_id:"i",quantity:1}]]) expect(()=>withdrawalItems(items,order)).toThrow()
 })
 it("uses delivery before capture and permits exactly the boundary",()=>{
  const start=new Date("2026-01-20T10:00:00Z"), order={status:"completed",fulfillments:[{delivered_at:start}],payment_collections:[{payments:[{captured_at:"2026-01-01"}]}]}
  expect(()=>assertWithdrawalWindow(order,new Date(+start+14*86400000))).not.toThrow()
  expect(()=>assertWithdrawalWindow(order,new Date(+start+14*86400000+1))).toThrow("WITHDRAWAL_EXPIRED")
  expect(()=>assertWithdrawalWindow({status:"pending"})).toThrow("WITHDRAWAL_DATE_UNAVAILABLE")
 })
 it("rejects illegal state transitions and accepts replay",()=>{
  for(const [from,to] of [["received","accepted"],["received","rejected"],["accepted","refunded"],["refunded","refunded"]]) expect(()=>assertTransition(from,to)).not.toThrow()
  for(const [from,to] of [["received","refunded"],["rejected","accepted"],["refunded","received"]]) expect(()=>assertTransition(from,to)).toThrow()
 })
 it("escapes CSV formulas, quotes and line breaks",()=>{
  expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"')
  expect(csvCell('a"b\nc')).toBe('"a""b\nc"')
 })
 it.each(['=SUM(A1)', '+cmd', '-12.00', '@SUM(A1)', '\tplain', '\rplain', '  =SUM(A1)', '\t=SUM(A1)'])("exports unsafe CSV input %j as text", value=>{
  expect(csvCell(value)).toBe('"\'' + value + '"')
 })
 it.each([[null,'""'],[undefined,'""'],['plain@example.test','"plain@example.test"'],['source, "quoted"','"source, ""quoted"""'],['plain\r\nsource','"plain\r\nsource"']])("preserves ordinary CSV value %j", (value,expected)=>{
  expect(csvCell(value)).toBe(expected)
 })
})
