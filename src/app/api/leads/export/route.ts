import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/db/client'
import { isAuthenticated } from '@/lib/auth'
import { bigintToString } from '@/lib/serialize'
import {
  ASSIGNMENT_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  formatStamp,
  toDateInputValue,
} from '@/components/format'
import { leadWhere, parseLeadFilters } from '@/app/leads/filters'

export const dynamic = 'force-dynamic'

/** Потолок выгрузки: демо-база меньше, но руками собранный фильтр не должен вешать процесс. */
const MAX_ROWS = 20_000

const COLUMNS = [
  'ID',
  'Создана',
  'Контакт',
  'Telegram ID',
  'Username',
  'Телефон',
  'Категория',
  'Срочность',
  'Статус',
  'Взял',
  'Взята в',
  'Время до «Беру», с',
  'Закрыта',
  'Попыток',
  'Цепочка',
  'Комментарий',
] as const

/**
 * Excel по-русски открывает CSV только если разделитель — точка с запятой,
 * а кодировка помечена BOM. Иначе кириллица превращается в кракозябры,
 * а вся строка садится в один столбец.
 */
const SEPARATOR = ';'
const BOM = '\uFEFF'

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[";\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function line(values: readonly (string | number | null | undefined)[]): string {
  return values.map(cell).join(SEPARATOR)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(new URL('/login', request.nextUrl.origin))
  }

  const filters = parseLeadFilters(request.nextUrl.searchParams)

  const leads = await prisma.lead.findMany({
    where: leadWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    select: {
      id: true,
      createdAt: true,
      contactTgId: true,
      contactName: true,
      contactUser: true,
      contactPhone: true,
      category: true,
      urgency: true,
      comment: true,
      status: true,
      takenAt: true,
      closedAt: true,
      takenBy: { select: { name: true } },
      assignments: {
        orderBy: { attempt: 'asc' },
        select: {
          attempt: true,
          sentAt: true,
          status: true,
          manager: { select: { name: true } },
        },
      },
    },
  })

  const rows = leads.map((lead) =>
    line([
      lead.id,
      formatStamp(lead.createdAt),
      lead.contactName,
      // BigInt в CSV не отдаётся сам — только строкой.
      bigintToString(lead.contactTgId),
      lead.contactUser ? `@${lead.contactUser}` : '',
      lead.contactPhone,
      lead.category,
      lead.urgency,
      LEAD_STATUS_LABEL[lead.status],
      lead.takenBy?.name ?? '',
      lead.takenAt ? formatStamp(lead.takenAt) : '',
      lead.takenAt ? Math.round((lead.takenAt.getTime() - lead.createdAt.getTime()) / 1000) : '',
      lead.closedAt ? formatStamp(lead.closedAt) : '',
      lead.assignments.length,
      lead.assignments
        .map(
          (assignment) =>
            `${assignment.attempt}. ${assignment.manager.name} — ${
              ASSIGNMENT_STATUS_LABEL[assignment.status]
            } (${formatStamp(assignment.sentAt)})`,
        )
        .join(' | '),
      lead.comment ?? '',
    ]),
  )

  const csv = `${BOM}${[line(COLUMNS), ...rows].join('\r\n')}\r\n`
  const filename = `leads-${toDateInputValue(new Date())}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
      'X-Rows': String(rows.length),
    },
  })
}
