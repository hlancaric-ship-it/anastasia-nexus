import { base32hex, crc32, payBySquareFields, payBySquareText, spaydText } from "../qr-payment"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lzma = require("lzma")

const INPUT = { iban: "SK17 1100 0000 0026 2409 8906", beneficiary: "LUCRAT spol. s r.o.", amount: 168, variable_symbol: "000063", note: "Objednávka 63" }

describe("QR platba prevodom", () => {
  it("CRC32 sedí s kontrolnou hodnotou", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })
  it("base32hex bez výplne", () => {
    expect(base32hex(new TextEncoder().encode("foobar"))).toBe("CPNMUOJ1E8")
    expect(base32hex(new TextEncoder().encode("f"))).toBe("CO")
  })
  it("polia PAY by square majú správne poradie a bez medzier v IBAN", () => {
    const fields = payBySquareFields(INPUT).split("\t")
    expect(fields).toHaveLength(19)
    expect(fields.slice(0, 7)).toEqual(["", "1", "1", "168.00", "EUR", "", "000063"])
    expect(fields[11]).toBe("1"); expect(fields[12]).toBe("SK1711000000002624098906")
    expect(fields[16]).toBe("LUCRAT spol. s r.o.")
  })
  it("výsledok sa dá rozbaliť späť na pôvodné dáta s platným CRC", async () => {
    const text = await payBySquareText(INPUT)
    expect(text).toMatch(/^[0-9A-V]+$/)
    // spätné dekódovanie: base32hex → bajty → hlavička 4 B → LZMA s doplnenou hlavičkou
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUV"
    let bits = 0, value = 0; const bytes: number[] = []
    for (const char of text) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; value &= (1 << bits) - 1 } }
    expect(bytes.slice(0, 2)).toEqual([0, 0])
    const length = bytes[2]! | (bytes[3]! << 8)
    const header = [0x5d, 0x00, 0x00, 0x02, 0x00, length & 0xff, (length >>> 8) & 0xff, 0, 0, 0, 0, 0, 0]
    const decoded: number[] = await new Promise((resolve, reject) => lzma.decompress([...header, ...bytes.slice(4)], (r: any, e: any) => e ? reject(e) : resolve(Array.from(Buffer.from(r))) ))
    const crc = decoded[0]! | (decoded[1]! << 8) | (decoded[2]! << 16) | (decoded[3]! << 24)
    const body = Uint8Array.from(decoded.slice(4))
    expect(crc >>> 0).toBe(crc32(body))
    expect(Buffer.from(body).toString("utf8")).toBe(payBySquareFields(INPUT))
  })
  it("SPAYD pre české banky", () => {
    expect(spaydText(INPUT)).toBe("SPD*1.0*ACC:SK1711000000002624098906*AM:168.00*CC:EUR*X-VS:000063*MSG:OBJEDNÁVKA 63")
  })
  it("odmietne neplatnú sumu a IBAN", async () => {
    await expect(payBySquareText({ ...INPUT, amount: 0 })).rejects.toThrow("QR_INVALID_AMOUNT")
    await expect(payBySquareText({ ...INPUT, iban: "x" })).rejects.toThrow("QR_INVALID_IBAN")
  })
})
