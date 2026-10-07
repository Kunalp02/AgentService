
/**
 * Types mirror ccil.aiplatform.tools_config's OpenAPI schema exactly
 * (AiGatewayDto / ModelRegistryDto and their Create/Update request DTOs).
 * Do not add fields that aren't in the spec — the backend has no
 * cost/latency/capabilities data for gateways or models.
 */

export interface AiGatewayDto {
  id: string; // uuid
  name: string | null;
  url: string | null;
  isActive: boolean;
  createdAt: string; // ISO date-time
}

export interface AiGatewayPublicDto {
  id: string;
  name: string | null;
  isActive: boolean;
}

export interface CreateAiGatewayRequest {
  name: string;
  url: string;
  apiKey: string;
}

export interface UpdateAiGatewayRequest {
  name?: string;
  url?: string;
  apiKey?: string;
  isActive?: boolean;
}

export interface ModelRegistryDto {
  id: string;
  name: string | null;
  gatewayId: string;
  gatewayName: string | null;
  modelIdentifier: string | null;
  classification: string | null;      
  classificationId: string | null;   
  groupIds: string[] | null;
  isActive: boolean;
  contextLength: number;
}

export interface CreateModelRegistryRequest {
  name: string;
  gatewayId: string;
  modelIdentifier: string;
  classificationId: string;          
  groupIds?: string[];
  contextLength: number;
}

export interface UpdateModelRegistryRequest {
  name?: string;
  gatewayId: string;
  modelIdentifier?: string;
  classificationId?: string;         
  isActive?: boolean;
  groupIds?: string[];
  contextLength: number;
}

export interface ModelClassificationDto {
  id: string; 
  displayName: string; 
}

export interface ModelRegistryListParams {
  classification?: string;
  activeOnly?: boolean; // API defaults this to true server-side
}


export interface ModelUsageItemDto {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  usedAs: string;
}
export interface ModelUsageDto {
  inUse: boolean;
  usages: ModelUsageItemDto[];
}
