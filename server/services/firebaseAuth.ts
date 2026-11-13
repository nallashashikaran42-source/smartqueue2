import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface FirebaseAppletConfig {
  projectId: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> = {};
let certsExpiresAtMs = 0;

function getFirebaseProjectId(): string {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<FirebaseAppletConfig>;
  if (!parsed.projectId) {
    throw new Error('Firebase projectId is missing in firebase-applet-config.json.');
  }
  return parsed.projectId;
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const padLength = (4 - (input.length % 4)) % 4;
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(normalized, 'base64');
}

async function fetchGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAtMs && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (${res.status}).`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = certs;
  certsExpiresAtMs = now + maxAgeSeconds * 1000;
  return certs;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Firebase ID token is required.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  try {
    header = JSON.parse(base64UrlDecodeToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Malformed Firebase ID token.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid Firebase ID token algorithm or key ID.');
  }

  const projectId = getFirebaseProjectId();
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase token subject (UID) is invalid.');
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Firebase token has expired.');
  }
  if (!payload.iat || payload.iat > nowSeconds + 300) {
    throw new Error('Firebase token issued-at timestamp is invalid.');
  }
  if (payload.auth_time !== undefined && payload.auth_time > nowSeconds + 300) {
    throw new Error('Firebase token auth_time is invalid.');
  }

  let certs = await fetchGoogleCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    certsExpiresAtMs = 0;
    certs = await fetchGoogleCerts();
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unable to find matching Google public key for Firebase token.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValid = verifier.verify(certPem, base64UrlDecodeToBuffer(sigB64));
  if (!isValid) {
    throw new Error('Firebase ID token signature verification failed.');
  }

  if (!payload.email || payload.email_verified !== true) {
    throw new Error('A verified Google email address is required.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: payload.name?.trim(),
    picture: payload.picture?.trim(),
  };
}
