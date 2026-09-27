let adminPin: string | null = null;
try {
  adminPin = sessionStorage.getItem('adminPin');
} catch {
  /* sin almacenamiento disponible */
}

export function getAdminPin(): string | null {
  return adminPin;
}

export function setAdminPin(pin: string | null): void {
  adminPin = pin;
  try {
    if (pin) sessionStorage.setItem('adminPin', pin);
    else sessionStorage.removeItem('adminPin');
  } catch {
    /* ignorar */
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, url: string, body?: unknown, raw?: Blob | ArrayBuffer): Promise<T> {
  const headers: Record<string, string> = {};
  if (adminPin) headers['x-admin-pin'] = adminPin;
  let payload: BodyInit | undefined;
  if (raw) {
    headers['Content-Type'] = 'application/octet-stream';
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(data?.error ?? `Error ${res.status}`, res.status);
  return data as T;
}

export async function download(url: string, fileName: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (adminPin) headers['x-admin-pin'] = adminPin;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new ApiError('No se ha podido descargar el fichero.', res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
