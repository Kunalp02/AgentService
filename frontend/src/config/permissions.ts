
export const PERMISSIONS = {
  Group: { View: '1', Add: '2', Edit: '3', Delete: '4' },
  RoleProfile: { View: '5', Manage: '6' },
  RoleAttribute: { View: '7', Manage: '8' },
  Users: { View: '9', Approve: '10', Manage: '11' },
  KnowledgeBase: { View: '150', Create: '151', Edit: '152', Delete: '153', Ingest: '154' },
  Strategy: { View: '155', Create: '156', Edit: '157', Delete: '158' },
  RemoteTools: { View: '50', Add: '51', Edit: '52', Delete: '53', Test: '54', Sync: '55', Invoke: '104' },
  LocalTools: { View: '56', Create: '57', Manage: '58' },
  Models: { View: '29', Create: '30', Edit: '31', Delete: '32' },
  Agent: { View: '200', Create: '201', Edit: '202', Delete: '203', Publish: '204' },
  WorkFlow: { View: '38', Add: '39', Edit: '40', Delete: '41' },
  ML: { View: '42', Add: '43', Edit: '44', Delete: '45' },
  Gateway: { View: '100', Manage: '101' },
  ModelRegistry: { View: '102', Manage: '103' },
  Testing: { Test1: '251', Test2: '252', Test3: '523' },
} as const;
