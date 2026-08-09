import {
  expireOverdueAssignments,
  type Deps,
  type ExpireReport,
} from '../services/assignment'
import { createLogger } from '../lib/logger'

/**
 * Тик эскалации. Вся логика — в `expireOverdueAssignments`; здесь только
 * вызов и лог. Дедлайны лежат в `Assignment.dueAt`, поэтому тик не помнит
 * ничего между запусками и переживает любой рестарт процесса.
 */

const log = createLogger('ticker:escalate')

export async function runEscalationTick(deps: Deps): Promise<ExpireReport> {
  const report = await expireOverdueAssignments(deps)
  if (report.expired > 0) {
    log.info('Просроченные разобраны', report)
  } else {
    log.debug('Просроченных нет')
  }
  return report
}
