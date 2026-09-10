/** Contract for future workflow runners. No tax/payroll engine is implied. */
export type WorkflowStepKind = 'automatic' | 'manual' | 'approval' | 'conditional';
export type WorkflowVersion = {
  id: string;
  workflowId: string;
  version: number;
  publishedAt: string | null;
  steps: readonly { id: string; name: string; kind: WorkflowStepKind; dependsOn: readonly string[] }[];
};
export type WorkflowRun = {
  id: string;
  organizationId: string;
  workflowVersionId: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
  correlationId: string;
};
export function assertWorkflowVersionEditable(version: WorkflowVersion) {
  if (version.publishedAt) throw new Error('Crie uma nova versão para alterar um workflow publicado.');
}
