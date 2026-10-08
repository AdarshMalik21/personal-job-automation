import { constants, publicEncrypt } from "node:crypto";

const NAUKRI_REQUEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALrlQ+djR0RjJwBF1xuisHmdFv334MIm
K6LgzJhmLhN7B5yuEyaKoasgXQk3+OQglsOaBxEJ0j5PcTL3nbOvt80CAwEAAQ==
-----END PUBLIC KEY-----`;

export const generateNkparam = (now = Date.now(), pageType = "srp"): string => {
  const plaintext = `v0|${now}|121_${pageType}`;
  return publicEncrypt(
    { key: NAUKRI_REQUEST_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(plaintext),
  ).toString("base64");
};
