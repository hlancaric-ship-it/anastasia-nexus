// Klub ANASTASIA nie je súčasťou Fázy 1 (zmluva čl. 2, mimo rozsahu diela). Zapína sa len buildom s ANASTASIA_CLUB=1.
export const CLUB_ENABLED=(globalThis.process?.env?.ANASTASIA_CLUB??'')==='1';
