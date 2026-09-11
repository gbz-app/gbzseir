/**
 * AWS Signature Version 4, query-string ("presigned URL") flavour, for S3-compatible storage (Cloudflare R2).
 * Dependency-free: node:crypto only, so it runs on the server alone (it needs the secret key; never import it from a
 * Client Component). Spec: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 *
 * The payload is not signed (UNSIGNED-PAYLOAD), but every header passed in `headers` is: the client must send exactly
 * those values. For uploads that is content-type and content-length, so the object that lands is the size and type the
 * server agreed to. Verified against the AWS documented example (scratchpad wf-stage45/sigv4-test.mjs).
 */
import { createHash, createHmac } from "node:crypto";

export type PresignInput = {
  method: string;
  host: string;
  /** Absolute path, not yet encoded ("/bucket/a b.mp4"); each segment is URI-encoded here and "/" is kept. */
  path: string;
  region: string;
  /** Default "s3". */
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Validity in seconds (1..604800). */
  expiresIn: number;
  /** Signing time (default now). */
  date?: Date;
  /** Headers the client must send with exactly these values. `host` is always signed. */
  headers?: Record<string, string>;
  /** Extra query parameters (e.g. list-type=2, prefix=...). */
  query?: Record<string, string>;
};

export type Presigned = { url: string; signature: string; canonicalRequest: string; stringToSign: string };

const ALGORITHM = "AWS4-HMAC-SHA256";

/** RFC 3986 encoding as SigV4 wants it: unreserved characters stay, everything else is %XX (UTF-8, upper-case hex). */
export function uriEncode(value: string, encodeSlash = true): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return encodeSlash ? encoded : encoded.replace(/%2F/g, "/");
}

/** "20130524T000000Z" */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/** kSigning = HMAC(HMAC(HMAC(HMAC("AWS4" + secret, date), region), service), "aws4_request") */
export function signingKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
}

export function presign(input: PresignInput): Presigned {
  const service = input.service ?? "s3";
  const expires = Math.floor(input.expiresIn);
  if (!(expires >= 1 && expires <= 604800)) throw new Error("expiresIn must be 1..604800 seconds");
  if (!input.path.startsWith("/")) throw new Error("path must start with /");

  const stamp = amzDate(input.date ?? new Date());
  const dateStamp = stamp.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;

  const headers = new Map<string, string>();
  headers.set("host", input.host);
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers.set(name.toLowerCase().trim(), String(value).trim().replace(/\s+/g, " "));
  }
  const headerNames = [...headers.keys()].sort();
  const signedHeaders = headerNames.join(";");
  const canonicalHeaders = headerNames.map((n) => `${n}:${headers.get(n)}\n`).join("");

  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaders],
    ...Object.entries(input.query ?? {}),
  ];
  const canonicalQuery = params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalUri = input.path
    .split("/")
    .map((segment) => uriEncode(segment))
    .join("/");

  const canonicalRequest = [input.method.toUpperCase(), canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(input.secretAccessKey, dateStamp, input.region, service))
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    url: `https://${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    signature,
    canonicalRequest,
    stringToSign,
  };
}
