
import { authTokenStore } from './authTokenStore';
import { serviceUrl } from '../config/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authTokenStore.get();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(serviceUrl('rag', `/api/v1${path}`), { ...init, headers });
  if (!response.ok) throw new Error(`RAG request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const ragApi = {
  getKnowledgeBases: (page=1,pageSize=25) => request<any>(`/knowledge-bases?page=${page}&pageSize=${pageSize}`),
  createKnowledgeBase: (data: unknown) => request<any>('/knowledge-bases', {method:'POST', body:JSON.stringify(data)}),
  getStrategies: (page=1,pageSize=25) => request<any>(`/strategies?page=${page}&pageSize=${pageSize}`),
  createStrategy: (data: unknown) => request<any>('/strategies', {method:'POST', body:JSON.stringify(data)}),
  getIngestedDocs: (kbId?:string) => request<any>(`/documents${kbId ? `?kbId=${encodeURIComponent(kbId)}` : ''}`),
  ingestDocument: (kbId:string,data:unknown) => request<any>(`/knowledge-bases/${encodeURIComponent(kbId)}/documents`,{method:'POST',body:JSON.stringify(data)}),
  deleteDocument: (docId:string) => request<void>(`/documents/${encodeURIComponent(docId)}`,{method:'DELETE'}),
  getKnowledgeBase: (kbId:string) => request<any>(`/knowledge-bases/${encodeURIComponent(kbId)}`),
};
