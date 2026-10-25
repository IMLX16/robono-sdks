import { RobonoError } from './errors.js';

export interface RobonoCallingBackendOptions {
  /** Copy these addresses from Calling in your Robono workspace. */
  admissionUrl: string;
  serviceUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export interface CallingRelationshipInput {
  externalUserIds: [string, string];
  allowed: boolean;
  /** Monotonically increasing revision from your persisted friendship record. */
  revision: number;
}
export interface CallingRelationshipResult { connectionId: string; allowed: boolean; revision: number }
export interface CallingSession { serviceUrl: string; token: string; expiresAt: number }

function httpsAddress(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Configure a plain HTTPS calling address.');
  return url.href.replace(/\/$/, '');
}
/** Backend-only admission and permission management. No screens or native dependencies. */
export class RobonoCallingBackend {
  private readonly admissionUrl: string;
  private readonly serviceUrl: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  constructor(options: RobonoCallingBackendOptions) {
    this.admissionUrl = httpsAddress(options.admissionUrl);
    this.serviceUrl = httpsAddress(options.serviceUrl);
    if (!options.apiKey?.trim()) throw new Error('A server-side network API key is required.');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Invalid calling timeout.');
  }
  private async post<T>(url: string, body: unknown, authenticated = true): Promise<T> {
    const response = await this.fetcher(url, {method:'POST', redirect:'error', signal:AbortSignal.timeout(this.timeoutMs),
      headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${this.apiKey}`}:{})},body:JSON.stringify(body)});
    let data: any; try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const wait = retry == null ? NaN : /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry)*1000 : Date.parse(retry)-Date.now();
      throw new RobonoError('The calling request failed.',{status:response.status,
        code:typeof data?.error==='string'?data.error:'calling_request_failed',
        retryable:response.status===429||response.status>=500,...(Number.isFinite(wait)?{retryAfterMs:Math.max(0,wait)}:{}),
        details:data?.revision===undefined?undefined:{revision:data.revision}});
    }
    if (!data || typeof data !== 'object') throw new RobonoError('Invalid calling response.',{code:'invalid_calling_response'});
    return data as T;
  }
  /** Call only after authenticating the user on your own backend. Never trust a client-supplied user ID. */
  async createSession(externalUserId: string, connectionId?: string): Promise<CallingSession> {
    if (!externalUserId || externalUserId.length>200 || externalUserId.trim()!==externalUserId) throw new Error('Invalid external user ID.');
    if (connectionId !== undefined && !/^(app|bridge|network):[0-9a-f-]{36}$/i.test(connectionId)) throw new Error('Invalid calling connection ID.');
    const grant = await this.post<{ticket:string;serviceUrl:string}>(this.admissionUrl,{operation:'admit',kind:'network',protocolVersion:1,externalUserId});
    if (grant.serviceUrl !== this.serviceUrl || typeof grant.ticket !== 'string' || !grant.ticket) throw new RobonoError('Unexpected calling admission response.',{code:'invalid_calling_response'});
    const session = await this.post<{token:string;expiresAt:number}>(this.serviceUrl+'/sessions',{ticket:grant.ticket,...(connectionId?{connectionId}:{})},false);
    if (typeof session.token!=='string'||!session.token||!Number.isFinite(session.expiresAt)||session.expiresAt<=Date.now()) throw new RobonoError('Invalid calling session.',{code:'invalid_calling_response'});
    return {serviceUrl:this.serviceUrl,token:session.token,expiresAt:session.expiresAt};
  }
  /** Attest to an existing same-network friendship; synchronize blocks and permission changes here. */
  setRelationship(input: CallingRelationshipInput): Promise<CallingRelationshipResult> {
    if (!Array.isArray(input.externalUserIds)||input.externalUserIds.length!==2||
      !input.externalUserIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=200&&id.trim()===id&&!/[\u0000-\u001f\u007f]/.test(id))||
      input.externalUserIds[0]===input.externalUserIds[1]||typeof input.allowed!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<1) throw new Error('Invalid calling relationship.');
    return this.post(this.admissionUrl,{...input,operation:'relationship'});
  }
  /** Presentation data only. Deliver this alongside the short-lived session to your app. */
  appearance(): Promise<{appearance:Record<string,unknown>;revision:number}> {
    return this.post(this.admissionUrl,{operation:'appearance'});
  }
  notifications(enabled?: boolean): Promise<{enabled:boolean;events:string[]}> {
    return this.post(this.admissionUrl,{operation:'notifications',...(enabled===undefined?{}:{enabled})});
  }
}
