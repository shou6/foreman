import {
  levelOf,
  PLAN_USAGE_ITEMS,
  planUsageEntries,
  untilReset,
  type PlanUsageEntry,
  type PlanUsageItem,
  type RateLimits,
} from '../../domain/rateLimits';
import { formatTokens } from '../../domain/usage';
import { Icon, STATUS_ICONS } from '../icons';
import type { FromSidebar, SidebarItem, SidebarState } from '../sidebarProtocol';

interface SidebarProps {
  state: SidebarState | undefined;
  post: (message: FromSidebar) => void;
}

/** 左サイドバーの一覧。状態ごとのグループにタスクを並べ、クリックで開く。右クリックは VS Code のメニュー */
export function Sidebar({ state, post }: SidebarProps) {
  if (state === undefined) {
    return null;
  }
  const { strings } = state;
  return (
    <div class="sidebar">
      <div class="list">
        <button class="new-task" onClick={() => post({ type: 'newTask' })}>
          {strings.newTask}
        </button>
        {state.groups.length === 0 && <div class="empty">{strings.empty}</div>}
        {state.groups.map((group) => (
          <details key={group.key} class="group" data-group={group.key} open={group.key !== 'done'}>
            <summary class="group-head">
              <span class="group-title">{strings.groups[group.key]}</span>
              <span class="count">{group.items.length}</span>
            </summary>
            {group.items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                active={item.id === state.activeTaskId}
                strings={strings}
                post={post}
              />
            ))}
          </details>
        ))}
      </div>
      <div class="footer">
        {state.rateLimits !== undefined && (
          <RateLimitsView
            limits={state.rateLimits}
            items={state.planUsageItems ?? PLAN_USAGE_ITEMS}
            now={state.now ?? state.rateLimits.fetchedAt}
            strings={strings.rateLimits}
          />
        )}
        <div class="today">
          <span>{strings.today}</span>
          <span class="today-text">{formatTokens(state.today)}</span>
        </div>
      </div>
    </div>
  );
}

interface RateLimitsProps {
  limits: RateLimits;
  items: readonly PlanUsageItem[];
  now: string;
  strings: SidebarState['strings']['rateLimits'];
}

/** 契約の利用枠。設定で選んだ項目（5 時間枠・7 日枠・モデル別）をメーターで出す */
function RateLimitsView({ limits, items, now, strings }: RateLimitsProps) {
  const entries = planUsageEntries(limits, items);
  if (entries.length === 0) {
    return null;
  }
  const resets = (entry: PlanUsageEntry): string | undefined => {
    const minutes = untilReset(entry.resetsAt, now);
    if (minutes === undefined) {
      return undefined;
    }
    const text =
      minutes >= 60
        ? strings.hoursMinutes
            .replace('{0}', String(Math.floor(minutes / 60)))
            .replace('{1}', String(minutes % 60))
        : strings.minutes.replace('{0}', String(minutes));
    return strings.resetsIn.replace('{0}', text);
  };
  const fetched = new Date(limits.fetchedAt);
  const stamp = Number.isNaN(fetched.getTime())
    ? limits.fetchedAt
    : `${String(fetched.getHours()).padStart(2, '0')}:${String(fetched.getMinutes()).padStart(2, '0')}`;
  const labelOf = (entry: PlanUsageEntry): string =>
    entry.kind === 'fiveHour'
      ? strings.fiveHour
      : entry.kind === 'sevenDay'
        ? strings.sevenDay
        : (entry.name ?? '');
  return (
    <div class="limits" title={strings.fetchedAt.replace('{0}', stamp)}>
      <div class="limits-title">{strings.title}</div>
      {entries.map((entry) => (
        <div
          class="limit"
          key={`${entry.kind}:${entry.name ?? ''}`}
          data-level={levelOf(entry.utilization)}
        >
          <div class="limit-head">
            <span>{labelOf(entry)}</span>
            <span class="limit-text">
              {entry.utilization}%
              {resets(entry) !== undefined && <span class="limit-reset"> · {resets(entry)}</span>}
            </span>
          </div>
          <span class="meter-bar">
            <span class="meter-fill" style={`width: ${entry.utilization}%`} />
          </span>
        </div>
      ))}
    </div>
  );
}

interface RowProps {
  item: SidebarItem;
  active: boolean;
  strings: SidebarState['strings'];
  post: (message: FromSidebar) => void;
}

function TaskRow({ item, active, strings, post }: RowProps) {
  const context = JSON.stringify({
    webviewSection: 'task',
    taskId: item.id,
    foremanStatus: item.status,
    foremanOpen: item.turnOpen,
    foremanWorktree: item.worktree,
    foremanMergeable: item.mergeable,
    foremanUnapprovable: item.unapprovable,
    preventDefaultContextMenuItems: true,
  });
  return (
    <div
      class={active ? 'task active' : 'task'}
      data-task={item.id}
      data-vscode-context={context}
      onClick={() => post({ type: 'open', id: item.id })}
    >
      <div class="task-line">
        <Icon name={STATUS_ICONS[item.kind]} extra="status-icon" data-kind={item.kind} />
        <span class="task-title" title={item.title}>
          {item.title}
        </span>
        <Badge badge={item.badge} strings={strings} />
      </div>
      {(item.branch !== undefined || item.files > 0) && (
        <div class="task-sub">
          {item.branch !== undefined && <span class="branch">{item.branch}</span>}
          {item.branch !== undefined && item.files > 0 && <span class="sep">·</span>}
          {item.files > 0 && (
            <span class="files">{strings.files.replace('{0}', String(item.files))}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({
  badge,
  strings,
}: {
  badge: SidebarItem['badge'];
  strings: SidebarState['strings'];
}) {
  switch (badge.kind) {
    case 'elapsed':
      return (
        <span class="badge elapsed">{strings.minutes.replace('{0}', String(badge.minutes))}</span>
      );
    case 'review':
      return <span class="badge review">{strings.files.replace('{0}', String(badge.files))}</span>;
    case 'ago':
      return (
        <span class="ago">
          {strings.ago[badge.ago.unit].replace('{0}', String(badge.ago.value))}
        </span>
      );
    default:
      return <span class={`badge ${badge.kind}`}>{strings.badges[badge.kind]}</span>;
  }
}
