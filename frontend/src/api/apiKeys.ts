import { authApiClient } from './authClient';

/** Resource kinds shown in API Key Management. The auth OpenAPI contract only
 * accepts the selected resource's name and ID, so the kind is UI metadata. */
export type ApiKeyResourceType = 'agent' | 'tool' | 'knowledge-base';

/**
 * POST /api/v1/auth/generate_apikey request contract from the supplied auth
 * OpenAPI schema. `userInput` is the only field available for the caller's key
 * label; the schema does not define a separate notes field.
 */
export interface GenerateApiKeyRequest {
  resourceName: string;
  resourceId: string;
  userInput: string;
}

/** Response contract from the supplied auth OpenAPI schema. */
export interface GenerateApiKeyResponse {
  apiKey?: string | null;
  status?: string | null;
}

/** UI-only metadata for a key generated during the current page session. */
export interface SessionApiKey {
  /** Browser-generated display ID; the backend schema returns no key ID. */
  id: string;
  name: string;
  note: string;
  resourceType: ApiKeyResourceType;
  resourceId: string;
  resourceName: string;
  apiKey: string;
  status: string;
  createdAt: string;
}

export class ApiKeyApiNotConfiguredError extends Error {
  constructor(operation: 'list' | 'delete') {
    const detail = operation === 'list'
      ? 'The supplied OpenAPI schema does not define an endpoint to list existing API keys.'
      : 'The supplied OpenAPI schema does not define an API-key delete or revoke endpoint. No key was deleted.';
    super(detail);
    this.name = 'ApiKeyApiNotConfiguredError';
  }
}

export const apiKeysApi = {
  /**
   * Uses the endpoint explicitly present in the supplied auth OpenAPI schema:
   * POST /api/v1/auth/generate_apikey
   *
   * The schema has no distinct note field. `userInput` therefore carries the
   * key name; notes remain local page-session metadata and are not sent to the
   * backend. Since the request lacks `resourceType`, `resourceName` carries
   * the canonical category ('Agent', 'Tool', or 'KnowledgeBase').
   */
  generate: async (payload: GenerateApiKeyRequest): Promise<GenerateApiKeyResponse> => {
    // The OpenAPI schema advertises both application/json and text/plain for
    // this response. authApiClient parses JSON content types; normalize a JSON
    // object returned as text/plain here as well.
    const raw = await authApiClient.post<GenerateApiKeyResponse | string>(
      '/api/v1/auth/generate_apikey',
      payload,
    );
    if (typeof raw !== 'string') return raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as GenerateApiKeyResponse;
    } catch {
      // The contract documents an ApiKeyResponse object, not a bare key string.
    }
    throw new Error('Unexpected API-key generation response. Expected an object containing apiKey and status.');
  },

  /**
   * TODO: connect this when the backend publishes a DELETE/revoke contract.
   * Do not remove a key from the UI and claim it is revoked when its server
   * secret may still be valid.
   */
  delete: async (_key: SessionApiKey): Promise<void> => {
    throw new ApiKeyApiNotConfiguredError('delete');
  },
};



