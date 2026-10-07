
import { localToolsApi } from './localToolsApi';
import { remoteToolsApi } from './remoteToolsApi';

export const toolsApi = {
  getLocalTools: (page = 1, pageSize = 25) => localToolsApi.list({ page, pageSize }),
  createLocalTool: (data: Parameters<typeof localToolsApi.submit>[0]) => localToolsApi.submit(data),
  getRemoteTools: (page = 1, pageSize = 25) => remoteToolsApi.list({ page, pageSize }),
  createRemoteTool: (data: Parameters<typeof remoteToolsApi.create>[0]) => remoteToolsApi.create(data),
};
