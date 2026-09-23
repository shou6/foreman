import { formatTokens } from '../../domain/usage';
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
      <button class="new-task" onClick={() => post({ type: 'newTask' })}>
        {strings.newTask}
      </button>
      {state.groups.length === 0 && <div class="empty">{strings.empty}</div>}
      {state.groups.map((group) => (
        <details key={group.key} class="group" data-group={group.key} open={group.key !== 'done'}>
          <summary class="group-head">
            <span class="dot" data-status={group.key} />
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
      {state.context !== undefined && (
        <div class="context">
          <div class="context-head">
            <span>{strings.context}</span>
            <span class="context-text">
              {state.context.window === undefined
                ? formatTokens(state.context.used)
                : `${formatTokens(state.context.used)} / ${formatTokens(state.context.window)}`}
            </span>
          </div>
          <span class="meter-bar">
            <span
              class="meter-fill"
              style={`width: ${Math.round((state.context.ratio ?? 0) * 100)}%`}
            />
          </span>
        </div>
      )}
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
        <span class="dot" data-status={item.status} />
        <span class="task-title" title={item.title}>
          {item.title}
        </span>
        <Badge badge={item.badge} strings={strings} />
      </div>
      <div class="task-sub">
        {item.branch !== undefined && <span class="branch">{item.branch}</span>}
        {item.branch !== undefined && <span class="sep">·</span>}
        <span class="files">{strings.files.replace('{0}', String(item.files))}</span>
      </div>
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
    default:
      return <span class={`badge ${badge.kind}`}>{strings.badges[badge.kind]}</span>;
  }
}
