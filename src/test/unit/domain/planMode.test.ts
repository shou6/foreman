import * as assert from 'assert';
import { modeAfterDecision } from '../../../domain/planMode';
import { approvalKindOf } from '../../../domain/status';

suite('planMode: 承認の結果で承認方式が変わる', () => {
  test('ExitPlanMode を許可すると、プランモードを抜けて default に戻る', () => {
    assert.strictEqual(modeAfterDecision('plan', 'ExitPlanMode', { behavior: 'allow' }), 'default');
  });

  test('SDK の提案（編集の自動許可）ごと許可した時は acceptEdits', () => {
    assert.strictEqual(
      modeAfterDecision('plan', 'ExitPlanMode', {
        behavior: 'allow-always',
        permissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
      }),
      'acceptEdits'
    );
  });

  test('EnterPlanMode を許可するとプランモードに入る。拒否やほかのツールでは変わらない', () => {
    assert.strictEqual(
      modeAfterDecision('default', 'EnterPlanMode', { behavior: 'allow' }),
      'plan'
    );
    assert.strictEqual(
      modeAfterDecision('plan', 'ExitPlanMode', { behavior: 'deny', message: 'no' }),
      'plan'
    );
    assert.strictEqual(modeAfterDecision('default', 'Bash', { behavior: 'allow' }), 'default');
  });

  test('ExitPlanMode の承認カードは「計画」の種類になる', () => {
    assert.strictEqual(approvalKindOf('ExitPlanMode'), 'plan');
  });
});
