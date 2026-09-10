import { describe, it, expect } from 'vitest';
import {
  validateWorkflowGraph,
  canTransitionWorkflowStep,
  workflowProgress,
  processHealth,
  validateOccurrence,
  canApproveProcess,
  canCompleteProcess,
  compareCompetenceOccurrences,
  maskCpf,
  type WorkflowVersion,
} from './workflows';
describe('workflow engine', () => {
  const steps = (values: WorkflowVersion['steps']) => values;
  it('accepts parallel DAGs and rejects cycles or unknown dependencies', () => {
    expect(
      validateWorkflowGraph(
        steps([
          { id: 'a', name: 'A', kind: 'manual', dependsOn: [] },
          { id: 'b', name: 'B', kind: 'manual', dependsOn: ['a'] },
          { id: 'c', name: 'C', kind: 'manual', dependsOn: ['a'] },
          { id: 'd', name: 'D', kind: 'approval', dependsOn: ['b', 'c'] },
        ]),
      ),
    ).toEqual([]);
    expect(
      validateWorkflowGraph(
        steps([
          { id: 'a', name: 'A', kind: 'manual', dependsOn: ['b'] },
          { id: 'b', name: 'B', kind: 'manual', dependsOn: ['a'] },
        ]),
      ),
    ).toContain('O workflow não pode conter ciclos.');
    expect(
      validateWorkflowGraph(steps([{ id: 'a', name: 'A', kind: 'manual', dependsOn: ['missing'] }]))[0],
    ).toContain('não existe');
  });
  it('enforces valid transitions and dependency gates', () => {
    expect(canTransitionWorkflowStep('ready', 'in_progress')).toBe(true);
    expect(canTransitionWorkflowStep('pending', 'completed')).toBe(false);
    expect(canTransitionWorkflowStep('ready', 'completed', false)).toBe(false);
    expect(canTransitionWorkflowStep('completed', 'in_progress')).toBe(false);
  });
  it('reports transparent required-step progress', () =>
    expect(
      workflowProgress([
        { required: true, status: 'completed' },
        { required: true, status: 'ready' },
        { required: true, status: 'skipped' },
        { required: false, status: 'ready' },
      ]),
    ).toEqual({ completed: 1, applicable: 2, percentage: 50 }));
});
describe('DP deterministic rules', () => {
  it('derives health from facts', () => {
    expect(processHealth({ status: 'blocked', dueAt: null })).toBe('blocked');
    expect(processHealth({ status: 'in_progress', dueAt: '2026-09-01', now: new Date('2026-09-02') })).toBe(
      'overdue',
    );
    expect(processHealth({ status: 'ready', dueAt: '2026-09-03', now: new Date('2026-09-02') })).toBe(
      'at_risk',
    );
    expect(processHealth({ status: 'ready', dueAt: null, blockingErrors: 1 })).toBe('attention');
  });
  it('validates occurrences without legal calculations', () => {
    expect(
      validateOccurrence({ type: 'vacation', effectiveDate: '2026-09-10', competence: '2026-09' }).map(
        (i) => i.ruleId,
      ),
    ).toEqual(['occurrence.employee.required']);
    expect(
      validateOccurrence({ type: 'admission', effectiveDate: '2026-10-01', competence: '2026-09' }).map(
        (i) => i.ruleId,
      ),
    ).toEqual(['occurrence.date.competence']);
  });
  it('enforces four-eyes and completion gates', () => {
    expect(
      canApproveProcess({ preparedBy: 'a', reviewer: 'a', requireDistinctReviewer: true, blockingErrors: 0 }),
    ).toBe(false);
    expect(
      canApproveProcess({ preparedBy: 'a', reviewer: 'b', requireDistinctReviewer: true, blockingErrors: 0 }),
    ).toBe(true);
    expect(canCompleteProcess({ requiredStepsIncomplete: 0, blockingErrors: 0, approved: true })).toBe(true);
    expect(canCompleteProcess({ requiredStepsIncomplete: 1, blockingErrors: 0, approved: true })).toBe(false);
  });
  it('compares competencies and masks CPF', () => {
    expect(compareCompetenceOccurrences(['admission', 'vacation'], ['vacation', 'vacation'])).toContainEqual({
      type: 'admission',
      current: 1,
      previous: 0,
      difference: 1,
    });
    expect(maskCpf('529.982.247-25')).toBe('***.***.***-25');
    expect(maskCpf('invalid')).toBe('CPF protegido');
  });
});
