import { normalizeText } from "./text.js";

const companySuffix =
  /\b(private limited|pvt limited|pvt ltd|private ltd|limited|ltd)\.?$/;

export const normalizeCompany = (company: string): string =>
  normalizeText(company).replace(/\./g, "").replace(companySuffix, "").trim();
